import { recordAudit } from "../../lib/audit.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { asBoolean, asInt, asString, asStringArray } from "../../lib/validate.js";
import { resolveMetaAccountContext } from "./context.js";
import {
  createFlow as createFlowOnMeta,
  deleteFlow as deleteFlowOnMeta,
  deprecateFlow as deprecateFlowOnMeta,
  getFlow as getFlowFromMeta,
  getFlowAsset as getFlowAssetFromMeta,
  getFlowAssets as getFlowAssetsFromMeta,
  getFlows as getFlowsFromMeta,
  publishFlow as publishFlowOnMeta,
  updateFlow as updateFlowOnMeta,
  uploadFlowAsset as uploadFlowAssetOnMeta,
} from "./service.js";

/**
 * WhatsApp Flows management. Meta owns the Flow lifecycle (DRAFT → PUBLISHED →
 * DEPRECATED), so these functions are thin, tenant-scoped wrappers.
 *
 * Test numbers can only send templates. To use a Flow from a test number,
 * create a Flow template whose FLOW button references this Flow (or inline Flow
 * JSON), then send that template from the WhatsApp page.
 */

export const FLOW_CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
];

function serializeFlow(flow) {
  return {
    id: flow.id,
    name: flow.name ?? null,
    status: flow.status ?? null,
    categories: flow.categories ?? [],
    validationErrors: flow.validation_errors ?? [],
    jsonVersion: flow.json_version ?? null,
    dataApiVersion: flow.data_api_version ?? null,
    endpointUri: flow.endpoint_uri ?? null,
    previewUrl: flow.preview?.preview_url ?? null,
    previewExpiresAt: flow.preview?.expires_at ?? null,
    healthStatus: flow.health_status ?? null,
  };
}

function validateCategories(value) {
  const categories = asStringArray(value, "categories", { max: 5, itemMaxLength: 40 });
  if (!categories || categories.length === 0) {
    throw new ValidationError("categories must contain at least one Flow category");
  }
  for (const category of categories) {
    if (!FLOW_CATEGORIES.includes(category)) {
      throw new ValidationError(`categories must be one of: ${FLOW_CATEGORIES.join(", ")}`);
    }
  }
  return categories;
}

