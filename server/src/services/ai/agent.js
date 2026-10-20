import { CONVERSATION_MODE } from "../../lib/constants.js";
import { recordAudit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../db/prisma.js";
import { getConversation, setConversationMode } from "../conversations/service.js";
import { listConversationMessages } from "../messages/service.js";
import { sendTextMessage } from "../messages/outbound.js";
import { executeTool, getTool } from "../tools/registry.js";
import { chatCompletion } from "./provider.js";
import { getAiConfig } from "../settings/index.js";

export const descriptor = Object.freeze({
  name: "ai",
  phase: 5,
  description: "Provider-neutral tool-using AI agent.",
});

const HISTORY_LIMIT = 12;
const MAX_STEPS = 4;

/** The organization's active agent, or null when the team turned AI off. */
export async function getActiveAgent({ organizationId }) {
  return prisma.aIAgent.findFirst({
    where: { organizationId, isActive: true },
    include: { tools: true },
    orderBy: { createdAt: "asc" },
  });
}

function renderTemplate(text, { organization, contact }) {
  return String(text ?? "")
    .replaceAll("{{organization}}", organization?.name ?? "our team")
    .replaceAll("{{contact.name}}", contact?.name ?? contact?.profileName ?? "there")
    .replaceAll("{{contact.phone}}", contact?.waId ?? "");
}

function toProviderMessages(messages) {
  return messages.map((message) => {
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      };
    }

    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        name: message.name,
        content: message.content,
      };
    }

    return { role: message.role, content: message.content };
  });
}

/**
 * Answer one inbound message with the organization's AI agent.
 *
 * The agent loop is bounded (MAX_STEPS) and every capability it uses is a
 * registered tool. If anything fails we hand the conversation to a human rather
 * than leaving the customer without a reply.
 */
export async function runAgentForConversation({ organizationId, conversationId, triggerMessageId = null }) {
  const conversation = await getConversation({ organizationId, conversationId });
  if (!conversation) return { skipped: "conversation-not-found" };
  if (conversation.mode !== CONVERSATION_MODE.AI) return { skipped: "not-ai-mode" };

  const agent = await getActiveAgent({ organizationId });
  if (!agent) return { skipped: "no-active-agent" };

  const [contact, organization, history, aiConfig] = await Promise.all([
    prisma.contact.findFirst({ where: { id: conversation.contactId, organizationId } }),
    prisma.organization.findUnique({ where: { id: organizationId } }),
    listConversationMessages({ organizationId, conversationId, take: HISTORY_LIMIT }),
    getAiConfig({ organizationId }),
  ]);

  const enabledTools = agent.tools.filter((tool) => tool.isActive && getTool(tool.name));
  const permissions = new Set(enabledTools.map((tool) => tool.permission || "read"));
  const toolDefinitions = enabledTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    permission: tool.permission,
  }));

  const messages = [
    {
      role: "system",
      content: renderTemplate(
        agent.systemPrompt ??
          "You are a helpful WhatsApp assistant. Keep replies short and hand off to a human when unsure.",
        { organization, contact },
      ),
    },
    ...history.map((message) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: message.text ?? `[${message.type} message]`,
    })),
  ];

  if (messages.length === 1) return { skipped: "empty-history" };

  const context = {
    organizationId,
    conversationId,
    contactId: conversation.id ? conversation.contactId : null,
    phoneNumberId: conversation.phoneNumberId,
    actor: "ai",
  };

  const toolCalls = [];
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const completion = await chatCompletion({
      messages: toProviderMessages(messages),
      tools: toolDefinitions,
      model: agent.model,
      temperature: agent.temperature ?? undefined,
      maxTokens: agent.maxTokens ?? undefined,
      config: aiConfig,
    });

    if (!completion.toolCalls?.length) {
      finalText = completion.text ?? "";
      break;
    }

    messages.push({ role: "assistant", content: completion.text ?? "", toolCalls: completion.toolCalls });

    for (const call of completion.toolCalls) {
      let result;
      let failed = false;

      try {
        result = await executeTool({
          name: call.name,
          args: call.arguments ?? {},
          context,
          permissions,
        });
      } catch (error) {
        failed = true;
        result = { error: error.message };
        logger.warn("AI tool call failed", { tool: call.name, error: error.message });
      }

      toolCalls.push({ name: call.name, arguments: call.arguments, failed, result });

      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }
  }

  // A human may have taken over while the agent was thinking.
  const fresh = await getConversation({ organizationId, conversationId });
  const stillAiMode = fresh?.mode === CONVERSATION_MODE.AI;

  let sentMessage = null;
  if (finalText && stillAiMode) {
    const { message } = await sendTextMessage({
      organizationId,
      phoneNumberId: conversation.phoneNumberId,
      to: contact.waId,
      text: finalText,
    });
    sentMessage = message;
  }

  await recordAudit({
    organizationId,
    actorType: "ai",
    action: "ai.reply",
    entityType: "Conversation",
    entityId: conversationId,
    metadata: {
      agent: agent.name,
      provider: agent.provider,
      model: agent.model,
      triggerMessageId,
      replied: Boolean(sentMessage),
      text: finalText || null,
      toolCalls,
    },
  });

  return {
    replied: Boolean(sentMessage),
    text: finalText || null,
    toolCalls,
    messageId: sentMessage?.id ?? null,
  };
}

/**
 * Entry point used by workers: answer, but never let an AI failure leave the
 * customer hanging.
 */
export async function handleInboundWithAgent({ organizationId, conversationId, messageId = null }) {
  try {
    return await runAgentForConversation({ organizationId, conversationId, triggerMessageId: messageId });
  } catch (error) {
    logger.error("AI agent failed; handing off to a human", {
      conversationId,
      error: error?.message,
    });

    await setConversationMode({
      organizationId,
      conversationId,
      mode: CONVERSATION_MODE.HUMAN,
    }).catch(() => null);

    await recordAudit({
      organizationId,
      actorType: "ai",
      action: "ai.failed",
      entityType: "Conversation",
      entityId: conversationId,
      metadata: { error: error?.message, handedOff: true },
    });

    return { skipped: "error", error: error?.message, handedOff: true };
  }
}

/** Preview an agent reply without sending it (used by the Agents page). */
export async function previewAgentReply({ organizationId, agentId, conversationId }) {
  const agent = await prisma.aIAgent.findFirst({
    where: { id: agentId, organizationId },
    include: { tools: true },
  });
  if (!agent) return null;

  const conversation = await getConversation({ organizationId, conversationId });
  const history = conversation
    ? await listConversationMessages({ organizationId, conversationId, take: HISTORY_LIMIT })
    : [];

  const completion = await chatCompletion({
    messages: [
      {
        role: "system",
        content: agent.systemPrompt ?? "You are a helpful WhatsApp assistant.",
      },
      ...history.map((message) => ({
        role: message.direction === "inbound" ? "user" : "assistant",
        content: message.text ?? `[${message.type} message]`,
      })),
    ],
    tools: [],
    model: agent.model,
    config: await getAiConfig({ organizationId }),
  });

  return { text: completion.text, provider: completion.provider, steps: history.length };
}
