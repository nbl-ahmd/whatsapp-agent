import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { asString } from "../../lib/validate.js";
import { handleWhatsAppWebhook } from "../webhooks/process.js";
import { PROVIDER_MODE } from "../messages/outbound.js";

/**
 * Inject a Meta-shaped inbound message for a simulator number.
 *
 * This goes through the real webhook pipeline (event persistence, tenant
 * resolution, contact/conversation/message creation, queue), so it proves the
 * whole receive path without needing a Meta delivery. It is deliberately
 * limited to simulator numbers so it can never fabricate traffic on a live
 * WhatsApp number.
 */
export async function simulateInboundMessage({
  organizationId,
  phoneNumberId,
  from,
  text,
  profileName = null,
}) {
  const numberId = asString(phoneNumberId, "phoneNumberId", { max: 64 });
  const waId = asString(from, "from", { required: true, max: 32 }).replace(/[^\d]/g, "");
  if (!waId) throw new ValidationError("from must contain a phone number");

  const body = asString(text, "text", { required: true, max: 4096 });

  const phoneNumber = await prisma.whatsAppPhoneNumber.findFirst({
    where: {
      organizationId,
      ...(numberId ? { OR: [{ id: numberId }, { phoneNumberId: numberId }] } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { whatsappAccount: true },
  });
  if (!phoneNumber) throw new NotFoundError("WhatsApp phone number not found");

  if (phoneNumber.providerMode !== PROVIDER_MODE.SIMULATOR) {
    throw new ValidationError(
      "Inbound simulation is only available for simulator numbers. Send a real WhatsApp message to your Meta test number instead.",
    );
  }

  const externalMessageId = `wamid.sim.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: phoneNumber.whatsappAccount.wabaId ?? "simulator",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: phoneNumber.displayPhoneNumber,
                phone_number_id: phoneNumber.phoneNumberId,
              },
              contacts: [
                {
                  profile: { name: asString(profileName, "profileName", { max: 120 }) ?? "Test contact" },
                  wa_id: waId,
                },
              ],
              messages: [
                {
                  from: waId,
                  id: externalMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const rawBody = JSON.stringify(payload);
  const result = await handleWhatsAppWebhook({
    rawBody,
    payload,
    headers: { "x-simulated-inbound": "true" },
  });

  const message = await prisma.message.findUnique({
    where: { externalMessageId },
    select: { id: true, conversationId: true, contactId: true },
  });

  return {
    ...result,
    externalMessageId,
    message,
  };
}
