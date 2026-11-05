import { describe, expect, it } from "vitest";

import { deskOnlyRequestAllowed, isDeskOnlyAdminEmail } from "../../src/modules/auth/desk-only-access";

describe("desk-only admin", () => {
  it("recognises Karthik", () => {
    expect(isDeskOnlyAdminEmail("Karthik@sarveda.com")).toBe(true);
    expect(isDeskOnlyAdminEmail("sowmya@sarveda.com")).toBe(false);
  });

  it("allows chats, quotations, and the tasks handoff", () => {
    expect(deskOnlyRequestAllowed("GET", "/api/admin/enquiries?page=1")).toBe(true);
    expect(deskOnlyRequestAllowed("POST", "/api/admin/enquiries/abc/reply")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/crm/sales-quotes/approvals")).toBe(true);
    expect(deskOnlyRequestAllowed("POST", "/api/complaints/auth/from-admin")).toBe(true);
    expect(deskOnlyRequestAllowed("PATCH", "/api/admin/notification-preferences")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/orders")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/orders/7f7d01ef-3b1a-4082-bd1b-3f8be4cd3dc7")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/orders/7f7d01ef-3b1a-4082-bd1b-3f8be4cd3dc7/shipping-breakdown")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/pickup-locations")).toBe(true);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/return-cases/by-number/RC-202610-00011")).toBe(true);
  });

  it("blocks the rest of the admin", () => {
    expect(deskOnlyRequestAllowed("GET", "/api/admin/orders/export")).toBe(false);
    expect(deskOnlyRequestAllowed("POST", "/api/admin/orders/7f7d01ef-3b1a-4082-bd1b-3f8be4cd3dc7/refund")).toBe(false);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/pickup-locations/abc")).toBe(false);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/products")).toBe(false);
    expect(deskOnlyRequestAllowed("POST", "/api/admin/orders/abc/refund")).toBe(false);
    expect(deskOnlyRequestAllowed("GET", "/api/complaints/admin/whitelist")).toBe(false);
    expect(deskOnlyRequestAllowed("GET", "/api/admin/crm/deals")).toBe(false);
  });
});
