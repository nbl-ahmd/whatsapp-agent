import { changePassword, login, registerOrganization } from "../services/auth/service.js";
import { created, ok } from "../utils/http.js";

export async function register(req, res) {
  const result = await registerOrganization({
    organizationName: req.body?.organizationName,
    name: req.body?.name,
    email: req.body?.email,
    password: req.body?.password,
    req,
  });
  return created(res, result);
}

export async function signIn(req, res) {
  const result = await login({ email: req.body?.email, password: req.body?.password, req });
  return ok(res, result);
}

export async function me(req, res) {
  return ok(res, { user: req.auth.user, organization: req.auth.organization });
}

export async function updatePassword(req, res) {
  const result = await changePassword({
    userId: req.auth.userId,
    organizationId: req.auth.organizationId,
    currentPassword: req.body?.currentPassword,
    newPassword: req.body?.newPassword,
  });
  return ok(res, result);
}
