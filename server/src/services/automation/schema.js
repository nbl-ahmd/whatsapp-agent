import { AUTOMATION_ACTION, AUTOMATION_CONDITION, EVENT_TYPE } from "../../lib/constants.js";
import { ValidationError } from "../../lib/errors.js";

/**
 * JSON workflow validation. Workflows are stored as JSON, so this is the only
 * thing standing between a hand-edited definition and the engine. It validates
 * and normalizes rather than trusting the shape.
 */

const TRIGGERS = Object.values(EVENT_TYPE);
const CONDITION_TYPES = Object.values(AUTOMATION_CONDITION);
const ACTION_TYPES = Object.values(AUTOMATION_ACTION);

const ACTION_REQUIREMENTS = {
  [AUTOMATION_ACTION.SEND_MESSAGE]: ["text"],
  [AUTOMATION_ACTION.SEND_TEMPLATE]: ["name"],
  [AUTOMATION_ACTION.SEND_FLOW]: ["flowToken"],
  [AUTOMATION_ACTION.ADD_TAG]: ["tag"],
  [AUTOMATION_ACTION.REMOVE_TAG]: ["tag"],
  [AUTOMATION_ACTION.SET_VARIABLE]: ["key", "value"],
  [AUTOMATION_ACTION.WEBHOOK]: ["url"],
  [AUTOMATION_ACTION.DELAY]: ["seconds"],
  [AUTOMATION_ACTION.ASSIGN_AGENT]: [],
  [AUTOMATION_ACTION.AI_AGENT]: [],
  [AUTOMATION_ACTION.HANDOFF_HUMAN]: [],
};

const CONDITION_REQUIREMENTS = {
  [AUTOMATION_CONDITION.CONTAINS]: ["value"],
  [AUTOMATION_CONDITION.EQUALS]: ["value"],
  [AUTOMATION_CONDITION.STARTS_WITH]: ["value"],
  [AUTOMATION_CONDITION.VARIABLE_EQUALS]: ["key", "value"],
  [AUTOMATION_CONDITION.CONTACT_TAG]: ["value"],
  [AUTOMATION_CONDITION.AI_INTENT]: ["value"],
};

const DEFAULT_LABEL = {
  [AUTOMATION_CONDITION.CONTAINS]: "message contains",
  [AUTOMATION_CONDITION.EQUALS]: "message equals",
  [AUTOMATION_CONDITION.STARTS_WITH]: "message starts with",
  [AUTOMATION_CONDITION.VARIABLE_EQUALS]: "variable equals",
  [AUTOMATION_CONDITION.CONTACT_TAG]: "contact has tag",
  [AUTOMATION_CONDITION.AI_INTENT]: "AI intent is",
};

export function validateTrigger(trigger) {
  if (!TRIGGERS.includes(trigger)) {
    throw new ValidationError(`trigger must be one of: ${TRIGGERS.join(", ")}`);
  }
  return trigger;
}

export function validateConditions(conditions) {
  if (conditions === undefined || conditions === null) return [];
  if (!Array.isArray(conditions)) throw new ValidationError("conditions must be an array");

  return conditions.map((condition, index) => {
    if (!condition || typeof condition !== "object") {
      throw new ValidationError(`conditions[${index}] must be an object`);
    }
    if (!CONDITION_TYPES.includes(condition.type)) {
      throw new ValidationError(
        `conditions[${index}].type must be one of: ${CONDITION_TYPES.join(", ")}`,
      );
    }

    for (const field of CONDITION_REQUIREMENTS[condition.type]) {
      if (condition[field] === undefined || condition[field] === "") {
        throw new ValidationError(`conditions[${index}].${field} is required for ${condition.type}`);
      }
    }

    return {
      type: condition.type,
      ...(condition.key !== undefined ? { key: String(condition.key) } : {}),
      value: condition.value === undefined ? undefined : String(condition.value),
      ...(condition.operator !== undefined ? { operator: String(condition.operator) } : {}),
      ...(condition.label !== undefined
        ? { label: String(condition.label) }
        : { label: `${DEFAULT_LABEL[condition.type]} "${condition.value}"` }),
    };
  });
}

export function validateActions(actions) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    throw new ValidationError("actions must be a non-empty array");
  }
  if (actions.length > 20) throw new ValidationError("actions must have at most 20 entries");

  return actions.map((action, index) => {
    if (!action || typeof action !== "object") {
      throw new ValidationError(`actions[${index}] must be an object`);
    }
    if (!ACTION_TYPES.includes(action.type)) {
      throw new ValidationError(`actions[${index}].type must be one of: ${ACTION_TYPES.join(", ")}`);
    }

    for (const field of ACTION_REQUIREMENTS[action.type]) {
      if (action[field] === undefined || action[field] === "") {
        throw new ValidationError(`actions[${index}].${field} is required for ${action.type}`);
      }
    }

    if (action.type === AUTOMATION_ACTION.WEBHOOK) {
      let url;
      try {
        url = new URL(String(action.url));
      } catch {
        throw new ValidationError(`actions[${index}].url must be a valid absolute URL`);
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new ValidationError(`actions[${index}].url must use http or https`);
      }
    }

    if (action.type === AUTOMATION_ACTION.DELAY) {
      const seconds = Number(action.seconds);
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) {
        throw new ValidationError(`actions[${index}].seconds must be between 1 and 3600`);
      }
    }

    if (action.type === AUTOMATION_ACTION.SEND_FLOW) {
      const hasInteractiveFlow = Boolean(action.flowId || action.flowName);
      const templateName = action.templateName ?? action.template_name;
      if (!hasInteractiveFlow && !templateName) {
        throw new ValidationError(
          `actions[${index}] needs flowId/flowName, or templateName for a test number`,
        );
      }
      if (templateName && !String(templateName).trim()) {
        throw new ValidationError(`actions[${index}].templateName cannot be empty`);
      }
    }

    return action;
  });
}

/** Validate and normalize a whole workflow definition. */
export function validateWorkflow({ trigger, conditions, actions }) {
  return {
    trigger: validateTrigger(trigger),
    conditions: validateConditions(conditions),
    actions: validateActions(actions),
  };
}
