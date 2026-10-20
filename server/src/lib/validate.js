import { ValidationError } from "./errors.js";

/**
 * Small validation helpers. Input from HTTP requests and from AI tool calls
 * goes through these so services can trust their arguments.
 */

export function asString(value, field, { required = false, max = 4096, min = 0 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return null;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function asEnum(value, field, allowed, { required = false, fallback = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return fallback;
  }
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function asBoolean(value, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  throw new ValidationError(`${field} must be a boolean`);
}

export function asInt(value, field, { min = 1, max = 100, fallback } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function asStringArray(value, field, { max = 25, itemMaxLength = 40 } = {}) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array of strings`);
  if (value.length > max) throw new ValidationError(`${field} must have at most ${max} items`);

  return [
    ...new Set(
      value.map((item) => {
        if (typeof item !== "string") throw new ValidationError(`${field} must contain only strings`);
        const trimmed = item.trim();
        if (!trimmed) throw new ValidationError(`${field} cannot contain empty values`);
        if (trimmed.length > itemMaxLength) {
          throw new ValidationError(`${field} items must be at most ${itemMaxLength} characters`);
        }
        return trimmed;
      }),
    ),
  ];
}

/**
 * Validate a value against a JSON-schema subset: `{ type: "object", properties,
 * required, additionalProperties }`. Used for AI tool input schemas, where the
 * model - not a developer - wrote the arguments.
 *
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(value, schema = {}) {
  const errors = [];

  function check(current, node, path) {
    if (!node || typeof node !== "object") return;

    if (node.type === "object") {
      if (current === null || typeof current !== "object" || Array.isArray(current)) {
        errors.push(`${path} must be an object`);
        return;
      }
      for (const key of node.required ?? []) {
        if (current[key] === undefined || current[key] === null || current[key] === "") {
          errors.push(`${path}${key} is required`);
        }
      }
      if (node.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!node.properties?.[key]) errors.push(`${path}${key} is not allowed`);
        }
      }
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        if (current[key] !== undefined && current[key] !== null) {
          check(current[key], child, `${path}${key}.`);
        }
      }
      return;
    }

    if (node.type === "array") {
      if (!Array.isArray(current)) {
        errors.push(`${path} must be an array`);
        return;
      }
      for (const item of current) check(item, node.items ?? {}, `${path}[]`);
      return;
    }

    if (node.type === "string" && typeof current !== "string") {
      errors.push(`${path} must be a string`);
    }
    if (node.type === "number" && (typeof current !== "number" || Number.isNaN(current))) {
      errors.push(`${path} must be a number`);
    }
    if (node.type === "integer" && !Number.isInteger(current)) {
      errors.push(`${path} must be an integer`);
    }
    if (node.type === "boolean" && typeof current !== "boolean") {
      errors.push(`${path} must be a boolean`);
    }
    if (node.enum && !node.enum.includes(current)) {
      errors.push(`${path} must be one of: ${node.enum.join(", ")}`);
    }
  }

  check(value, schema, "");
  return { valid: errors.length === 0, errors };
}
