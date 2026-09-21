import { describe, expect, it } from "vitest";

import { CANONICAL_STORE_ADMINS } from "../../src/modules/complaints/canonical-store-admins";

describe("canonical store admins", () => {
  it("includes sowmya@sarveda.com as a store admin", () => {
    expect(CANONICAL_STORE_ADMINS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "sowmya@sarveda.com",
          name: "Sowmya"
        })
      ])
    );
  });
});
