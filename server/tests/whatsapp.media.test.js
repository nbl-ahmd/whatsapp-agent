import test, { after } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret } from "../src/lib/crypto.js";
import { prisma } from "../src/db/prisma.js";
import { listConversationMessages } from "../src/services/messages/service.js";
import { listApprovedTemplates } from "../src/services/whatsapp/accounts.js";
import { openMessageMedia } from "../src/services/whatsapp/media.js";

process.env.ENCRYPTION_KEY ??= "test-encryption-key";

const suffix = Math.random().toString(36).slice(2, 8);
const createdOrganizations = [];

after(async () => {
  for (const organizationId of createdOrganizations) {
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => null);
  }
  await prisma.$disconnect();
});

async function createTenant(label) {
  const organization = await prisma.organization.create({
    data: { name: `Media ${label}`, slug: `media-test-${label}-${suffix}` },
  });
  createdOrganizations.push(organization.id);

  const account = await prisma.whatsAppAccount.create({
    data: {
      organizationId: organization.id,
      name: `Media account ${label}`,
      wabaId: `WABA_MEDIA_${label}_${suffix}`,
      accessToken: encryptSecret(`media-token-${label}`),
      status: "ACTIVE",
    },
  });

  const number = await prisma.whatsAppPhoneNumber.create({
    data: {
      organizationId: organization.id,
      whatsappAccountId: account.id,
      phoneNumberId: `media-number-${label}-${suffix}`,
      displayPhoneNumber: "+15550199",
      status: "CONNECTED",
    },
  });

  const contact = await prisma.contact.create({
    data: { organizationId: organization.id, waId: `15550199${label}`, phone: "+15550199" },
  });

  const conversation = await prisma.conversation.create({
    data: {
      organizationId: organization.id,
      contactId: contact.id,
      phoneNumberId: number.id,
    },
  });

  return { organization, account, number, contact, conversation };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("inbound media streams through the tenant's token and never exposes it", async (t) => {
  const tenant = await createTenant("image");
  const message = await prisma.message.create({
    data: {
      organizationId: tenant.organization.id,
      conversationId: tenant.conversation.id,
      contactId: tenant.contact.id,
      phoneNumberId: tenant.number.id,
      direction: "inbound",
      type: "image",
      status: "received",
      externalMessageId: `wamid.media.${suffix}`,
      media: {
        id: `media-${suffix}`,
        mime_type: "image/png",
        caption: "A photo",
      },
      text: "A photo",
    },
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const headers = options.headers ?? {};
    calls.push({
      url: String(url),
      authorization: headers.authorization ?? headers.Authorization,
    });

    if (String(url).includes(`/media-${suffix}`)) {
      return Response.json({
        id: `media-${suffix}`,
        url: "https://lookaside.example.test/file",
        mime_type: "image/png",
        file_size: 7,
      });
    }

    return new Response(Buffer.from("PNGDATA"), {
      status: 200,
      headers: { "content-type": "image/png", "content-length": "7" },
    });
  };

  const result = await openMessageMedia({
    organizationId: tenant.organization.id,
    messageId: message.id,
  });

  assert.equal(result.contentType, "image/png");
  assert.equal(result.contentLength, 7);
  assert.equal(result.disposition, "inline");
  assert.match(result.filename, /\.png$/);

  const bytes = await streamToBuffer(result.stream);
  assert.equal(bytes.toString(), "PNGDATA");

  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, "Bearer media-token-image");
  assert.equal(calls[1].authorization, "Bearer media-token-image");
  assert.match(calls[0].url, /phone_number_id=media-number-image/);
});

test("media is tenant-scoped and expired media becomes a 404", async () => {
  const owner = await createTenant("owner");
  const stranger = await createTenant("stranger");

  const message = await prisma.message.create({
    data: {
      organizationId: owner.organization.id,
      conversationId: owner.conversation.id,
      contactId: owner.contact.id,
      phoneNumberId: owner.number.id,
      direction: "inbound",
      type: "document",
      status: "received",
      externalMessageId: `wamid.expired.${suffix}`,
      media: { id: `media-expired-${suffix}`, mime_type: "application/pdf" },
    },
  });

  await assert.rejects(
    () =>
      openMessageMedia({
        organizationId: stranger.organization.id,
        messageId: message.id,
      }),
    /Message not found/,
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: { message: "Media not found", code: 100 } },
      { status: 404 },
    );

  try {
    await assert.rejects(
      () =>
        openMessageMedia({
          organizationId: owner.organization.id,
          messageId: message.id,
        }),
      /no longer available/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("templates load for the selected number's WABA", async () => {
  const tenant = await createTenant("templates");
  const originalFetch = globalThis.fetch;
  let requestedUrl = null;

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      data: [
        {
          id: "tpl_1",
          name: "order_update",
          status: "APPROVED",
          category: "UTILITY",
          language: "en_US",
          components: [{ type: "BODY", text: "Hi {{1}}" }],
        },
        {
          id: "tpl_2",
          name: "draft_promo",
          status: "PENDING",
          category: "MARKETING",
          language: "en_US",
          components: [],
        },
      ],
    });
  };

  try {
    const result = await listApprovedTemplates({
      organizationId: tenant.organization.id,
      phoneNumberId: tenant.number.phoneNumberId,
    });

    assert.equal(result.wabaId, tenant.account.wabaId);
    assert.equal(result.templates.length, 1);
    assert.equal(result.templates[0].name, "order_update");
    assert.match(requestedUrl, new RegExp(`/${tenant.account.wabaId}/message_templates`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conversation history returns the newest page oldest-first", async () => {
  const tenant = await createTenant("history");
  const base = Date.now() - 60_000;

  for (let index = 0; index < 6; index += 1) {
    await prisma.message.create({
      data: {
        organizationId: tenant.organization.id,
        conversationId: tenant.conversation.id,
        contactId: tenant.contact.id,
        phoneNumberId: tenant.number.id,
        direction: index % 2 === 0 ? "inbound" : "outbound",
        type: "text",
        status: "received",
        text: `message ${index}`,
        externalMessageId: `wamid.history.${suffix}.${index}`,
        timestamp: new Date(base + index * 1000),
      },
    });
  }

  const page = await listConversationMessages({
    organizationId: tenant.organization.id,
    conversationId: tenant.conversation.id,
    take: 2,
  });

  assert.deepEqual(
    page.map((row) => row.text),
    ["message 4", "message 5"],
  );
});
