import { describe, expect, it } from "vitest";

import { nextChatOwner, normalizeChatPipeline } from "../../src/modules/crm/chat-pipeline.service";
import { canAssignChatOwner, canSeeAllCrm } from "../../src/modules/crm/crm-team-access";

describe("chat pipeline", () => {
  it("maps legacy statuses onto the live pipeline", () => {
    expect(normalizeChatPipeline("CONTACTED")).toBe("ONGOING");
    expect(normalizeChatPipeline("WON")).toBe("COMPLETED");
    expect(normalizeChatPipeline("LOST")).toBe("NOT_INTERESTED");
    expect(normalizeChatPipeline("FOLLOW_UP")).toBe("FOLLOWUP");
    expect(normalizeChatPipeline("QUOTATION_SENT")).toBe("QUOTATION_SENT");
  });

  it("lets the first admin claim an empty chat and then keeps that owner", () => {
    expect(nextChatOwner({ currentOwnerId: null, claimantId: "varun" })).toBe("varun");
    expect(nextChatOwner({ currentOwnerId: "shiva", claimantId: "varun" })).toBe("shiva");
    expect(nextChatOwner({ currentOwnerId: "shiva", claimantId: "shiva" })).toBe("shiva");
  });
});

describe("chat assign access", () => {
  it("is only Partha and Arjun", () => {
    expect(canAssignChatOwner("partha@sarveda.com")).toBe(true);
    expect(canAssignChatOwner("arjun@sarveda.com")).toBe(true);
    expect(canAssignChatOwner("Partha@Sarveda.com")).toBe(true);
    expect(canAssignChatOwner("shiva@sarveda.com")).toBe(false);
    expect(canAssignChatOwner("varun@sarveda.com")).toBe(false);
  });

  it("does not treat other super-admins as assigners", () => {
    expect(canSeeAllCrm("deepak@sarveda.com", "SUPER_ADMIN")).toBe(true);
    expect(canAssignChatOwner("deepak@sarveda.com")).toBe(false);
  });
});
