import { DEFAULT_DISPLAY_GST_RATE, extractGst } from "../../utils/gst";

type OrderAddressRow = {
  type: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type OrderItemRow = {
  id: string;
  nameSnapshot: string;
  qtyOrdered: number;
  lineTotalInPaise: number;
  skuSnapshot?: string;
};

type OrderMoneyRow = {
  currency: string;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  items: OrderItemRow[];
  addresses: OrderAddressRow[];
};

export type OrderLineItemDto = {
  id: string;
  title: string;
  quantity: number;
  lineTotalInPaise: number;
  skuSnapshot?: string;
};

export type OrderCostBreakdownDto = {
  itemsSubtotalInPaise: number;
  shippingInPaise: number;
  discountInPaise?: number;
  gstIncludedInPaise?: number;
  gstRateLabel?: string;
};

export type OrderShippingAddressDto = {
  name?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
};

function shippingAddressRow(addresses: OrderAddressRow[]): OrderAddressRow | undefined {
  return addresses.find((a) => a.type === "SHIPPING");
}

/** Line items — same fields as /order/confirmed item rows (name, qty, line total). */
export function buildOrderLineItems(items: OrderItemRow[]): OrderLineItemDto[] | undefined {
  if (!items.length) return undefined;
  return items.map((item) => ({
    id: item.id,
    title: item.nameSnapshot,
    quantity: item.qtyOrdered,
    lineTotalInPaise: item.lineTotalInPaise,
    skuSnapshot: item.skuSnapshot
  }));
}

/**
 * Cost breakdown using the same math as frontend/app/order/confirmed/page.tsx:
 * merchandiseAfterDiscount = subtotal − discount; GST via extractGst @ 18% for India only.
 */
export function buildOrderCostBreakdown(
  order: Pick<OrderMoneyRow, "currency" | "subtotalInPaise" | "discountInPaise" | "shippingInPaise" | "addresses">
): OrderCostBreakdownDto {
  const shipAddr = shippingAddressRow(order.addresses);
  const isIndia = order.currency === "INR" || shipAddr?.country === "IN";

  const breakdown: OrderCostBreakdownDto = {
    itemsSubtotalInPaise: order.subtotalInPaise,
    shippingInPaise: order.shippingInPaise
  };

  if (order.discountInPaise > 0) {
    breakdown.discountInPaise = order.discountInPaise;
  }

  if (isIndia) {
    const merchandiseAfterDiscount = Math.max(0, order.subtotalInPaise - order.discountInPaise);
    const { gstInPaise } = extractGst(merchandiseAfterDiscount, DEFAULT_DISPLAY_GST_RATE);
    breakdown.gstIncludedInPaise = gstInPaise;
    breakdown.gstRateLabel = `${DEFAULT_DISPLAY_GST_RATE}%`;
  }

  return breakdown;
}

/** Shipping address mapped to profile card field names (pincode ← postalCode). */
export function buildOrderShippingAddressForCard(
  addresses: OrderAddressRow[]
): OrderShippingAddressDto | undefined {
  const addr = shippingAddressRow(addresses);
  if (!addr) return undefined;

  const mapped: OrderShippingAddressDto = {
    name: addr.fullName || undefined,
    line1: addr.line1 || undefined,
    line2: addr.line2,
    city: addr.city || undefined,
    state: addr.state || undefined,
    pincode: addr.postalCode || undefined,
    country: addr.country || undefined,
    phone: addr.phone || undefined
  };

  const hasContent = !!(mapped.line1 || mapped.city || mapped.pincode || mapped.phone);
  return hasContent ? mapped : undefined;
}

export function buildOrderSummaryDetails(order: OrderMoneyRow): {
  lineItems?: OrderLineItemDto[];
  costBreakdown: OrderCostBreakdownDto;
  shippingAddress?: OrderShippingAddressDto;
} {
  const lineItems = buildOrderLineItems(order.items);
  const costBreakdown = buildOrderCostBreakdown(order);
  const shippingAddress = buildOrderShippingAddressForCard(order.addresses);

  const out: {
    lineItems?: OrderLineItemDto[];
    costBreakdown: OrderCostBreakdownDto;
    shippingAddress?: OrderShippingAddressDto;
  } = { costBreakdown };

  if (lineItems) out.lineItems = lineItems;
  if (shippingAddress) out.shippingAddress = shippingAddress;

  return out;
}
