import {
  connectMetaNumber,
  createAccount,
  discoverMetaNumbers,
  getWebhookStatus,
  listAccounts,
  listPhoneNumbers,
  removePhoneNumber,
  updatePhoneNumber,
  verifyPhoneNumber,
} from "../services/whatsapp/accounts.js";
import {
  getWabaSubscription,
  runWhatsAppDiagnostics,
  subscribeWaba,
  testWebhookHandshake,
} from "../services/whatsapp/diagnostics.js";
import { simulateInboundMessage } from "../services/whatsapp/testing.js";
import { asString } from "../lib/validate.js";
import { created, ok } from "../utils/http.js";

function callbackUrlFor(req) {
  return `${req.protocol}://${req.get("host")}/api/webhooks/whatsapp`;
}

export async function numbers(req, res) {
  const phoneNumbers = await listPhoneNumbers({ organizationId: req.auth.organizationId });
  return ok(res, { phoneNumbers });
}

export async function accounts(req, res) {
  const list = await listAccounts({ organizationId: req.auth.organizationId });
  return ok(res, { accounts: list });
}

export async function create(req, res) {
  const phoneNumber = await createAccount({
    organizationId: req.auth.organizationId,
    ...(req.body ?? {}),
    req,
  });
  return created(res, { phoneNumber });
}

export async function update(req, res) {
  const phoneNumber = await updatePhoneNumber({
    organizationId: req.auth.organizationId,
    id: req.params.id,
    data: req.body ?? {},
    req,
  });
  return ok(res, { phoneNumber });
}

export async function remove(req, res) {
  const result = await removePhoneNumber({
    organizationId: req.auth.organizationId,
    id: req.params.id,
    req,
  });
  return ok(res, result);
}

export async function verify(req, res) {
  const result = await verifyPhoneNumber({
    organizationId: req.auth.organizationId,
    id: req.params.id,
    req,
  });
  return ok(res, result);
}

export async function discover(req, res) {
  const body = req.body ?? {};
  const result = await discoverMetaNumbers({
    organizationId: req.auth.organizationId,
    accessToken: body.accessToken,
    wabaId: body.wabaId,
    phoneNumberId: body.phoneNumberId,
  });
  return ok(res, result);
}

export async function connect(req, res) {
  const body = req.body ?? {};
  const phoneNumber = await connectMetaNumber({
    organizationId: req.auth.organizationId,
    accessToken: body.accessToken,
    wabaId: body.wabaId,
    phoneNumberId: body.phoneNumberId,
    req,
  });
  return created(res, { phoneNumber });
}

export async function webhookStatus(req, res) {
  const status = await getWebhookStatus({ organizationId: req.auth.organizationId });
  return ok(res, { ...status, callbackUrl: callbackUrlFor(req) });
}

export async function webhookTest(req, res) {
  const result = await testWebhookHandshake({
    organizationId: req.auth.organizationId,
    callbackUrl: callbackUrlFor(req),
  });
  return ok(res, result);
}

export async function diagnostics(req, res) {
  const body = req.body ?? {};
  const result = await runWhatsAppDiagnostics({
    organizationId: req.auth.organizationId,
    phoneNumberId: asString(body.phoneNumberId, "phoneNumberId", { max: 64 }),
    callbackUrl: callbackUrlFor(req),
  });
  return ok(res, result);
}

export async function subscription(req, res) {
  const result = await getWabaSubscription({
    organizationId: req.auth.organizationId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
  });
  return ok(res, result);
}

export async function subscribe(req, res) {
  const body = req.body ?? {};
  const result = await subscribeWaba({
    organizationId: req.auth.organizationId,
    phoneNumberId: asString(body.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(body.wabaId, "wabaId", { max: 64 }),
    req,
  });
  return ok(res, result);
}

export async function testInbound(req, res) {
  const body = req.body ?? {};
  const result = await simulateInboundMessage({
    organizationId: req.auth.organizationId,
    phoneNumberId: body.phoneNumberId,
    from: body.from,
    text: body.text,
    profileName: body.profileName,
  });
  return created(res, result);
}
