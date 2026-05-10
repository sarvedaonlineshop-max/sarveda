import { getApiBase } from "./api";

export type OrderPublic = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotalInPaise: number;
  currency: string;
  email: string;
  createdAt: string;
  items: Array<{
    nameSnapshot: string;
    skuSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | undefined;
};

export async function fetchOrderPublic(orderNumber: string, email: string): Promise<OrderPublic> {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  const res = await fetch(
    `${getApiBase()}/api/orders/public/${encodeURIComponent(orderNumber)}?${q.toString()}`,
    { credentials: "include" }
  );
  const json = (await res.json()) as { success?: boolean; data?: { order: OrderPublic }; error?: string };
  if (!res.ok || !json.success || !json.data?.order) {
    throw new Error(json.error || "Could not load order");
  }
  return json.data.order;
}
