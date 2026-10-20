import { chatCompletion } from "../services/ai/provider.js";
import {
  getAiConfig,
  getCredentialSettings,
  updateCredentialSettings,
} from "../services/settings/index.js";
import { ok } from "../utils/http.js";

/** GET /api/settings - effective BYOK configuration, secrets redacted. */
export async function show(req, res) {
  const settings = await getCredentialSettings({ organizationId: req.auth.organizationId });
  return ok(res, settings);
}

/** PATCH /api/settings - update Meta and/or AI credentials (admin only). */
export async function update(req, res) {
  const settings = await updateCredentialSettings({
    organizationId: req.auth.organizationId,
    data: req.body ?? {},
    req,
  });
  return ok(res, settings);
}

/**
 * POST /api/settings/test-ai - make one tiny completion with the saved config so
 * the operator can prove the key works before a customer message hits it.
 */
export async function testAi(req, res) {
  const config = await getAiConfig({ organizationId: req.auth.organizationId });

  const completion = await chatCompletion({
    messages: [
      {
        role: "user",
        content: "Reply with the single word OK.",
      },
    ],
    maxTokens: 8,
    temperature: 0,
    config,
  });

  return ok(res, {
    ok: true,
    provider: completion.provider,
    model: config.model,
    text: completion.text,
  });
}
