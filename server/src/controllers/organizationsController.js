import { getOrganization, updateOrganization } from "../services/organizations/service.js";
import { asString } from "../lib/validate.js";
import { ok } from "../utils/http.js";

export async function show(req, res) {
  const organization = await getOrganization({ organizationId: req.auth.organizationId });
  return ok(res, { organization });
}

export async function update(req, res) {
  const organization = await updateOrganization({
    organizationId: req.auth.organizationId,
    data: {
      name: req.body?.name === undefined ? undefined : asString(req.body.name, "name", { max: 120 }),
    },
    req,
  });
  return ok(res, { organization });
}
