import { Readable } from "node:stream";
import { prisma } from "../../db/prisma.js";
import { ExternalServiceError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { getMetaConfig } from "../settings/index.js";
import { resolveAccessTokenForAccount } from "./credentials.js";
import { getMedia } from "./meta-client.js";

/**
 * Inbound media proxy.
 *
 * Meta webhooks only give us a media id. The bytes sit behind a short-lived
 * lookaside URL that requires the access token, so the browser can never read
 * them directly. This service resolves the id with the tenant's own token and
 * streams the bytes back through an authenticated API route; the token never
 * leaves the server.
 */

const DOWNLOAD_TIMEOUT_MS = 20000;

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/amr": ".amr",
  "audio/ogg": ".ogg",
  "application/pdf": ".pdf",
};

function mediaIdOf(message) {
  const media = message?.media;
  if (!media || typeof media !== "object" || Array.isArray(media)) return null;
  return typeof media.id === "string" && media.id.trim() ? media.id.trim() : null;
}

function extensionFor(contentType, filename) {
  if (filename?.includes(".")) return "";
  const normalized = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXTENSIONS[normalized] ?? "";
}

function contentDisposition(disposition, filename) {
  const fallback = String(filename)
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Locate a media message inside a tenant and return a readable stream.
 *
 * @param {{ organizationId: string, messageId: string, download?: boolean }} params
 * @returns {Promise<{ stream: Readable, contentType: string, contentLength: number|null, filename: string, disposition: string }>}
 */
export async function openMessageMedia({ organizationId, messageId, download = false }) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId },
    include: {
      phoneNumber: { include: { whatsappAccount: true } },
    },
  });

  if (!message) throw new NotFoundError("Message not found");

  const mediaId = mediaIdOf(message);
  if (!mediaId) {
    throw new NotFoundError("This message does not have downloadable media");
  }

  const token = await resolveAccessTokenForAccount(message.phoneNumber?.whatsappAccount);
  if (!token) {
    throw new ValidationError("No WhatsApp access token is configured for this number");
  }

  const meta = await getMetaConfig({ organizationId });

  let metadata;
  try {
    metadata = await getMedia(mediaId, {
      accessToken: token,
      phoneNumberId: message.phoneNumber?.phoneNumberId,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    });
  } catch (error) {
    if (error?.details?.status === 404) {
      throw new NotFoundError("This media is no longer available from Meta (media expires).");
    }
    throw error;
  }

  if (!metadata?.url) {
    throw new ExternalServiceError("Meta did not return a media download URL");
  }

  let upstream;
  try {
    upstream = await fetch(metadata.url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(`Could not download the media file: ${error.message}`);
  }

  if (!upstream.ok) {
    logger.warn("Media download rejected by Meta", {
      messageId,
      status: upstream.status,
    });
    if (upstream.status === 404) {
      throw new NotFoundError("This media is no longer available from Meta (media expires).");
    }
    throw new ExternalServiceError(`Meta media download failed with status ${upstream.status}`);
  }

  const upstreamType =
    upstream.headers.get("content-type") || metadata.mime_type || "application/octet-stream";
  const baseType = upstreamType.split(";")[0].trim().toLowerCase();

  // Only render formats that cannot execute script in the API origin. Anything
  // else (HTML, SVG, unknown uploads) is forced to a download.
  const safeInline =
    /^(image\/(jpeg|png|webp|gif)|video\/|audio\/|application\/pdf|text\/plain)$/.test(baseType);

  const contentType = safeInline ? upstreamType : "application/octet-stream";
  const storedFilename =
    typeof message.media?.filename === "string" ? message.media.filename : null;
  const filename = storedFilename || `${message.id}${extensionFor(baseType, storedFilename)}`;
  const lengthHeader = upstream.headers.get("content-length");
  const contentLength = lengthHeader ? Number(lengthHeader) : null;

  return {
    stream: upstream.body ? Readable.fromWeb(upstream.body) : Readable.from([]),
    contentType,
    contentLength: Number.isFinite(contentLength) ? contentLength : null,
    filename,
    disposition: download || !safeInline ? "attachment" : "inline",
  };
}

export { contentDisposition };
