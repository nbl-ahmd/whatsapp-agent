import { env } from "../config/env.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { asEnum } from "../lib/validate.js";
import { prisma } from "../db/prisma.js";
import { MESSAGE_TYPES, sendMessage as sendOutboundMessage } from "../services/messages/outbound.js";
import { contentDisposition, openMessageMedia } from "../services/whatsapp/media.js";
import { created } from "../utils/http.js";

/**
 * POST /api/whatsapp/messages
 *
 * Two ways in:
 *  - a signed-in operator (the tenant comes from the session token), or
 *  - a server-to-server caller holding WHATSAPP_TEST_API_KEY (the tenant comes
 *    from the body, because the caller proved it holds the shared secret).
 *
 * The browser is never allowed to pick its own organization id: it must have a
 * session, and then the body's organizationId - if present - is ignored.
 */
function requireServerAccess(req) {
  const expected = env.meta.testApiKey;
  if (expected) {
    if (req.get("x-test-api-key") !== expected) {
      throw new UnauthorizedError("Invalid or missing x-test-api-key header");
    }
    return;
  }
  if (env.isProduction) throw new NotFoundError("Not found");
}

export async function sendMessage(req, res) {
  const body = req.body ?? {};
  const to = body.to;
  if (!to) throw new ValidationError("to is required");

  const type = asEnum(body.type, "type", MESSAGE_TYPES, { fallback: "text" });

  let organizationId = req.auth?.organizationId ?? null;
  let phoneNumberId = body.phoneNumberId ?? null;

  if (!organizationId) {
    requireServerAccess(req);
    organizationId = body.organizationId;
    if (!organizationId) throw new ValidationError("organizationId is required");
  }

  // Default to the organization's first connected number when none is given.
  if (!phoneNumberId) {
    const number = await prisma.whatsAppPhoneNumber.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
    if (!number) throw new ValidationError("phoneNumberId is required (no number on this organization)");
    phoneNumberId = number.phoneNumberId;
  }

  const result = await sendOutboundMessage({
    organizationId,
    phoneNumberId,
    to: String(to),
    type,
    text: body.text,
    previewUrl: body.previewUrl,
    media: body.media,
    template: body.template,
    interactive: body.interactive,
  });

  return created(res, {
    message: {
      id: result.message.id,
      direction: result.message.direction,
      type: result.message.type,
      status: result.message.status,
      externalMessageId: result.message.externalMessageId,
      text: result.message.text,
      media: result.message.media,
      template: result.message.template,
      conversationId: result.message.conversationId,
      contactId: result.message.contactId,
    },
    provider: result.providerResponse,
  });
}

/**
 * GET /api/whatsapp/media/:messageId
 *
 * Streams inbound media through the API using the tenant's access token. The
 * browser fetches this with its bearer token, so the Meta token is never
 * exposed and no public bucket is required.
 */
export async function media(req, res) {
  const result = await openMessageMedia({
    organizationId: req.auth.organizationId,
    messageId: req.params.messageId,
    download: req.query.download === "1" || req.query.download === "true",
  });

  res.status(200);
  res.setHeader("Content-Type", result.contentType);
  if (result.contentLength !== null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  res.setHeader("Content-Disposition", contentDisposition(result.disposition, result.filename));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");

  result.stream.on("error", (error) => {
    logger.warn("Media stream failed", { messageId: req.params.messageId, error: error.message });
    res.destroy(error);
  });
  result.stream.pipe(res);
}
