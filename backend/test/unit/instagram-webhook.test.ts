import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import {
  isAllowedInstagramMediaUrl,
  parseInstagramWebhook,
  verifyInstagramSignature
} from "../../src/modules/instagram/instagram-webhook.parse";

describe("verifyInstagramSignature", () => {
  it("accepts Meta's sha256 signature of the raw body", () => {
    const raw = Buffer.from('{"object":"instagram"}');
    const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
    expect(verifyInstagramSignature(raw, signature, "app-secret")).toBe(true);
  });

  it("rejects a missing or wrong signature", () => {
    const raw = Buffer.from("{}");
    expect(verifyInstagramSignature(raw, undefined, "app-secret")).toBe(false);
    expect(verifyInstagramSignature(raw, "sha256=deadbeef", "app-secret")).toBe(false);
  });
});

describe("isAllowedInstagramMediaUrl", () => {
  it("allows Meta CDN hosts and rejects other hosts", () => {
    expect(isAllowedInstagramMediaUrl("https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1")).toBe(true);
    expect(isAllowedInstagramMediaUrl("https://scontent.cdninstagram.com/v/photo.jpg")).toBe(true);
    expect(isAllowedInstagramMediaUrl("http://lookaside.fbsbx.com/a.jpg")).toBe(false);
    expect(isAllowedInstagramMediaUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedInstagramMediaUrl("https://evil.example/lookaside.fbsbx.com")).toBe(false);
  });
});

describe("parseInstagramWebhook", () => {
  it("keeps a customer text DM and drops our own echo", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "customer-1" },
              message: { mid: "m1", text: "Do you ship to the UK?" }
            },
            {
              sender: { id: "page" },
              message: { mid: "m2", text: "Yes", is_echo: true }
            }
          ]
        }
      ]
    });
    expect(events).toEqual([
      {
        mid: "m1",
        senderId: "customer-1",
        text: "Do you ship to the UK?",
        attachments: []
      }
    ]);
  });

  it("keeps an image only when the URL is on Meta's CDN", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "customer-1" },
              message: {
                mid: "m3",
                attachments: [
                  { type: "image", payload: { url: "https://lookaside.fbsbx.com/ig.jpg" } },
                  { type: "image", payload: { url: "https://evil.example/ig.jpg" } }
                ]
              }
            }
          ]
        }
      ]
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.attachments).toEqual([
      { type: "image", url: "https://lookaside.fbsbx.com/ig.jpg" }
    ]);
    expect(events[0]?.text).toBe("[image]");
  });
});
