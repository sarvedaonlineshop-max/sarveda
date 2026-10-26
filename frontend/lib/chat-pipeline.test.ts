import { describe, expect, it } from "vitest";

import { chatAdminSenderLabel, normalizeChatPipeline } from "./chat-pipeline";

describe("chat pipeline labels", () => {
  it("maps legacy statuses", () => {
    expect(normalizeChatPipeline("CONTACTED")).toBe("ONGOING");
  });

  it("shows the chatting admin under dashboard bubbles only", () => {
    expect(
      chatAdminSenderLabel({
        authorType: "ADMIN",
        authorName: "Shiva",
        adminUser: { name: "Shivakumar", email: "shiva@sarveda.com" }
      })
    ).toBe("Shivakumar");
    expect(
      chatAdminSenderLabel({ authorType: "ADMIN", authorName: "Varun", adminUser: null })
    ).toBe("Varun");
    expect(
      chatAdminSenderLabel({
        authorType: "ADMIN",
        authorName: "Sarveda Assistant",
        adminUser: null
      })
    ).toBeNull();
    expect(
      chatAdminSenderLabel({ authorType: "CUSTOMER", authorName: "Gaby", adminUser: null })
    ).toBeNull();
  });
});
