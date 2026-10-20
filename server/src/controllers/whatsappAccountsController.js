import {
  createAccount,
  getWebhookStatus,
  listAccounts,
  listPhoneNumbers,
  updatePhoneNumber,
  verifyPhoneNumber,
} from "../services/whatsapp/accounts.js";
import { created, ok } from "../utils/http.js";

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

export async function verify(req, res) {
  const result = await verifyPhoneNumber({
    organizationId: req.auth.organizationId,
    id: req.params.id,
    req,
  });
  return ok(res, result);
}

export async function webhookStatus(req, res) {
  const status = await getWebhookStatus({ organizationId: req.auth.organizationId });
  return ok(res, status);
}
