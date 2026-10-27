import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { recordAudit } from "../../lib/audit.js";
import { getMetaConfig } from "../settings/index.js";
import { resolveMetaAccountContext } from "./context.js";
import { PROVIDER_MODE } from "../messages/outbound.js";
import { resolveAccessTokenForAccount } from "./credentials.js";
import {
  getPhoneNumber,
  getSubscribedApps,
  getTemplates,
  getWaba,
  subscribeApp,
} from "./service.js";

/**
 * "Is my WhatsApp wiring right?" checks.
 *
 * Each check is isolated: one failing Meta call must not hide the others. The
 * result contains no secret values, only flags, names and actionable fixes.
 */

function check(id, label, status, detail, fix = null) {
  return { id, label, status, detail, fix };
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function checkPhoneNumber({ phoneNumber, accessToken, meta }) {
  try {
    const response = await getPhoneNumber(phoneNumber.phoneNumberId, {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    });
    return check(
      "phone-number",
      "Phone number",
      "ok",
      `${response.display_phone_number ?? phoneNumber.displayPhoneNumber} · ${
        response.verified_name ?? phoneNumber.verifiedName ?? "unnamed"
      }`,
    );
  } catch (error) {
    return check(
      "phone-number",
      "Phone number",
      "error",
      error.message,
      "Check that the phone number id and access token belong to the same Meta app.",
    );
  }
}

async function checkWaba({ wabaId, accessToken, meta }) {
  try {
    const response = await getWaba(wabaId, {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    });
    return check(
      "waba",
      "WhatsApp Business Account",
      "ok",
      `${response.name ?? "unnamed"} · ${wabaId}`,
    );
  } catch (error) {
    return check(
      "waba",
      "WhatsApp Business Account",
      "error",
      error.message,
      "The WABA id and access token must belong to the same Meta app.",
    );
  }
}

async function checkTemplates({ wabaId, accessToken, meta }) {
  try {
    const response = await getTemplates(wabaId, {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
      limit: 1,
    });
    const count = Array.isArray(response?.data) ? response.data.length : 0;
    return check(
      "templates",
      "Template API",
      "ok",
      count > 0
        ? "Templates are readable."
        : "Readable; no templates exist yet for this WABA.",
    );
  } catch (error) {
    return check(
      "templates",
      "Template API",
      "error",
      error.message,
      "The token needs access to the WABA to list or create templates.",
    );
  }
}

async function checkSubscription({ wabaId, accessToken, meta }) {
  try {
    const response = await getSubscribedApps(wabaId, {
      accessToken,
      baseUrl: meta.graphApiBaseUrl,
      version: meta.graphApiVersion,
    });
    const apps = Array.isArray(response?.data) ? response.data : [];
    if (apps.length === 0) {
      return check(
        "subscription",
        "Webhook subscription",
        "warning",
        "No app is subscribed to this WABA yet.",
        "Press “Subscribe app” below (or subscribe from Meta → WhatsApp → Configuration).",
      );
    }
    return check(
      "subscription",
      "Webhook subscription",
      "ok",
      apps.map((app) => app.name ?? app.id).filter(Boolean).join(", ") || "Subscribed",
    );
  } catch (error) {
    return check(
      "subscription",
      "Webhook subscription",
      "warning",
      error.message,
      "Subscribe the app from Meta → WhatsApp → Configuration if this check cannot read it.",
    );
  }
}

/**
 * Run the local webhook handshake against the public callback URL. This proves
 * the endpoint is reachable and that the verify token Meta will send matches.
 */
export async function testWebhookHandshake({ organizationId, callbackUrl }) {
  const checks = [];
  const meta = await getMetaConfig({ organizationId });

  if (!meta.verifyToken) {
    checks.push(
      check(
        "handshake-token",
        "Webhook verify token",
        "error",
        "No verify token is stored.",
        "Add one in Settings → API credentials and paste the same value into Meta → WhatsApp → Configuration.",
      ),
    );
    return { ok: false, checks };
  }

  checks.push(check("handshake-token", "Webhook verify token", "ok", "Configured."));

  if (!callbackUrl) {
    checks.push(
      check(
        "handshake",
        "Webhook handshake",
        "warning",
        "No callback URL was supplied.",
        "Open Settings from the deployed API so it can derive its public URL.",
      ),
    );
    return { ok: false, checks };
  }

  const challenge = `test_${randomUUID()}`;
  let url;
  try {
    url = new URL(callbackUrl);
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", meta.verifyToken);
    url.searchParams.set("hub.challenge", challenge);
  } catch {
    checks.push(
      check("handshake", "Webhook handshake", "error", "Callback URL is not a valid URL."),
    );
    return { ok: false, checks };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    const ok = response.status === 200 && body === challenge;
    checks.push(
      check(
        "handshake",
        "Webhook handshake",
        ok ? "ok" : "error",
        ok
          ? "Endpoint accepted the verify token and returned the challenge."
          : `Endpoint answered ${response.status}: ${body.slice(0, 120) || "(empty body)"}`,
        ok
          ? null
          : "Check WHATSAPP_VERIFY_TOKEN / the stored verify token and that the callback URL points at this API.",
      ),
    );
    return { ok, checks };
  } catch (error) {
    checks.push(
      check(
        "handshake",
        "Webhook handshake",
        "error",
        error.message,
        "The API could not reach its own public URL. Check the deployment URL, TLS and any proxy rules.",
      ),
    );
    return { ok: false, checks };
  }
}

/**
 * Full connection report used by the Settings page. Optional warnings do not
 * make the report fail; only missing credentials and failed Meta calls do.
 */
export async function runWhatsAppDiagnostics({
  organizationId,
  phoneNumberId = null,
  callbackUrl = null,
}) {
  const checks = [];
  const meta = await getMetaConfig({ organizationId });

  checks.push(
    check(
      "access-token",
      "Access token",
      meta.accessToken ? "ok" : "error",
      meta.accessToken ? `Configured (source: ${meta.source.accessToken}).` : "No token stored.",
      meta.accessToken
        ? null
        : "Paste a Meta access token in Settings → API credentials (or in the connect form).",
    ),
  );
  checks.push(
    check(
      "app-secret",
      "App secret",
      meta.appSecret ? "ok" : "warning",
      meta.appSecret
        ? `Configured (source: ${meta.source.appSecret}).`
        : "No app secret stored; inbound webhooks are accepted without signature verification.",
      meta.appSecret
        ? null
        : "Copy App secret from Meta → App settings → Basic and save it in Settings → API credentials.",
    ),
  );
  checks.push(
    check(
      "verify-token",
      "Webhook verify token",
      meta.verifyToken ? "ok" : "error",
      meta.verifyToken
        ? `Configured (source: ${meta.source.verifyToken}).`
        : "No verify token stored.",
      meta.verifyToken
        ? null
        : "Pick any value, save it in Settings → API credentials, and paste the same value into Meta.",
    ),
  );

  const number = phoneNumberId
    ? await prisma.whatsAppPhoneNumber.findFirst({
        where: {
          organizationId,
          OR: [{ id: phoneNumberId }, { phoneNumberId }],
        },
        include: { whatsappAccount: true },
      })
    : await prisma.whatsAppPhoneNumber.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        include: { whatsappAccount: true },
      });

  if (!number) {
    checks.push(
      check(
        "number",
        "Connected number",
        "error",
        "No WhatsApp number is connected.",
        "Find and connect your test number in the section above.",
      ),
    );
  } else if (number.providerMode === PROVIDER_MODE.SIMULATOR) {
    checks.push(
      check(
        "number",
        "Connected number",
        "info",
        `${number.displayPhoneNumber} is a simulator number. Meta calls are skipped.`,
      ),
    );
  } else {
    const accessToken = await resolveAccessTokenForAccount(number.whatsappAccount);
    checks.push(
      check(
        "number",
        "Connected number",
        "ok",
        `${number.displayPhoneNumber} · ${number.whatsappAccount.name}`,
      ),
    );

    if (!accessToken) {
      checks.push(
        check(
          "meta-access",
          "Meta access",
          "error",
          "The number has no token and the organization has no fallback token.",
          "Save an access token in Settings → API credentials.",
        ),
      );
    } else {
      checks.push(await checkPhoneNumber({ phoneNumber: number, accessToken, meta }));

      if (!number.whatsappAccount.wabaId) {
        checks.push(
          check(
            "waba",
            "WhatsApp Business Account",
            "error",
            "This number has no WABA id.",
            "Reconnect the number from the connect form so its WABA is recorded.",
          ),
        );
      } else {
        const wabaId = number.whatsappAccount.wabaId;
        checks.push(await checkWaba({ wabaId, accessToken, meta }));
        checks.push(await checkTemplates({ wabaId, accessToken, meta }));
        checks.push(await checkSubscription({ wabaId, accessToken, meta }));
      }
    }
  }

  if (callbackUrl) {
    if (!callbackUrl.startsWith("https://")) {
      checks.push(
        check(
          "callback-url",
          "Callback URL",
          isLocalUrl(callbackUrl) ? "warning" : "error",
          callbackUrl,
          isLocalUrl(callbackUrl)
            ? "Meta needs a public HTTPS URL. Use a tunnel (cloudflared/ngrok) locally."
            : "Meta requires HTTPS. Configure TLS before adding this URL in Meta.",
        ),
      );
    } else {
      checks.push(check("callback-url", "Callback URL", "ok", callbackUrl));
    }
  }

  const handshake = await testWebhookHandshake({ organizationId, callbackUrl });
  checks.push(...handshake.checks);

  return {
    ok: !checks.some((entry) => entry.status === "error"),
    numberId: number?.id ?? null,
    wabaId: number?.whatsappAccount?.wabaId ?? null,
    callbackUrl,
    checks,
  };
}

function serializeApp(app) {
  return {
    id: app?.id ?? null,
    name: app?.name ?? null,
    link: app?.link ?? null,
  };
}

/** Which apps are subscribed to the WABA this number belongs to. */
export async function getWabaSubscription({ organizationId, phoneNumberId, wabaId = null }) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const response = await getSubscribedApps(context.wabaId, context.requestOptions);
  return {
    wabaId: context.wabaId,
    apps: (response?.data ?? []).map(serializeApp),
  };
}

/** Subscribe this app to the WABA so Meta starts delivering its webhooks. */
export async function subscribeWaba({ organizationId, phoneNumberId, wabaId = null, req = null }) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const response = await subscribeApp(context.wabaId, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.waba.subscribed",
    entityType: "WhatsAppAccount",
    entityId: context.account.id,
    metadata: { wabaId: context.wabaId },
    req,
  });

  return {
    ok: response?.success !== false,
    wabaId: context.wabaId,
    response,
  };
}
