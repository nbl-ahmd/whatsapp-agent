import { env } from "../config/env.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../lib/errors.js";
import { prisma } from "../db/prisma.js";
import { sendTextMessage } from "../services/messages/outbound.js";
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
  const text = body.text;
  if (!to || !text) throw new ValidationError("to and text are required");

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

  const result = await sendTextMessage({
    organizationId,
    phoneNumberId,
    to: String(to),
    text: String(text),
  });

  return created(res, {
    message: {
      id: result.message.id,
      direction: result.message.direction,
      status: result.message.status,
      externalMessageId: result.message.externalMessageId,
      text: result.message.text,
      conversationId: result.message.conversationId,
      contactId: result.message.contactId,
    },
    provider: result.providerResponse,
  });
}
