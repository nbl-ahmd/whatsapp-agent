/**
 * Tools module.
 *
 * Common tool interface (name, description, input schema, permission, execute).
 * Internal tools: get_contact, update_contact, add_tag, get_conversation,
 * send_whatsapp_message, handoff_to_human. MCP tools map into this interface.
 */
export const descriptor = Object.freeze({
  name: "tools",
  phase: 5,
  description: "Tool registry with schemas, permissions and validation.",
});
