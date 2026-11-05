import { describe, expect, it } from "vitest";
import { resolveWaDeliveryState, WA_PENDING_MS, WA_STALE_MS } from "./wa-delivery-status";

describe("resolveWaDeliveryState", () => {
  const t0 = Date.parse("2026-10-13T10:00:00.000Z");

  it("marks fresh sent as sending", () => {
    expect(resolveWaDeliveryState("sent", new Date(t0).toISOString(), t0 + 30_000)).toBe(
      "sending"
    );
  });

  it("marks aging sent as pending then undelivered", () => {
    expect(
      resolveWaDeliveryState("sent", new Date(t0).toISOString(), t0 + WA_PENDING_MS + 1)
    ).toBe("pending");
    expect(resolveWaDeliveryState("sent", new Date(t0).toISOString(), t0 + WA_STALE_MS + 1)).toBe(
      "undelivered"
    );
  });

  it("keeps failed / delivered / read explicit", () => {
    expect(resolveWaDeliveryState("failed", new Date(t0).toISOString(), t0 + WA_STALE_MS)).toBe(
      "failed"
    );
    expect(resolveWaDeliveryState("delivered", new Date(t0).toISOString(), t0 + WA_STALE_MS)).toBe(
      "delivered"
    );
    expect(resolveWaDeliveryState("read", new Date(t0).toISOString(), t0 + WA_STALE_MS)).toBe(
      "read"
    );
  });
});
