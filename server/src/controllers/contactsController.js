import {
  addContactTag,
  getContactDetail,
  listContacts,
  listContactTags,
  removeContactTag,
  updateContact,
} from "../services/contacts/service.js";
import { asInt, asString, asStringArray } from "../lib/validate.js";
import { ok } from "../utils/http.js";

export async function index(req, res) {
  const contacts = await listContacts({
    organizationId: req.auth.organizationId,
    search: asString(req.query.search, "search", { max: 120 }),
    tag: asString(req.query.tag, "tag", { max: 40 }),
    take: asInt(req.query.limit, "limit", { min: 1, max: 200, fallback: 100 }),
  });
  return ok(res, { contacts });
}

export async function tags(req, res) {
  const data = await listContactTags({ organizationId: req.auth.organizationId });
  return ok(res, data);
}

export async function show(req, res) {
  const contact = await getContactDetail({
    organizationId: req.auth.organizationId,
    contactId: req.params.id,
  });
  return ok(res, { contact });
}

export async function update(req, res) {
  const contact = await updateContact({
    organizationId: req.auth.organizationId,
    contactId: req.params.id,
    data: {
      name: req.body?.name === undefined ? undefined : asString(req.body.name, "name", { max: 120 }),
      email: req.body?.email === undefined ? undefined : asString(req.body.email, "email", { max: 200 }),
      locale:
        req.body?.locale === undefined ? undefined : asString(req.body.locale, "locale", { max: 12 }),
      tags: asStringArray(req.body?.tags, "tags"),
      attributes:
        req.body?.attributes === undefined
          ? undefined
          : req.body.attributes && typeof req.body.attributes === "object"
            ? req.body.attributes
            : {},
    },
  });

  return ok(res, { contact });
}

export async function addTag(req, res) {
  const contact = await addContactTag({
    organizationId: req.auth.organizationId,
    contactId: req.params.id,
    tag: asString(req.body?.tag, "tag", { required: true, max: 40 }),
  });
  return ok(res, { contact });
}

export async function removeTag(req, res) {
  const contact = await removeContactTag({
    organizationId: req.auth.organizationId,
    contactId: req.params.id,
    tag: asString(req.params.tag, "tag", { required: true, max: 40 }),
  });
  return ok(res, { contact });
}
