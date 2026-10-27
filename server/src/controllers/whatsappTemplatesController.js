import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "../services/whatsapp/templates.js";
import { asString } from "../lib/validate.js";
import { created, ok } from "../utils/http.js";

/** Template management. Admin-only writes; reads are available to operators. */

export async function list(req, res) {
  const result = await listTemplates({
    organizationId: req.auth.organizationId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
    status: asString(req.query.status, "status", { max: 200 }),
    limit: req.query.limit,
    after: asString(req.query.after, "after", { max: 2048 }),
  });
  return ok(res, result);
}

export async function detail(req, res) {
  const result = await getTemplate({
    organizationId: req.auth.organizationId,
    templateId: req.params.templateId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
  });
  return ok(res, result);
}

export async function create(req, res) {
  const body = req.body ?? {};
  const result = await createTemplate({
    organizationId: req.auth.organizationId,
    ...body,
    req,
  });
  return created(res, result);
}

export async function update(req, res) {
  const body = req.body ?? {};
  const result = await updateTemplate({
    organizationId: req.auth.organizationId,
    templateId: req.params.templateId,
    ...body,
    req,
  });
  return ok(res, result);
}

export async function remove(req, res) {
  const result = await deleteTemplate({
    organizationId: req.auth.organizationId,
    templateId: req.params.templateId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
    req,
  });
  return ok(res, result);
}
