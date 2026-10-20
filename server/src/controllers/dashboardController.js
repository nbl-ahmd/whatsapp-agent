import { getDashboard } from "../services/analytics/index.js";
import { ok } from "../utils/http.js";

/** GET /api/dashboard - operational counts for the signed-in organization. */
export async function dashboard(req, res) {
  const data = await getDashboard({ organizationId: req.auth.organizationId });
  return ok(res, data);
}
