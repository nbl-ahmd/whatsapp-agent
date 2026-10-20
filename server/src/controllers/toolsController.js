import {
  ensureOrganizationTools,
  listOrganizationTools,
  setToolActive,
  setToolPermission,
} from "../services/tools/index.js";
import { NotFoundError } from "../lib/errors.js";
import { ok } from "../utils/http.js";

export async function index(req, res) {
  // Sync any tool added to the registry since this org was created.
  const tools = await ensureOrganizationTools({ organizationId: req.auth.organizationId });
  return ok(res, { tools });
}

export async function update(req, res) {
  const organizationId = req.auth.organizationId;

  if (req.body?.isActive !== undefined) {
    const updated = await setToolActive({
      organizationId,
      toolId: req.params.id,
      isActive: Boolean(req.body.isActive),
    });
    if (!updated) throw new NotFoundError("Tool not found");
    return ok(res, { tool: updated });
  }

  if (req.body?.permission !== undefined) {
    const updated = await setToolPermission({
      organizationId,
      toolId: req.params.id,
      permission: req.body.permission === "write" ? "write" : "read",
    });
    if (!updated) throw new NotFoundError("Tool not found");
    return ok(res, { tool: updated });
  }

  const tools = await listOrganizationTools({ organizationId });
  return ok(res, { tools });
}
