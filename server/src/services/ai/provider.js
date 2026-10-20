import { env } from "../../config/env.js";
import { ExternalServiceError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

/**
 * Provider-neutral chat completion interface.
 *
 * Two providers ship with the MVP:
 *  - "openai": any OpenAI-compatible `/chat/completions` endpoint (OpenAI,
 *    Azure OpenAI gateways, Groq, local llama.cpp, ...).
 *  - "mock": a deterministic local provider so the whole message -> automation ->
 *    AI -> reply loop can be exercised without an API key.
 *
 * Callers only see `{ text, toolCalls, provider, usage }`.
 */

const DEFAULT_TIMEOUT_MS = 30000;

function toOpenAiTools(tools) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

function envConfig() {
  return {
    provider: env.ai.provider,
    apiKey: env.ai.apiKey,
    baseUrl: env.ai.baseUrl,
    model: env.ai.model,
  };
}

async function openAiCompletion({
  messages,
  tools,
  model,
  temperature,
  maxTokens,
  fetchImpl,
  config,
}) {
  const ai = config ?? envConfig();
  if (!ai.apiKey) throw new ExternalServiceError("No AI API key configured. Add one in Settings → API credentials.");

  const body = {
    model: model || ai.model,
    messages,
    temperature: temperature ?? 0.3,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    ...(tools?.length ? { tools: toOpenAiTools(tools), tool_choice: "auto" } : {}),
  };

  let response;
  try {
    response = await (fetchImpl ?? fetch)(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExternalServiceError(`AI request failed: ${error.message}`);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ExternalServiceError("AI provider returned a non-JSON response");
  }

  if (!response.ok) {
    throw new ExternalServiceError(data?.error?.message || `AI provider error (${response.status})`);
  }

  const message = data?.choices?.[0]?.message ?? {};

  return {
    provider: "openai",
    text: typeof message.content === "string" ? message.content.trim() : "",
    toolCalls: (message.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function?.name,
      arguments: parseArguments(call.function?.arguments),
    })),
    usage: data?.usage ?? null,
    raw: message,
  };
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Deterministic stand-in for a real model. It follows the same contract, so the
 * agent loop, tool execution and logging are all exercised for real.
 */
async function mockCompletion({ messages, tools = [] }) {
  const available = new Set(tools.map((tool) => tool.name));
  const last = [...messages].reverse()[0];
  const userText =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const toolMessages = messages.filter((message) => message.role === "tool");

  // 1. Look the contact up once, so tool calling is visible in the run log.
  if (available.has("get_contact") && toolMessages.length === 0 && last?.role === "user") {
    return {
      provider: "mock",
      text: "",
      toolCalls: [{ id: `mock_${Date.now()}`, name: "get_contact", arguments: {} }],
      usage: null,
    };
  }

  // 2. Anything sensitive or explicitly human goes to a teammate.
  if (
    available.has("handoff_to_human") &&
    !toolMessages.some((message) => message.name === "handoff_to_human") &&
    /\b(human|agent|person|refund|manager|complaint)\b/i.test(userText)
  ) {
    return {
      provider: "mock",
      text: "",
      toolCalls: [
        {
          id: `mock_${Date.now()}`,
          name: "handoff_to_human",
          arguments: { reason: "Mock provider matched a handoff keyword" },
        },
      ],
      usage: null,
    };
  }

  const contact = toolMessages.find((message) => message.name === "get_contact");
  const contactName = contact?.content ? safeName(contact.content) : null;
  const trimmed = String(userText).trim().slice(0, 140);

  return {
    provider: "mock",
    text: [
      contactName ? `Hi ${contactName}!` : "Hi!",
      trimmed ? `You wrote: "${trimmed}".` : "",
      "This reply came from the built-in mock AI provider, so no model was called.",
      "Add an API key in Settings → API credentials (or set AI_API_KEY) to use a real model.",
    ]
      .filter(Boolean)
      .join(" "),
    toolCalls: [],
    usage: null,
  };
}

function safeName(content) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return parsed?.name ?? null;
  } catch {
    return null;
  }
}

export async function chatCompletion({
  messages,
  tools = [],
  model,
  temperature,
  maxTokens,
  fetchImpl,
  config,
}) {
  const ai = config ?? envConfig();

  if (ai.provider === "mock") {
    logger.debug("Using mock AI provider");
    return mockCompletion({ messages, tools });
  }

  return openAiCompletion({
    messages,
    tools,
    model,
    temperature,
    maxTokens,
    fetchImpl,
    config: ai,
  });
}

export function activeProvider() {
  return env.ai.provider;
}
