import { collectionNote, deliveryStep, feedbackAfterResponse, feedbackMessage, trackingTimeline } from "../../src/modules/crm/order-desk";

describe("order desk delivery", () => {
  it("maps courier and order status onto the dispatch steps", () => {
    expect(deliveryStep("PROCESSING", "CREATED")).toBe("AWAITING_DISPATCH");
    expect(deliveryStep("PACKED", null)).toBe("PACKING");
    expect(deliveryStep("SHIPPED", "PICKED")).toBe("DISPATCHED");
    expect(deliveryStep("SHIPPED", "INTRANSIT")).toBe("IN_TRANSIT");
    expect(deliveryStep("SHIPPED", "DELIVERED")).toBe("DELIVERED");
    expect(deliveryStep("DELIVERED", "RTO")).toBe("DELIVERED");
  });

  it("holds dispatch until payment and keeps COD collection separate from settlement", () => {
    expect(collectionNote({ cod: false, confirmed: false, currency: "INR", totalMinor: 10000 }).dispatchApproved).toBe(
      false
    );
    const cod = collectionNote({ cod: true, confirmed: true, currency: "INR", totalMinor: 250000 });
    expect(cod.dispatchApproved).toBe(true);
    expect(cod.instructions).toContain("Collect");
    expect(cod.instructions).toContain("not settlement");
    expect(collectionNote({ cod: false, confirmed: true, currency: "INR", totalMinor: 100 }).instructions).toBe(
      "Prepaid. Cleared to dispatch."
    );
  });

  it("shows the courier timeline with stored times only", () => {
    const placed = new Date("2026-10-13T09:29:24.000Z");
    const shipped = new Date("2026-10-16T14:45:00.000Z");
    const delivered = new Date("2026-10-18T08:20:01.000Z");
    const timeline = trackingTimeline({
      orderStatus: "DELIVERED",
      placedAt: placed,
      history: [
        { toStatus: "PAID", createdAt: placed },
        { toStatus: "SHIPPED", createdAt: shipped }
      ],
      shipment: {
        status: "DELIVERED",
        createdAt: new Date("2026-10-16T10:00:00.000Z"),
        deliveredAt: delivered,
        courier: "Delhivery"
      }
    });
    expect(timeline.currentLabel).toBe("Delivered (POD)");
    expect(timeline.events.map((event) => event.label)).toEqual([
      "Order confirmed",
      "Packed",
      "Dispatched",
      "In Transit",
      "Out for Delivery",
      "Delivered (POD)"
    ]);
    expect(timeline.events[0]?.at).toBe(placed.toISOString());
    expect(timeline.events[1]?.at).toBeNull();
    expect(timeline.events[2]?.at).toBe(shipped.toISOString());
    expect(timeline.events[2]?.detail).toBe("Delhivery");
    expect(timeline.events[3]?.at).toBeNull();
    expect(timeline.events[4]?.at).toBeNull();
    expect(timeline.events[5]?.at).toBe(delivered.toISOString());
    expect(timeline.events[5]?.state).toBe("current");
  });

  it("treats a low rating as needing attention and offers Google to every customer", () => {
    expect(feedbackAfterResponse(2)).toBe("NEEDS_ATTENTION");
    expect(feedbackAfterResponse(5)).toBe("RECEIVED");
    expect(feedbackMessage({ name: "Asha", orderNumber: "SRV-1" })).toContain("Google review");
    expect(feedbackMessage({ name: "Asha", orderNumber: "SRV-1" })).toContain("maps.app.goo.gl");
  });
});
