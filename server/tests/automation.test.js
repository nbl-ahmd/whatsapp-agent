import test from "node:test";
import assert from "node:assert/strict";
import { evaluateConditions } from "../src/services/automation/conditions.js";
import { validateWorkflow } from "../src/services/automation/schema.js";

test("validateWorkflow accepts a valid definition and fills condition labels", () => {
  const workflow = validateWorkflow({
    trigger: "MESSAGE_RECEIVED",
    conditions: [{ type: "contains", value: "refund" }],
    actions: [{ type: "send_message", text: "On it" }],
  });

  assert.equal(workflow.trigger, "MESSAGE_RECEIVED");
  assert.equal(workflow.conditions[0].label, 'message contains "refund"');
  assert.equal(workflow.actions.length, 1);
});

test("validateWorkflow rejects unknown triggers, actions and missing fields", () => {
  assert.throws(
    () => validateWorkflow({ trigger: "NOPE", actions: [{ type: "send_message", text: "x" }] }),
    /trigger must be one of/,
  );

  assert.throws(
    () => validateWorkflow({ trigger: "MESSAGE_RECEIVED", actions: [{ type: "explode" }] }),
    /actions\[0\]\.type must be one of/,
  );

  assert.throws(
    () => validateWorkflow({ trigger: "MESSAGE_RECEIVED", actions: [{ type: "send_message" }] }),
    /actions\[0\]\.text is required/,
  );

  assert.throws(
    () => validateWorkflow({ trigger: "MESSAGE_RECEIVED", actions: [] }),
    /non-empty array/,
  );

  assert.throws(
    () =>
      validateWorkflow({
        trigger: "MESSAGE_RECEIVED",
        conditions: [{ type: "contains" }],
        actions: [{ type: "send_message", text: "x" }],
      }),
    /conditions\[0\]\.value is required/,
  );

  assert.throws(
    () => validateWorkflow({ trigger: "MESSAGE_RECEIVED", actions: [{ type: "delay", seconds: 5000 }] }),
    /seconds must be between 1 and 3600/,
  );

  assert.throws(
    () => validateWorkflow({ trigger: "MESSAGE_RECEIVED", actions: [{ type: "webhook", url: "not-a-url" }] }),
    /valid absolute URL/,
  );
});

test("evaluateConditions ANDs every condition and explains each result", () => {
  const context = {
    text: "I need a refund for order 12",
    tags: ["customer", "vip"],
    variables: { tier: "gold" },
    intent: "complaint",
  };

  const passed = evaluateConditions(
    [
      { type: "contains", value: "REFUND" },
      { type: "contact_tag", value: "vip" },
      { type: "variable_equals", key: "tier", value: "gold" },
      { type: "ai_intent", value: "complaint" },
    ],
    context,
  );

  assert.equal(passed.passed, true);
  assert.equal(passed.results.length, 4);
  assert.ok(passed.results.every((result) => typeof result.detail === "string"));
});

test("evaluateConditions fails when one condition does not match", () => {
  const result = evaluateConditions(
    [
      { type: "starts_with", value: "hello" },
      { type: "contains", value: "goodbye" },
    ],
    { text: "hello there" },
  );

  assert.equal(result.passed, false);
  assert.equal(result.results[0].passed, true);
  assert.equal(result.results[1].passed, false);
});

test("contact_tag supports not_has and variables fall back to unset", () => {
  const notHas = evaluateConditions([{ type: "contact_tag", value: "welcomed", operator: "not_has" }], {
    tags: [],
  });
  assert.equal(notHas.passed, true);

  const missingVariable = evaluateConditions(
    [{ type: "variable_equals", key: "missing", value: "anything" }],
    { variables: {} },
  );
  assert.equal(missingVariable.passed, false);
});
