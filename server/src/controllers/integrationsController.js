import { listIntegrations } from "../services/integrations/index.js";
import { ok } from "../utils/http.js";

/** GET /api/integrations - adapter contract plus what this org has connected. */
export async function index(req, res) {
  const integrations = await listIntegrations({ organizationId: req.auth.organizationId });
  return ok(res, { integrations });
}
