import { describe, expect, it } from "vitest";

import { normalizeChatPipeline } from "../../src/modules/crm/chat-pipeline.service";

describe("chat pipeline", () => {
  it("maps legacy statuses onto the live pipeline", () => {
    expect(normalizeChatPipeline("CONTACTED")).toBe("ONGOING");
    expect(normalizeChatPipeline("WON")).toBe("COMPLETED");
    expect(normalizeChatPipeline("LOST")).toBe("NOT_INTERESTED");
    expect(normalizeChatPipeline("FOLLOW_UP")).toBe("FOLLOWUP");
    expect(normalizeChatPipeline("QUOTATION_SENT")).toBe("QUOTATION_SENT");
  });
});
