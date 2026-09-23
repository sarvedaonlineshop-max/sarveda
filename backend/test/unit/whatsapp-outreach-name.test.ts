import { describe, expect, it } from "vitest";

import { outreachCustomerFirstName } from "../../src/modules/enquiries/whatsapp-outreach";

describe("outreachCustomerFirstName", () => {
  it("uses the first word of a stored customer name", () => {
    expect(outreachCustomerFirstName("Neelam A Cheaw")).toBe("Neelam");
  });

  it("falls back to there when the name is missing", () => {
    expect(outreachCustomerFirstName(null)).toBe("there");
    expect(outreachCustomerFirstName("   ")).toBe("there");
  });

  it("falls back to there when the stored name is just the WhatsApp number", () => {
    expect(outreachCustomerFirstName("+919876543210", "+919876543210")).toBe("there");
  });
});
