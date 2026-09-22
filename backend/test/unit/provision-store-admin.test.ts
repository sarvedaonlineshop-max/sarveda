import { describe, expect, it } from "vitest";

import { CANONICAL_STORE_ADMINS } from "../../src/modules/complaints/canonical-store-admins";

describe("canonical store admins", () => {
  it("includes sowmya, accounts, and prem as store admins", () => {
    expect(CANONICAL_STORE_ADMINS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "sowmya@sarveda.com",
          name: "Sowmya"
        }),
        expect.objectContaining({
          email: "accounts@sarveda.com",
          name: "Accounts"
        }),
        expect.objectContaining({
          email: "prem@sarveda.com",
          name: "Prem",
          resetPassword: true
        })
      ])
    );
  });
});
