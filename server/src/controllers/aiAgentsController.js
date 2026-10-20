import {
  agentToolOptions,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  setAgentActive,
  updateAgent,
} from "../services/ai/agents.js";
import { activeProvider, previewAgentReply } from "../services/ai/index.js";
import { asString } from "../lib/validate.js";
import { created, ok } from "../utils/http.js";

export async function index(req, res) {
  const agents = await listAgents({ organizationId: req.auth.organizationId });
  const tools = await agentToolOptions({ organizationId: req.auth.organizationId });
  return ok(res, { agents, tools, provider: activeProvider() });
}

export async function show(req, res) {
  const agent = await getAgent({
    organizationId: req.auth.organizationId,
    agentId: req.params.id,
  });
  return ok(res, { agent });
}

export async function create(req, res) {
  const agent = await createAgent({
    organizationId: req.auth.organizationId,
    ...(req.body ?? {}),
    req,
  });
  return created(res, { agent });
}

export async function update(req, res) {
  const agent = await updateAgent({
    organizationId: req.auth.organizationId,
    agentId: req.params.id,
    data: req.body ?? {},
    req,
  });
  return ok(res, { agent });
}

export async function toggle(req, res) {
  const agent = await setAgentActive({
    organizationId: req.auth.organizationId,
    agentId: req.params.id,
    isActive: req.body?.isActive,
    req,
  });
  return ok(res, { agent });
}

export async function remove(req, res) {
  const result = await deleteAgent({
    organizationId: req.auth.organizationId,
    agentId: req.params.id,
    req,
  });
  return ok(res, result);
}

export async function preview(req, res) {
  const preview = await previewAgentReply({
    organizationId: req.auth.organizationId,
    agentId: req.params.id,
    conversationId: asString(req.body?.conversationId, "conversationId", { max: 64 }),
  });
  return ok(res, { preview });
}
