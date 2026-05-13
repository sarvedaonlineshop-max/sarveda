import axios, { type AxiosError } from "axios";

import { shippingEnv } from "../../config/env";
import { logger } from "../../config/logger";

import type { ApiErr, ApiOk, OrderWithShippingContext } from "./types";

const SHIPROCKET_API = "https://apiv2.shiprocket.in/v1/external";

type TokenState = { token: string; expiresAtMs: number };
let cachedToken: TokenState | null = null;

async function getToken(): Promise<ApiOk<{ token: string }> | ApiErr> {
  const email = shippingEnv.SHIPROCKET_EMAIL.trim();
  const password = shippingEnv.SHIPROCKET_PASSWORD.trim();
  if (!email || !password) {
    return { success: false, error: "Shiprocket is not configured", code: "SHIPROCKET_NOT_CONFIGURED" };
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return { success: true, data: { token: cachedToken.token } };
  }
  try {
    const res = await axios.post(`${SHIPROCKET_API}/auth/login`, { email, password }, {
      timeout: 20_000,
      validateStatus: () => true
    });
    if (res.status >= 400 || !res.data) {
      return mapShiprocketErr(res, "SHIPROCKET_AUTH");
    }
    const token =
      (res.data as { token?: string }).token ?? (res.data as { data?: { token?: string } }).data?.token ?? "";
    if (!token) {
      return { success: false, error: "Shiprocket login did not return a token", code: "SHIPROCKET_AUTH" };
    }
    cachedToken = { token, expiresAtMs: now + 23 * 60 * 60 * 1000 };
    return { success: true, data: { token } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_AUTH");
  }
}

function mapAxiosErr(err: unknown, code: string): ApiErr {
  const ax = err as AxiosError<{ message?: string }>;
  const msg = ax.response?.data?.message ?? ax.message ?? "Shiprocket request failed";
  logger.warn("shiprocket_http_error", { code, status: ax.response?.status, msg });
  return { success: false, error: String(msg), code };
}

function mapShiprocketErr(res: { status: number; data?: unknown }, code: string): ApiErr {
  logger.warn("shiprocket_bad_response", { status: res.status, data: res.data });
  return { success: false, error: "Shiprocket authentication failed", code };
}

export async function createInternationalShipment(
  order: OrderWithShippingContext
): Promise<ApiOk<{ waybill: string; trackingUrl: string }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  const ship = order.addresses.find((a) => a.type === "SHIPPING");
  if (!ship) {
    return { success: false, error: "Shipping address missing", code: "BAD_REQUEST" };
  }
  const weightKg =
    order.items.reduce((sum, li) => {
      const w = li.variant?.weightGrams ?? 500;
      return sum + (w * li.qtyOrdered) / 1000;
    }, 0) || 0.5;

  try {
    const payload = {
      order_id: order.orderNumber,
      order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      pickup_location: "Primary",
      billing_customer_name: ship.fullName,
      billing_last_name: "",
      billing_address: ship.line1,
      billing_address_2: ship.line2 ?? "",
      billing_city: ship.city,
      billing_pincode: ship.postalCode,
      billing_state: ship.state,
      billing_country: ship.country,
      billing_email: order.email,
      billing_phone: ship.phone,
      shipping_is_billing: true,
      order_items: order.items.map((li) => ({
        name: li.nameSnapshot,
        sku: li.skuSnapshot,
        units: li.qtyOrdered,
        selling_price: Math.max(1, Math.round(li.unitPriceInPaise / 100))
      })),
      payment_method: "Prepaid",
      sub_total: Math.max(1, Math.round(order.subtotalInPaise / 100)),
      length: 10,
      breadth: 10,
      height: 10,
      weight: weightKg
    };

    const res = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload, {
      headers: {
        Authorization: `Bearer ${auth.data.token}`,
        "Content-Type": "application/json"
      },
      timeout: 45_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "create order" }, "SHIPROCKET_CREATE");
    }
    const data = res.data as {
      shipment_id?: number;
      awb_code?: string;
      courier_name?: string;
    };
    const waybill = data.awb_code ?? String(data.shipment_id ?? "");
    if (!waybill) {
      return { success: false, error: "Shiprocket did not return AWB", code: "SHIPROCKET_PARSE" };
    }
    const trackingUrl = `https://shiprocket.co/tracking/${waybill}`;
    return { success: true, data: { waybill, trackingUrl } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_CREATE");
  }
}

export async function trackShipment(waybill: string): Promise<ApiOk<{ status: string; raw: unknown }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const res = await axios.get(`${SHIPROCKET_API}/courier/track/shipment/${encodeURIComponent(wb)}`, {
      headers: { Authorization: `Bearer ${auth.data.token}` },
      timeout: 20_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "track" }, "SHIPROCKET_TRACK");
    }
    const raw = res.data;
    const status =
      typeof (raw as { tracking_status?: string }).tracking_status === "string"
        ? (raw as { tracking_status: string }).tracking_status
        : typeof (raw as { shipment_status?: string }).shipment_status === "string"
          ? (raw as { shipment_status: string }).shipment_status
          : "UNKNOWN";
    return { success: true, data: { status, raw } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_TRACK");
  }
}

export async function cancelShipment(waybill: string): Promise<ApiOk<{ cancelled: boolean }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const res = await axios.post(
      `${SHIPROCKET_API}/orders/cancel/shipment/awb`,
      { awb: wb },
      {
        headers: {
          Authorization: `Bearer ${auth.data.token}`,
          "Content-Type": "application/json"
        },
        timeout: 20_000,
        validateStatus: () => true
      }
    );
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "cancel" }, "SHIPROCKET_CANCEL");
    }
    return { success: true, data: { cancelled: true } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_CANCEL");
  }
}

export type InternationalRateRow = { courier: string; rate: number; currency: string; estimatedDays?: number };

export async function getShippingRates(
  weightKg: number,
  originPincode: string,
  destinationCountry: string
): Promise<ApiOk<{ rates: InternationalRateRow[] }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  try {
    const res = await axios.get(`${SHIPROCKET_API}/open/post/international/rates`, {
      headers: { Authorization: `Bearer ${auth.data.token}` },
      params: {
        weight: weightKg,
        pickup_postcode: originPincode.replace(/\D/g, "").slice(0, 6),
        delivery_country: destinationCountry.trim().toUpperCase()
      },
      timeout: 25_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "rates" }, "SHIPROCKET_RATES");
    }
    const raw = res.data as { data?: unknown };
    const rows: InternationalRateRow[] = [];
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    for (const entry of list as Record<string, unknown>[]) {
      const courier = String(entry.courier_name ?? entry.courier ?? "Courier");
      const rate = Number(entry.rate ?? entry.total_charge ?? entry.freight_charge ?? 0);
      rows.push({
        courier,
        rate: Number.isFinite(rate) ? rate : 0,
        currency: String(entry.currency ?? "USD"),
        estimatedDays:
          typeof entry.estimated_delivery_days === "number"
            ? entry.estimated_delivery_days
            : undefined
      });
    }
    return { success: true, data: { rates: rows } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_RATES");
  }
}
