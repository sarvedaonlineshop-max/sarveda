import { describe, expect, it } from "vitest";

import { CANONICAL_STORE_ADMINS } from "../../src/modules/complaints/canonical-store-admins";

describe("canonical store admins", () => {
  it("includes sowmya@sarveda.com and accounts@sarveda.com as store admins", () => {
    expect(CANONICAL_STORE_ADMINS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "sowmya@sarveda.com",
          name: "Sowmya"
        }),
        expect.objectContaining({
          email: "accounts@sarveda.com",
          name: "Accounts"
        })
      ])
    );
  });
});
