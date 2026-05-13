import type { Order, OrderAddress, OrderItem, Payment, ProductVariant } from "@prisma/client";

export type OrderWithShippingContext = Order & {
  items: (OrderItem & { variant: ProductVariant | null })[];
  addresses: OrderAddress[];
  payments?: Pick<Payment, "provider" | "status">[];
};

export type ApiOk<T> = { success: true; data: T };
export type ApiErr = { success: false; error: string; code: string };

export type ZoneKey = "IN" | "US" | "GB" | "OTHER";

export type CourierChoice =
  | "DELHIVERY"
  | "BLUEDART_STUB"
  | "DTDC_STUB"
  | "SHIPROCKET_DOMESTIC"
  | "SHIPROCKET_INTERNATIONAL";
