import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { validateSchema } from "../../lib/validate.js";
import { internalTools } from "./internal.js";
import { integrationTools } from "./integrations.js";

/**
 * Tool registry.
 *
 * The AI never touches the database or an API directly: every capability it has
 * is a registered tool with a name, description, JSON input schema, a required
 * permission and an `execute` function. The same registry is what an automation
 * action or an MCP bridge would call into later.
 */

const registry = new Map();

export function registerTool(tool) {
  if (!tool?.name || typeof tool.execute !== "function") {
    throw new ValidationError("A tool needs a name and an execute function");
  }
  registry.set(tool.name, tool);
  return tool;
}

export function getTool(name) {
  return registry.get(name) ?? null;
}

/** Tool definitions (metadata only) - safe to send to a model provider. */
export function listTools() {
  return [...registry.values()].map(({ name, description, inputSchema, permission }) => ({
    name,
    description,
    inputSchema,
    permission,
  }));
}

export function toolNames() {
  return [...registry.keys()];
}

/**
 * Execute a tool by name.
 *
 * @param {object} params
 * @param {string} params.name
 * @param {object} params.args
 * @param {object} params.context tenant + conversation context: { organizationId, conversationId, ... }
 * @param {Set<string>|string[]} [params.permissions] permissions granted to the caller
 */
export async function executeTool({ name, args = {}, context, permissions = ["read"] }) {
  const tool = registry.get(name);
  if (!tool) throw new NotFoundError(`Unknown tool: ${name}`);

  const granted = permissions instanceof Set ? permissions : new Set(permissions);
  if (!granted.has(tool.permission)) {
    throw new ForbiddenError(`Tool "${name}" requires permission "${tool.permission}"`);
  }

  if (!context?.organizationId) {
    throw new ValidationError("Tool context requires an organizationId");
  }

  const { valid, errors } = validateSchema(args, tool.inputSchema);
  if (!valid) {
    throw new ValidationError(`Invalid arguments for tool "${name}"`, errors);
  }

  return tool.execute({ args, context, tool });
}

for (const tool of [...internalTools, ...integrationTools]) registerTool(tool);
