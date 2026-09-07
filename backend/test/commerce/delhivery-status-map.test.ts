import { describe, expect, it } from "vitest";

import { extractDelhiveryTrackStatus } from "../../src/modules/shipping/delhivery";
import { mapCourierStatusToShipment } from "../../src/modules/shipping/shipmentTracking.persist";

describe("mapCourierStatusToShipment", () => {
  it("keeps Manifested / awaiting pickup as CREATED", () => {
    expect(mapCourierStatusToShipment("Manifested")).toBe("CREATED");
    expect(mapCourierStatusToShipment("Soft Data upload")).toBe("CREATED");
    expect(mapCourierStatusToShipment("Pending")).toBe("CREATED");
    expect(mapCourierStatusToShipment("Pickup Scheduled")).toBe("CREATED");
    expect(mapCourierStatusToShipment("Awaiting Pickup")).toBe("CREATED");
    expect(mapCourierStatusToShipment("UNKNOWN")).toBe("CREATED");
    expect(mapCourierStatusToShipment("")).toBe("CREATED");
  });

  it("maps picked / transit / ofd / delivered", () => {
    expect(mapCourierStatusToShipment("Picked Up")).toBe("PICKED");
    expect(mapCourierStatusToShipment("In Transit")).toBe("INTRANSIT");
    expect(mapCourierStatusToShipment("Dispatched")).toBe("INTRANSIT");
    expect(mapCourierStatusToShipment("Out for Delivery")).toBe("OUT_FOR_DELIVERY");
    expect(mapCourierStatusToShipment("Delivered")).toBe("DELIVERED");
    expect(mapCourierStatusToShipment("RTO")).toBe("RTO");
  });
});

describe("extractDelhiveryTrackStatus", () => {
  it("reads nested Shipment.Status.Status from packages/json", () => {
    const raw = {
      ShipmentData: [
        {
          Shipment: {
            Status: {
              Status: "Manifested",
              StatusType: "UD",
              Instructions: "Manifest uploaded"
            },
            Scans: [
              {
                ScanDetail: {
                  Scan: "Manifested",
                  Instructions: "Manifest uploaded"
                }
              }
            ]
          }
        }
      ]
    };
    expect(extractDelhiveryTrackStatus(raw)).toBe("Manifested");
  });
});
