import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrganizationId,
  assertSameTenant,
  tenantData,
  tenantWhere,
} from "../src/lib/tenant.js";

test("tenantWhere scopes the where clause to the organization", () => {
  assert.deepEqual(tenantWhere("org_1", { status: "open" }), {
    status: "open",
    organizationId: "org_1",
  });
});

test("tenantWhere cannot be overridden by caller-supplied organizationId", () => {
  assert.deepEqual(tenantWhere("org_1", { organizationId: "org_attacker" }), {
    organizationId: "org_1",
  });
});

test("tenantData scopes create payloads", () => {
  assert.deepEqual(tenantData("org_1", { name: "Alice" }), {
    name: "Alice",
    organizationId: "org_1",
  });
});

test("assertOrganizationId rejects missing tenant context", () => {
  assert.throws(() => assertOrganizationId(undefined), /Missing tenant context/);
  assert.throws(() => assertOrganizationId(""), /Missing tenant context/);
});

test("assertSameTenant allows own records and blocks cross-tenant records", () => {
  const record = { id: "c1", organizationId: "org_1" };
  assert.equal(assertSameTenant("org_1", record), record);
  assert.throws(() => assertSameTenant("org_2", record), /Cross-tenant access denied/);
  assert.throws(() => assertSameTenant("org_1", null), /Cross-tenant access denied/);
});
