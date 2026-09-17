import type { OrderParcel, OrderPublic, OrderSummary } from "./orders-api";
import { delhiveryTrackUrl } from "./shipment-labels";

export type CancellationInfo = {
  title: string;
  description: string;
  category: string;
  occurredAt: string;
  rawReason: string | null;
};

export function paymentProviderLabel(provider?: string | null): string {
  switch (provider) {
    case "RAZORPAY":
      return "Razorpay";
    case "STRIPE":
      return "Stripe";
    case "PAYPAL":
      return "PayPal";
    case "COD":
      return "Cash on delivery";
    default:
      return "Paid online";
  }
}

/**
 * Trackable parcels for an order. The backend sends one row per label; the
 * fallbacks below keep tracking visible if an older payload only carries the
 * single flattened shipment.
 */
export function orderParcels(order: OrderSummary): OrderParcel[] {
  if (order.parcels?.length) return order.parcels;
  const awb = order.awb?.trim();
  if (!awb) return [];
  return [
    {
      label: "Parcel",
      courier: order.deliveryPartner?.trim() || "Courier",
      awb,
      trackingUrl: order.trackingUrl?.trim() || delhiveryTrackUrl(awb),
      status: order.shipmentStatus?.trim() || "CREATED"
    }
  ];
}

export function publicOrderParcels(order: OrderPublic): OrderParcel[] {
  if (order.parcels?.length) return order.parcels;
  return (order.shipments ?? [])
    .filter((s) => s.awb?.trim())
    .map((s) => {
      const awb = s.awb!.trim();
      return {
        label: "Parcel",
        courier: s.courier,
        awb,
        trackingUrl: s.trackingUrl?.trim() || delhiveryTrackUrl(awb),
        status: s.status
      };
    })
    .reverse();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
