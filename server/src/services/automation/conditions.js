import { AUTOMATION_CONDITION } from "../../lib/constants.js";

/**
 * Condition evaluation. Conditions are ANDed: every one must pass for the
 * workflow to run. Each result is recorded on the AutomationRun so an operator
 * can see why a workflow did or did not fire.
 */

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function evaluateCondition(condition, context) {
  const text = normalize(context.text);
  const value = normalize(condition.value);

  switch (condition.type) {
    case AUTOMATION_CONDITION.CONTAINS:
      return { passed: Boolean(value) && text.includes(value), detail: `message contains "${value}"` };

    case AUTOMATION_CONDITION.EQUALS:
      return { passed: value.length > 0 && text === value, detail: `message equals "${value}"` };

    case AUTOMATION_CONDITION.STARTS_WITH:
      return { passed: Boolean(value) && text.startsWith(value), detail: `message starts with "${value}"` };

    case AUTOMATION_CONDITION.VARIABLE_EQUALS: {
      const actual = context.variables?.[condition.key];
      return {
        passed: normalize(actual) === value,
        detail: `variable ${condition.key} is "${actual ?? "(unset)"}"`,
      };
    }

    case AUTOMATION_CONDITION.CONTACT_TAG: {
      const tags = context.tags ?? [];
      const has = tags.includes(condition.value);
      const wants = condition.operator === "not_has" ? !has : has;
      return { passed: wants, detail: `contact tags [${tags.join(", ")}] ${wants ? "match" : "do not match"}` };
    }

    case AUTOMATION_CONDITION.AI_INTENT: {
      const intent = normalize(context.intent);
      return { passed: intent === value, detail: `AI intent is "${intent || "(none)"}"` };
    }

    default:
      return { passed: false, detail: `unsupported condition type ${condition.type}` };
  }
}

export function evaluateConditions(conditions = [], context = {}) {
  const results = conditions.map((condition) => ({
    condition,
    ...evaluateCondition(condition, context),
  }));

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
