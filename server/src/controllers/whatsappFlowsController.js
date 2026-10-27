import {
  createFlow,
  deleteFlow,
  deprecateFlow,
  getFlow,
  getFlowAssets,
  getFlowJson,
  listFlows,
  publishFlow,
  updateFlow,
  uploadFlowJson,
} from "../services/whatsapp/flows.js";
import { asString } from "../lib/validate.js";
import { created, ok } from "../utils/http.js";

/** WhatsApp Flows management. Admin-only writes; reads are available to operators. */

export async function list(req, res) {
  const result = await listFlows({
    organizationId: req.auth.organizationId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
    limit: req.query.limit,
    after: asString(req.query.after, "after", { max: 2048 }),
  });
  return ok(res, result);
}

export async function detail(req, res) {
  const result = await getFlow({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
  });
  return ok(res, result);
}

export async function assets(req, res) {
  const result = await getFlowAssets({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
  });
  return ok(res, result);
}

export async function json(req, res) {
  const result = await getFlowJson({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    phoneNumberId: asString(req.query.phoneNumberId, "phoneNumberId", { max: 64 }),
    wabaId: asString(req.query.wabaId, "wabaId", { max: 64 }),
  });
  return ok(res, result);
}

export async function create(req, res) {
  const body = req.body ?? {};
  const result = await createFlow({
    organizationId: req.auth.organizationId,
    ...body,
    req,
  });
  return created(res, result);
}

export async function update(req, res) {
  const body = req.body ?? {};
  const result = await updateFlow({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    ...body,
    req,
  });
  return ok(res, result);
}

export async function upload(req, res) {
  const body = req.body ?? {};
  const result = await uploadFlowJson({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    ...body,
    req,
  });
  return ok(res, result);
}

export async function publish(req, res) {
  const result = await publishFlow({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    ...(req.body ?? {}),
    req,
  });
  return ok(res, result);
}

export async function deprecate(req, res) {
  const result = await deprecateFlow({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    ...(req.body ?? {}),
    req,
  });
  return ok(res, result);
}

export async function remove(req, res) {
  const result = await deleteFlow({
    organizationId: req.auth.organizationId,
    flowId: req.params.flowId,
    ...(req.body ?? {}),
    req,
  });
  return ok(res, result);
}
