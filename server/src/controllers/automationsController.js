import { asBoolean, asInt, asString } from "../lib/validate.js";
import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomationRuns,
  listAutomations,
  setAutomationActive,
  testAutomation,
  updateAutomation,
} from "../services/automation/index.js";
import { created, ok } from "../utils/http.js";

export async function index(req, res) {
  const automations = await listAutomations({
    organizationId: req.auth.organizationId,
    isActive: asBoolean(req.query.isActive, "isActive") ?? null,
    trigger: asString(req.query.trigger, "trigger", { max: 40 }),
    search: asString(req.query.search, "search", { max: 120 }),
  });
  return ok(res, { automations });
}

export async function show(req, res) {
  const automation = await getAutomation({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
  });
  return ok(res, { automation });
}

export async function create(req, res) {
  const automation = await createAutomation({
    organizationId: req.auth.organizationId,
    name: req.body?.name,
    description: req.body?.description,
    trigger: req.body?.trigger,
    conditions: req.body?.conditions,
    actions: req.body?.actions,
    isActive: req.body?.isActive,
    req,
  });
  return created(res, { automation });
}

export async function update(req, res) {
  const automation = await updateAutomation({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
    data: req.body ?? {},
    req,
  });
  return ok(res, { automation });
}

export async function toggle(req, res) {
  const automation = await setAutomationActive({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
    isActive: req.body?.isActive,
    req,
  });
  return ok(res, { automation });
}

export async function remove(req, res) {
  const result = await deleteAutomation({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
    req,
  });
  return ok(res, result);
}

export async function runs(req, res) {
  const list = await listAutomationRuns({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 }),
  });
  return ok(res, { runs: list });
}

export async function runAll(req, res) {
  const list = await listAutomationRuns({
    organizationId: req.auth.organizationId,
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 }),
  });
  return ok(res, { runs: list });
}

export async function test(req, res) {
  const result = await testAutomation({
    organizationId: req.auth.organizationId,
    automationId: req.params.id,
    conversationId: asString(req.body?.conversationId, "conversationId", { max: 64 }),
  });
  return ok(res, result);
}
