import { createTeamMember, listTeam, updateTeamMember } from "../services/auth/service.js";
import { created, ok } from "../utils/http.js";

export async function index(req, res) {
  const members = await listTeam({ organizationId: req.auth.organizationId });
  return ok(res, { members });
}

export async function create(req, res) {
  const member = await createTeamMember({
    organizationId: req.auth.organizationId,
    name: req.body?.name,
    email: req.body?.email,
    password: req.body?.password,
    role: req.body?.role,
    req,
  });
  return created(res, { member });
}

export async function update(req, res) {
  const member = await updateTeamMember({
    organizationId: req.auth.organizationId,
    userId: req.params.id,
    data: req.body ?? {},
    req,
  });
  return ok(res, { member });
}
