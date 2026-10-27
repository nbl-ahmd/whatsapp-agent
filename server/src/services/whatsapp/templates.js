import { recordAudit } from "../../lib/audit.js";
import { ValidationError } from "../../lib/errors.js";
import { asEnum, asInt, asString } from "../../lib/validate.js";
import { resolveMetaAccountContext } from "./context.js";
import {
  createTemplate as createTemplateOnMeta,
  deleteTemplate as deleteTemplateOnMeta,
  getTemplate as getTemplateFromMeta,
  getTemplates as getTemplatesFromMeta,
  updateTemplate as updateTemplateOnMeta,
} from "./service.js";

/**
 * Message-template management (Phase 6 support).
 *
 * Meta is the source of truth: nothing is cached locally, so an approval or
 * rejection is visible as soon as the page reloads. Every call resolves the WABA
 * from an organization-scoped phone number id; a WABA id supplied by a browser
 * is only ever used inside that tenant scope.
 */

export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION", "FREE_SERVICE"];
export const TEMPLATE_STATUSES = [
  "APPROVED",
  "PENDING",
  "REJECTED",
  "PAUSED",
  "DISABLED",
  "IN_APPEAL",
  "LIMIT_EXCEEDED",
  "ARCHIVED",
  "PENDING_DELETION",
  "DELETED",
];
const BUTTON_TYPES = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "FLOW", "COPY_CODE"];
const HEADER_FORMATS = ["TEXT", "IMAGE", "DOCUMENT", "VIDEO", "LOCATION"];
const NAME_PATTERN = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:_[A-Z0-9]{2,4})?$/;

function normalizeComponentType(component) {
  if (!component || typeof component !== "object" || Array.isArray(component)) {
    throw new ValidationError("Each template component must be an object");
  }
  const type = String(component.type ?? "").toUpperCase();
  if (!type) throw new ValidationError("Each template component needs a type");
  return { ...component, type };
}

function validateButton(button, index) {
  if (!button || typeof button !== "object" || Array.isArray(button)) {
    throw new ValidationError(`components.buttons[${index}] must be an object`);
  }

  const type = String(button.type ?? "").toUpperCase();
  if (!BUTTON_TYPES.includes(type)) {
    throw new ValidationError(
      `components.buttons[${index}].type must be one of: ${BUTTON_TYPES.join(", ")}`,
    );
  }

  const text = asString(button.text, `components.buttons[${index}].text`, {
    required: true,
    max: 25,
  });

  const normalized = { ...button, type, text };

  if (type === "URL") {
    const url = asString(button.url, `components.buttons[${index}].url`, {
      required: true,
      max: 2000,
    });
    if (!/^https?:\/\//i.test(url)) {
      throw new ValidationError(`components.buttons[${index}].url must use http or https`);
    }
    normalized.url = url;
  }

  if (type === "PHONE_NUMBER") {
    normalized.phone_number = asString(
      button.phone_number,
      `components.buttons[${index}].phone_number`,
      { required: true, max: 32 },
    );
  }

  if (type === "FLOW") {
    const flowId = asString(button.flow_id, `components.buttons[${index}].flow_id`, {
      max: 128,
    });
    const flowName = asString(button.flow_name, `components.buttons[${index}].flow_name`, {
      max: 128,
    });
    let flowJson = button.flow_json;

    if (flowJson !== undefined && flowJson !== null && flowJson !== "") {
      if (typeof flowJson === "object") flowJson = JSON.stringify(flowJson);
      if (typeof flowJson !== "string") {
        throw new ValidationError(`components.buttons[${index}].flow_json must be JSON text`);
      }
      try {
        JSON.parse(flowJson);
      } catch {
        throw new ValidationError(`components.buttons[${index}].flow_json must be valid JSON`);
      }
    } else {
      flowJson = undefined;
    }

    const selectors = [flowId, flowName, flowJson].filter(Boolean);
    if (selectors.length !== 1) {
      throw new ValidationError(
        `components.buttons[${index}] needs exactly one of flow_id, flow_name or flow_json`,
      );
    }

    const flowAction = asEnum(
      String(button.flow_action ?? "navigate"),
      `components.buttons[${index}].flow_action`,
      ["navigate", "data_exchange"],
      { fallback: "navigate" },
    );
    const navigateScreen = asString(
      button.navigate_screen,
      `components.buttons[${index}].navigate_screen`,
      { max: 128 },
    );

    Object.assign(normalized, {
      ...(flowId ? { flow_id: flowId } : {}),
      ...(flowName ? { flow_name: flowName } : {}),
      ...(flowJson ? { flow_json: flowJson } : {}),
      flow_action: flowAction,
      ...(flowAction === "navigate" && navigateScreen
        ? { navigate_screen: navigateScreen }
        : {}),
    });
  }

  return normalized;
}

