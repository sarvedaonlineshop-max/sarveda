import { describe, expect, it } from "vitest";

import { canAssignChatOwner } from "../../src/modules/crm/crm-team-access";

describe("chat assign access", () => {
  it("allows Partha and Arjun only", () => {
    expect(canAssignChatOwner("partha@sarveda.com")).toBe(true);
    expect(canAssignChatOwner("arjun@sarveda.com")).toBe(true);
    expect(canAssignChatOwner("Partha@Sarveda.com")).toBe(true);
    expect(canAssignChatOwner("shiva@sarveda.com")).toBe(false);
    expect(canAssignChatOwner("varun@sarveda.com")).toBe(false);
    expect(canAssignChatOwner("deepak@sarveda.com")).toBe(false);
  });
});
