import { ValidationError } from "../../../lib/errors.js";
import { isNotFound, requestJson, requireString } from "./http.js";

/**
 * HubSpot CRM adapter (private-app access token).
 *
 * Contract methods map to the CRM v3 objects API. The adapter normalizes
 * responses so the AI sees a small customer shape, not HubSpot's payload.
 */

const CONTACT_PROPERTIES = ["email", "firstname", "lastname", "phone"];

function mapContact(record) {
  const properties = record?.properties ?? {};
  const name = [properties.firstname, properties.lastname].filter(Boolean).join(" ").trim();
  return {
    id: record?.id ?? null,
    name: name || properties.email || null,
    email: properties.email ?? null,
    phone: properties.phone ?? null,
  };
}

function contactProperties({ email, name, phone, attributes }) {
  const properties = {};
  if (email) properties.email = String(email).trim();
  if (phone) properties.phone = String(phone).trim();
  if (name) {
    const [firstname, ...rest] = String(name).trim().split(/\s+/);
    properties.firstname = firstname;
    if (rest.length) properties.lastname = rest.join(" ");
  }
  if (attributes && typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        properties[key] = String(value);
      }
    }
  }
  return properties;
}

export function createHubSpotAdapter({ credentials = {}, config = {} } = {}) {
  const accessToken = credentials.accessToken;
  if (!accessToken) throw new ValidationError("HubSpot access token is missing");

  const baseUrl = String(config.baseUrl || "https://api.hubapi.com").replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${accessToken}` };
  const request = (path, options = {}) => requestJson(`${baseUrl}${path}`, { ...options, headers });

  async function findCustomer({ email, phone } = {}) {
    if (email) {
      try {
        const record = await request(
          `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email&properties=${CONTACT_PROPERTIES.join(",")}`,
        );
        return mapContact(record);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }

    if (phone) {
      const result = await request("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: {
          filterGroups: [
            { filters: [{ propertyName: "phone", operator: "EQ", value: String(phone) }] },
          ],
          properties: CONTACT_PROPERTIES,
          limit: 1,
        },
      });
      const record = result?.results?.[0];
      return record ? mapContact(record) : null;
    }

    throw new ValidationError("findCustomer requires an email or phone");
  }

  async function createCustomer(input = {}) {
    const properties = contactProperties(input);
    if (!properties.email && !properties.phone) {
      throw new ValidationError("createCustomer requires an email or phone");
    }
    const record = await request("/crm/v3/objects/contacts", {
      method: "POST",
      body: { properties },
    });
    return mapContact(record);
  }

  async function updateCustomer({ id, ...changes } = {}) {
    const contactId = requireString(id, "id");
    const properties = contactProperties(changes);
    if (Object.keys(properties).length === 0) {
      throw new ValidationError("updateCustomer requires at least one field");
    }
    const record = await request(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      body: { properties },
    });
    return mapContact(record);
  }

  async function addNote({ customerId, body } = {}) {
    const contactId = requireString(customerId, "customerId");
    const noteBody = requireString(body, "body", { max: 5_000 });

    const note = await request("/crm/v3/objects/notes", {
      method: "POST",
      body: {
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202,
              },
            ],
          },
        ],
      },
    });

    return { id: note?.id ?? null, customerId: contactId };
  }

  async function createLead({ email, name, phone, note, attributes } = {}) {
    if (!email && !phone) throw new ValidationError("createLead requires an email or phone");

    const existing = await findCustomer({ email, phone });
    const customer = existing
      ? await updateCustomer({ id: existing.id, email, name, phone, attributes })
      : await createCustomer({ email, name, phone, attributes });

    const savedNote = note ? await addNote({ customerId: customer.id, body: note }) : null;
    return { customer, note: savedNote };
  }

  async function ping() {
    await request("/crm/v3/objects/contacts?limit=1&properties=email");
    return { ok: true, provider: "hubspot" };
  }

  return { findCustomer, createCustomer, updateCustomer, addNote, createLead, ping };
}