/**
 * Validate a components array without trying to replace Meta's own review. The
 * important checks are structural: a malformed Flow button otherwise fails only
 * after an approval round-trip.
 */
export function validateTemplateComponents(components) {
  if (components === undefined || components === null) return [];
  if (!Array.isArray(components)) {
    throw new ValidationError("components must be an array");
  }
  if (components.length === 0) return [];

  const serializedSize = JSON.stringify(components).length;
  if (serializedSize > 200_000) {
    throw new ValidationError("components JSON is too large (max 200 KB)");
  }

  const normalized = components.map((raw, index) => {
    const component = normalizeComponentType(raw);
    if (component.type === "HEADER") {
      if (component.format) {
        component.format = String(component.format).toUpperCase();
        if (!HEADER_FORMATS.includes(component.format)) {
          throw new ValidationError(
            `components[${index}].format must be one of: ${HEADER_FORMATS.join(", ")}`,
          );
        }
      }
    }
    if (component.type === "BUTTONS") {
      if (!Array.isArray(component.buttons) || component.buttons.length === 0) {
        throw new ValidationError(`components[${index}].buttons must be a non-empty array`);
      }
      component.buttons = component.buttons.map(validateButton);
    }
    return component;
  });

  const body = normalized.find((component) => component.type === "BODY");
  if (!body || !String(body.text ?? "").trim()) {
    throw new ValidationError("A template needs a BODY component with text");
  }

  return normalized;
}

export function validateTemplateName(name) {
  const value = asString(name, "name", { required: true, max: 512 });
  if (!NAME_PATTERN.test(value)) {
    throw new ValidationError(
      "name may only contain lowercase letters, numbers and underscores",
    );
  }
  return value;
}

export function validateTemplateLanguage(language) {
  const value = asString(language, "language", { required: true, max: 20 });
  if (!LANGUAGE_PATTERN.test(value)) {
    throw new ValidationError("language must be a Meta language code such as en_US");
  }
  return value;
}

function serializeTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    status: template.status ?? null,
    category: template.category ?? null,
    language: template.language ?? null,
    parameterFormat: template.parameter_format ?? null,
    components: template.components ?? [],
    qualityScore: template.quality_score ?? null,
    rejectedReason: template.rejected_reason ?? null,
    lastUpdatedTime: template.last_updated_time ?? null,
    previousCategory: template.previous_category ?? null,
    subCategory: template.sub_category ?? null,
  };
}

function statusFilter(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { metaStatus: null, statuses: ["APPROVED"], label: "APPROVED" };
  if (raw.toLowerCase() === "all") return { metaStatus: null, statuses: null, label: "all" };

  const statuses = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (statuses.length === 0) {
    return { metaStatus: null, statuses: ["APPROVED"], label: "APPROVED" };
  }
  for (const status of statuses) {
    if (!TEMPLATE_STATUSES.includes(status)) {
      throw new ValidationError(
        `status must be "all" or one of: ${TEMPLATE_STATUSES.join(", ")}`,
      );
    }
  }

  return {
    metaStatus: statuses.length === 1 ? statuses[0].toLowerCase() : null,
    statuses,
    label: statuses.join(","),
  };
}

export async function listTemplates({
  organizationId,
  phoneNumberId = null,
  wabaId = null,
  status = null,
  limit = 100,
  after = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const filter = statusFilter(status);
  const pageSize = asInt(limit, "limit", { min: 1, max: 100, fallback: 100 });

  const response = await getTemplatesFromMeta(context.wabaId, {
    ...context.requestOptions,
    status: filter.metaStatus,
    limit: pageSize,
    after: asString(after, "after", { max: 2048 }) ?? undefined,
  });

  const templates = (response?.data ?? [])
    .filter((template) => {
      if (!filter.statuses) return true;
      return filter.statuses.includes(String(template.status ?? "").toUpperCase());
    })
    .map(serializeTemplate);

  return {
    wabaId: context.wabaId,
    status: filter.label,
    templates,
    paging: response?.paging ?? null,
  };
}

export async function getTemplate({ organizationId, templateId, phoneNumberId = null, wabaId = null }) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(templateId, "templateId", { required: true, max: 128 });
  const response = await getTemplateFromMeta(id, context.requestOptions);
  return { wabaId: context.wabaId, template: serializeTemplate(response) };
}

