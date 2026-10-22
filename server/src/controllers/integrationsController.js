import {
  createIntegration,
  deleteIntegration,
  listIntegrations,
  listProviders,
  testIntegration,
  updateIntegration,
} from "../services/integrations/index.js";
import { created, ok } from "../utils/http.js";

/** GET /api/integrations - connections plus the provider catalog. */
export async function index(req, res) {
  const integrations = await listIntegrations({ organizationId: req.auth.organizationId });
  return ok(res, { integrations, providers: listProviders() });
}

/** POST /api/integrations - connect a CRM/ecommerce provider (admin only). */
export async function create(req, res) {
  const body = req.body ?? {};
  const integration = await createIntegration({
    organizationId: req.auth.organizationId,
    category: body.category,
    provider: body.provider,
    name: body.name,
    input: body.fields ?? body.config ?? {},
    req,
  });
  return created(res, { integration });
}

/** PATCH /api/integrations/:id - rotate credentials or toggle the connection. */
export async function update(req, res) {
  const body = req.body ?? {};
  const integration = await updateIntegration({
    organizationId: req.auth.organizationId,
    integrationId: req.params.id,
    input: body.fields ?? body.config ?? {},
    name: body.name,
    isActive: body.isActive,
    req,
  });
  return ok(res, { integration });
}

/** DELETE /api/integrations/:id */
export async function remove(req, res) {
  const result = await deleteIntegration({
    organizationId: req.auth.organizationId,
    integrationId: req.params.id,
    req,
  });
  return ok(res, result);
}

/** POST /api/integrations/:id/test - one cheap provider call. */
export async function test(req, res) {
  const result = await testIntegration({
    organizationId: req.auth.organizationId,
    integrationId: req.params.id,
    req,
  });
  return ok(res, result);
}
