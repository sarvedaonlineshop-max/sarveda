import { describe, expect, it } from "vitest";

import { reactionFromContent } from "../../src/modules/whatsapp/whatsapp-inbox.service";

describe("reactionFromContent", () => {
  it("reads the emoji and the message it was applied to", () => {
    expect(
      reactionFromContent({
        type: "reaction",
        reaction: { emoji: "👍", message_id: "wamid.abc" }
      })
    ).toEqual({ emoji: "👍", targetSid: "wamid.abc" });
  });

  it("treats an empty emoji as a removed reaction", () => {
    expect(reactionFromContent({ type: "reaction", reaction: { emoji: "  ", message_id: "m1" } })).toEqual({
      emoji: "",
      targetSid: "m1"
    });
  });

  it("ignores ordinary text", () => {
    expect(reactionFromContent({ type: "text", text: { body: "Yes" } })).toBeNull();
  });
});