/** Accept a parsed object or JSON text, then enforce the minimum Flow shape. */
export function parseFlowJson(value) {
  let flow;
  if (typeof value === "string") {
    if (!value.trim()) throw new ValidationError("flowJson is empty");
    if (value.length > 1_000_000) {
      throw new ValidationError("flowJson is too large (max 1 MB)");
    }
    try {
      flow = JSON.parse(value);
    } catch {
      throw new ValidationError("flowJson must be valid JSON");
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    flow = value;
  } else {
    throw new ValidationError("flowJson must be a JSON object or JSON text");
  }

  if (!flow.version || typeof flow.version !== "string") {
    throw new ValidationError("flowJson.version is required");
  }
  if (!Array.isArray(flow.screens) || flow.screens.length === 0) {
    throw new ValidationError("flowJson.screens must be a non-empty array");
  }
  for (const [index, screen] of flow.screens.entries()) {
    if (!screen || typeof screen !== "object" || !screen.id) {
      throw new ValidationError(`flowJson.screens[${index}].id is required`);
    }
    if (!screen.layout || typeof screen.layout !== "object") {
      throw new ValidationError(`flowJson.screens[${index}].layout is required`);
    }
  }

  return flow;
}

export async function listFlows({
  organizationId,
  phoneNumberId = null,
  wabaId = null,
  limit = 100,
  after = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const response = await getFlowsFromMeta(context.wabaId, {
    ...context.requestOptions,
    limit: asInt(limit, "limit", { min: 1, max: 100, fallback: 100 }),
    after: asString(after, "after", { max: 2048 }) ?? undefined,
  });

  return {
    wabaId: context.wabaId,
    flows: (response?.data ?? []).map(serializeFlow),
    paging: response?.paging ?? null,
  };
}

export async function getFlow({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  includePreview = true,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const response = await getFlowFromMeta(id, {
    ...context.requestOptions,
    fields: includePreview
      ? "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview,health_status"
      : "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,health_status",
  });

  return { wabaId: context.wabaId, flow: serializeFlow(response) };
}

export async function getFlowAssets({ organizationId, flowId, phoneNumberId = null, wabaId = null }) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const response = await getFlowAssetsFromMeta(id, context.requestOptions);
  return { wabaId: context.wabaId, assets: response?.data ?? [] };
}

export async function getFlowJson({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });

  const assets = await getFlowAssetsFromMeta(id, context.requestOptions);
  const asset = (assets?.data ?? []).find(
    (item) => String(item.asset_type ?? "").toUpperCase() === "FLOW_JSON" && item.download_url,
  );
  if (!asset) throw new NotFoundError("This Flow has no JSON asset yet");

  const flowJson = await getFlowAssetFromMeta(asset.download_url, context.requestOptions);
  return { wabaId: context.wabaId, flowId: id, flowJson };
}

export async function createFlow({
  organizationId,
  phoneNumberId = null,
  wabaId = null,
  name,
  categories,
  flowJson = null,
  publish = false,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const shouldPublish = asBoolean(publish, "publish") ?? false;

  const payload = {
    name: asString(name, "name", { required: true, max: 128 }),
    categories: validateCategories(categories),
  };

  if (flowJson !== null && flowJson !== undefined && flowJson !== "") {
    const parsed = parseFlowJson(flowJson);
    payload.flow_json = JSON.stringify(parsed);
    if (shouldPublish) payload.publish = true;
  } else if (shouldPublish) {
    throw new ValidationError("publish requires flowJson so Meta has something to validate");
  }

  const response = await createFlowOnMeta(context.wabaId, payload, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.created",
    entityType: "WhatsAppFlow",
    entityId: response?.id ?? null,
    metadata: {
      name: payload.name,
      categories: payload.categories,
      publish: shouldPublish,
      validationErrors: response?.validation_errors?.length ?? 0,
      wabaId: context.wabaId,
    },
    req,
  });

  return {
    wabaId: context.wabaId,
    flow: {
      id: response?.id ?? null,
      name: payload.name,
      status: response?.status ?? "DRAFT",
      categories: payload.categories,
      validationErrors: response?.validation_errors ?? [],
    },
    response,
  };
}

export async function updateFlow({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  name,
  categories,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });

  const updates = {};
  if (name !== undefined) updates.name = asString(name, "name", { required: true, max: 128 });
  if (categories !== undefined) updates.categories = validateCategories(categories);

  if (Object.keys(updates).length === 0) {
    throw new ValidationError("Provide name or categories to update");
  }

  const response = await updateFlowOnMeta(id, updates, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.updated",
    entityType: "WhatsAppFlow",
    entityId: id,
    metadata: { fields: Object.keys(updates), wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, flowId: id, success: response?.success !== false, response };
}

export async function uploadFlowJson({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  flowJson,
  publish = false,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const parsed = parseFlowJson(flowJson);

  const response = await uploadFlowAssetOnMeta(id, parsed, context.requestOptions);
  let published = null;
  if ((asBoolean(publish, "publish") ?? false) && (response?.validation_errors?.length ?? 0) === 0) {
    published = await publishFlowOnMeta(id, context.requestOptions);
  }

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.asset_uploaded",
    entityType: "WhatsAppFlow",
    entityId: id,
    metadata: {
      validationErrors: response?.validation_errors?.length ?? 0,
      published: Boolean(published?.success),
      wabaId: context.wabaId,
    },
    req,
  });

  return {
    wabaId: context.wabaId,
    flowId: id,
    success: response?.success !== false,
    validationErrors: response?.validation_errors ?? [],
    published: published?.success ?? false,
    response,
  };
}

export async function publishFlow({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const response = await publishFlowOnMeta(id, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.published",
    entityType: "WhatsAppFlow",
    entityId: id,
    metadata: { success: response?.success !== false, wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, flowId: id, success: response?.success !== false, response };
}

export async function deprecateFlow({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const response = await deprecateFlowOnMeta(id, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.deprecated",
    entityType: "WhatsAppFlow",
    entityId: id,
    metadata: { success: response?.success !== false, wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, flowId: id, success: response?.success !== false, response };
}

export async function deleteFlow({
  organizationId,
  flowId,
  phoneNumberId = null,
  wabaId = null,
  req = null,
}) {
  const context = await resolveMetaAccountContext({ organizationId, phoneNumberId, wabaId });
  const id = asString(flowId, "flowId", { required: true, max: 128 });
  const response = await deleteFlowOnMeta(id, context.requestOptions);

  await recordAudit({
    organizationId,
    action: "whatsapp.flow.deleted",
    entityType: "WhatsAppFlow",
    entityId: id,
    metadata: { success: response?.success !== false, wabaId: context.wabaId },
    req,
  });

  return { wabaId: context.wabaId, flowId: id, success: response?.success !== false, response };
}
