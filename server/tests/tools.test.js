import test from "node:test";
import assert from "node:assert/strict";
import { validateSchema } from "../src/lib/validate.js";
import {
  executeTool,
  getTool,
  listTools,
  registerTool,
} from "../src/services/tools/registry.js";

test("the built-in tools are registered with schemas and permissions", () => {
  const names = listTools().map((tool) => tool.name);

  for (const expected of [
    "get_contact",
    "update_contact",
    "add_tag",
    "remove_tag",
    "get_conversation",
    "send_whatsapp_message",
    "handoff_to_human",
  ]) {
    assert.ok(names.includes(expected), `${expected} should be registered`);
  }

  const send = getTool("send_whatsapp_message");
  assert.equal(send.permission, "write");
  assert.deepEqual(send.inputSchema.required, ["text"]);

  assert.equal(getTool("get_contact").permission, "read");
  assert.equal(getTool("does_not_exist"), null);
});

test("executeTool refuses tools the caller has no permission for", async () => {
  await assert.rejects(
    () =>
      executeTool({
        name: "add_tag",
        args: { tag: "vip" },
        context: { organizationId: "org_test" },
        permissions: ["read"],
      }),
    /requires permission "write"/,
  );
});

test("executeTool validates arguments against the tool schema", async () => {
  await assert.rejects(
    () =>
      executeTool({
        name: "send_whatsapp_message",
        args: {},
        context: { organizationId: "org_test" },
        permissions: ["read", "write"],
      }),
    /Invalid arguments/,
  );
});

test("executeTool requires tenant context and unknown tools fail", async () => {
  await assert.rejects(
    () => executeTool({ name: "get_contact", args: {}, context: {}, permissions: ["read"] }),
    /organizationId/,
  );

  await assert.rejects(
    () => executeTool({ name: "nope", args: {}, context: { organizationId: "org" } }),
    /Unknown tool/,
  );
});

test("validateSchema checks required fields, types and enums", () => {
  const schema = {
    type: "object",
    properties: {
      tag: { type: "string" },
      limit: { type: "integer" },
      mode: { type: "string", enum: ["a", "b"] },
    },
    required: ["tag"],
    additionalProperties: false,
  };

  assert.equal(validateSchema({ tag: "x" }, schema).valid, true);
  assert.equal(validateSchema({}, schema).valid, false);
  assert.equal(validateSchema({ tag: "x", limit: 1.5 }, schema).valid, false);
  assert.equal(validateSchema({ tag: "x", mode: "c" }, schema).valid, false);
  assert.equal(validateSchema({ tag: "x", extra: 1 }, schema).valid, false);
});

test("custom tools can be registered and executed", async () => {
  registerTool({
    name: "test__echo",
    description: "Echoes the input.",
    permission: "read",
    inputSchema: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
    },
    async execute({ args, context }) {
      return { value: args.value, organizationId: context.organizationId };
    },
  });

  const result = await executeTool({
    name: "test__echo",
    args: { value: "hi" },
    context: { organizationId: "org_test" },
  });

  assert.deepEqual(result, { value: "hi", organizationId: "org_test" });
});
