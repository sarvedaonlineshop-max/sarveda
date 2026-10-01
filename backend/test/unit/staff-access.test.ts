import { describe, expect, it } from "vitest";

import { isStaffLoginBlocked, staffRoleAfterLogin } from "../../src/modules/auth/staff-access";

const superAdmins = new Set(["partha@sarveda.com"]);
const bootstrap = new Set(["shiva@sarveda.com", "sowmya@sarveda.com"]);

describe("staff sign-in", () => {
  it("blocks the support mailbox", () => {
    expect(isStaffLoginBlocked("Care@Sarveda.com")).toBe(true);
    expect(
      staffRoleAfterLogin({
        email: "care@sarveda.com",
        role: "ADMIN",
        superAdmins,
        bootstrapAdmins: bootstrap,
        activeWhitelist: true
      })
    ).toBe("CUSTOMER");
  });

  it("drops admin from anyone who is not on the list", () => {
    expect(
      staffRoleAfterLogin({
        email: "admin@sarveda.com",
        role: "ADMIN",
        superAdmins,
        bootstrapAdmins: bootstrap,
        activeWhitelist: false
      })
    ).toBe("CUSTOMER");
  });

  it("keeps a whitelisted admin and a super admin", () => {
    expect(
      staffRoleAfterLogin({
        email: "sowmya@sarveda.com",
        role: "ADMIN",
        superAdmins,
        bootstrapAdmins: bootstrap,
        activeWhitelist: true
      })
    ).toBe("ADMIN");
    expect(
      staffRoleAfterLogin({
        email: "partha@sarveda.com",
        role: "ADMIN",
        superAdmins,
        bootstrapAdmins: bootstrap,
        activeWhitelist: true
      })
    ).toBe("SUPER_ADMIN");
  });
});
