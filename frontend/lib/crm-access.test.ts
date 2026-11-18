/**
 * Unit tests for who can see the admin CRM sidebar link.
 * Run: cd frontend && npx tsx --test lib/crm-access.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCrmSidebarEmail } from "./crm-access";

describe("isCrmSidebarEmail", () => {
  it("allows only partha@sarveda.com", () => {
    assert.equal(isCrmSidebarEmail("partha@sarveda.com"), true);
    assert.equal(isCrmSidebarEmail("  Partha@Sarveda.com "), true);
  });

  it("hides CRM for every other address", () => {
    assert.equal(isCrmSidebarEmail("arjun@sarveda.com"), false);
    assert.equal(isCrmSidebarEmail("accounts@sarveda.com"), false);
    assert.equal(isCrmSidebarEmail(""), false);
    assert.equal(isCrmSidebarEmail(null), false);
    assert.equal(isCrmSidebarEmail(undefined), false);
  });
});
