import { env } from "../config/env.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../lib/errors.js";
import { sendTextMessage } from "../services/messages/outbound.js";
import { created } from "../utils/http.js";

/**
 * POST /api/whatsapp/messages
 *
 * Phase 2 has no user auth yet, so this endpoint is protected by a shared
 * server-side key (WHATSAPP_TEST_API_KEY). It is disabled in production when the
 * key is not configured. The caller's tenant is trusted only because it holds
 * that server secret; real session-based auth/tenant isolation replaces this in
 * a later phase.
 */
function requireServerAccess(req) {
  const expected = env.meta.testApiKey;
  if (expected) {
    if (req.get("x-test-api-key") !== expected) {
      throw new UnauthorizedError("Invalid or missing x-test-api-key header");
    }
    return;
  }
  if (env.isProduction) {
    throw new NotFoundError("Not found");
  }
}

export async function sendMessage(req, res) {
  requireServerAccess(req);

  const { organizationId, phoneNumberId, to, text } = req.body ?? {};
  if (!organizationId || !phoneNumberId || !to || !text) {
    throw new ValidationError("organizationId, phoneNumberId, to and text are required");
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
  });
}
