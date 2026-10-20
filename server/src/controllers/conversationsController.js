import { CONVERSATION_MODE, CONVERSATION_STATUS } from "../lib/constants.js";
import { asBoolean, asEnum, asInt, asString } from "../lib/validate.js";
import {
  assignConversation,
  getConversationDetail,
  listConversations,
  markConversationRead,
  setConversationMode,
  setConversationStatus,
} from "../services/conversations/service.js";
import { listConversationMessages } from "../services/messages/service.js";
import { replyToConversation } from "../services/messages/reply.js";
import { created, ok } from "../utils/http.js";

export async function index(req, res) {
  const conversations = await listConversations({
    organizationId: req.auth.organizationId,
    status: asEnum(req.query.status, "status", Object.values(CONVERSATION_STATUS)),
    mode: asEnum(req.query.mode, "mode", Object.values(CONVERSATION_MODE)),
    search: asString(req.query.search, "search", { max: 120 }),
    assignedUserId: asString(req.query.assignedUserId, "assignedUserId", { max: 64 }),
    unreadOnly: asBoolean(req.query.unread, "unread") ?? false,
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 }),
  });

  return ok(res, { conversations });
}

export async function show(req, res) {
  const conversation = await getConversationDetail({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
  });
  return ok(res, { conversation });
}

export async function messages(req, res) {
  // Reading a thread is the moment it stops being new.
  await markConversationRead({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
  });

  const list = await listConversationMessages({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 50 }),
  });

  return ok(res, { messages: list });
}

export async function reply(req, res) {
  const result = await replyToConversation({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
    userId: req.auth.userId,
    type: req.body?.type ?? "text",
    text: req.body?.text,
    media: req.body?.media,
    template: req.body?.template,
    interactive: req.body?.interactive,
    req,
  });
  return created(res, result);
}

export async function updateMode(req, res) {
  const conversation = await setConversationMode({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
    mode: asEnum(req.body?.mode, "mode", Object.values(CONVERSATION_MODE), { required: true }),
    userId: req.auth.userId,
  });
  return ok(res, { conversation });
}

export async function updateStatus(req, res) {
  const conversation = await setConversationStatus({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
    status: asEnum(req.body?.status, "status", Object.values(CONVERSATION_STATUS), { required: true }),
  });
  return ok(res, { conversation });
}

export async function assign(req, res) {
  const conversation = await assignConversation({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
    userId: req.body?.userId === null ? null : asString(req.body?.userId, "userId", { max: 64 }),
  });
  return ok(res, { conversation });
}

export async function read(req, res) {
  const conversation = await markConversationRead({
    organizationId: req.auth.organizationId,
    conversationId: req.params.id,
  });
  return ok(res, { conversation });
}