export async function createTemplate({
  organizationId,
  phoneNumberId = null,
  wabaId = null,
  name,
  language,
  category,
  parameterFormat = null,
  components,
  allowCategoryChange = false,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });

  const payload = {
    name: validateTemplateName(name),
    language: validateTemplateLanguage(language),
    category: asEnum(
      String(category ?? "").toUpperCase(),
      "category",
      TEMPLATE_CATEGORIES,
      { required: true },
    ),
    components: validateTemplateComponents(components),
    ...(parameterFormat
      ? {
          parameter_format: asEnum(
            String(parameterFormat).toUpperCase(),
            "parameterFormat",
            ["POSITIONAL", "NAMED"],
          ),
        }
      : {}),
    ...(allowCategoryChange ? { allow_category_change: true } : {}),
  };

  const response = await createTemplateOnMeta(context.wabaId, payload, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.template.created",
    entityType: "MessageTemplate",
    entityId: response?.id ?? null,
    metadata: {
      name: payload.name,
      language: payload.language,
      category: payload.category,
      status: response?.status ?? null,
      wabaId: context.wabaId,
    },
    req,
  });

  return {
    wabaId: context.wabaId,
    template: {
      id: response?.id ?? null,
      name: payload.name,
      language: payload.language,
      category: response?.category ?? payload.category,
      status: response?.status ?? "PENDING",
    },
    response,
  };
}

export async function updateTemplate({
  organizationId,
  templateId,
  phoneNumberId = null,
  wabaId = null,
  category,
  parameterFormat,
  components,
  allowCategoryChange = false,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(templateId, "templateId", { required: true, max: 128 });

  const updates = {};
  if (category !== undefined) {
    updates.category = asEnum(
      String(category).toUpperCase(),
      "category",
      TEMPLATE_CATEGORIES,
      { required: true },
    );
  }
  if (parameterFormat !== undefined) {
    updates.parameter_format = asEnum(
      String(parameterFormat).toUpperCase(),
      "parameterFormat",
      ["POSITIONAL", "NAMED"],
      { required: true },
    );
  }
  if (components !== undefined) {
    updates.components = validateTemplateComponents(components);
  }
  if (allowCategoryChange) updates.allow_category_change = true;

  if (Object.keys(updates).length === 0) {
    throw new ValidationError("Provide components or category to update");
  }

  const response = await updateTemplateOnMeta(id, updates, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.template.updated",
    entityType: "MessageTemplate",
    entityId: id,
    metadata: { fields: Object.keys(updates), wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, templateId: id, success: response?.success !== false, response };
}

export async function deleteTemplate({
  organizationId,
  templateId,
  phoneNumberId = null,
  wabaId = null,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(templateId, "templateId", { required: true, max: 128 });

  const response = await deleteTemplateOnMeta(
    context.wabaId,
    { hsmIds: [id] },
    context.requestOptions,
  );

  await recordAudit({
    organizationId,
    action: "whatsapp.template.deleted",
    entityType: "MessageTemplate",
    entityId: id,
    metadata: { wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, templateId: id, success: response?.success !== false, response };
}

/** Used by the UI's "create a Flow template" assistant. */
export function buildFlowTemplateComponents({
  bodyText,
  buttonText = "Open Flow",
  flowId,
  flowName,
  flowJson,
  flowAction = "navigate",
  navigateScreen = "FIRST_ENTRY_SCREEN",
  footerText = null,
  headerText = null,
}) {
  return validateTemplateComponents([
    ...(headerText
      ? [{ type: "HEADER", format: "TEXT", text: String(headerText).slice(0, 60) }]
      : []),
    { type: "BODY", text: bodyText },
    ...(footerText ? [{ type: "FOOTER", text: String(footerText).slice(0, 60) }] : []),
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "FLOW",
          text: buttonText,
          ...(flowId ? { flow_id: flowId } : {}),
          ...(flowName ? { flow_name: flowName } : {}),
          ...(flowJson ? { flow_json: flowJson } : {}),
          flow_action: flowAction,
          ...(flowAction === "navigate" ? { navigate_screen: navigateScreen } : {}),
        },
      ],
    },
  ]);
}
