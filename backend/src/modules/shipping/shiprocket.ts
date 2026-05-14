import axios, { type AxiosError } from "axios";

import { shippingEnv } from "../../config/env";
import { logger } from "../../config/logger";

import type { ApiErr, ApiOk, OrderWithShippingContext } from "./types";

const SHIPROCKET_API = "https://apiv2.shiprocket.in/v1/external";

type TokenState = { token: string; expiresAtMs: number };
let cachedToken: TokenState | null = null;

/** Drop cached token (e.g. after Shiprocket password change or 401 on create). */
export function clearShiprocketTokenCache(): void {
  cachedToken = null;
}

function extractShiprocketLoginToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.token === "string" && d.token.length > 0) return d.token;
  const inner = d.data;
  if (inner && typeof inner === "object") {
    const t = (inner as Record<string, unknown>).token;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return "";
}

function extractShiprocketErrorMessage(data: unknown, status: number): string {
  if (!data || typeof data !== "object") {
    return `Shiprocket returned HTTP ${status}`;
  }
  const d = data as Record<string, unknown>;
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  if (Array.isArray(d.errors) && d.errors.length) {
    const first = d.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "message" in first) {
      return String((first as { message?: string }).message ?? "Validation error");
    }
  }
  if (d.error && typeof d.error === "string") return d.error;
  return `Shiprocket returned HTTP ${status}`;
}

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
    const token = extractShiprocketLoginToken(res.data);
    if (token) {
      cachedToken = { token, expiresAtMs: now + 23 * 60 * 60 * 1000 };
      return { success: true, data: { token } };
    }
    const msg = extractShiprocketErrorMessage(res.data, res.status);
    clearShiprocketTokenCache();
    logger.warn("shiprocket_auth_failed", { status: res.status, emailUsed: email.replace(/@.*/, "@***") });
    return {
      success: false,
      error:
        res.status === 401 || res.status === 422 || res.status === 400
          ? `${msg} Use an API user created under Shiprocket → Settings → API (not your dashboard password unless it is the API user password).`
          : msg,
      code: "SHIPROCKET_AUTH"
    };
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

/** Shiprocket docs expect full country name for many flows (e.g. India not IN). */
function shiprocketDisplayCountry(country: string): string {
  const c = country.trim().toUpperCase();
  if (c === "IN" || c === "INDIA") return "India";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "United States";
  if (c === "GB" || c === "UK" || c === "UNITED KINGDOM") return "United Kingdom";
  return country.trim();
}

/** Parse create/adhoc (or assign/awb) JSON for `awb_code` and `shipment_id` (nested under payload/data). */
function extractAdhocCreateResult(raw: unknown): { awbCode?: string; shipmentId?: number } {
  if (!raw || typeof raw !== "object") return {};
  const pick = (obj: Record<string, unknown>): { awbCode?: string; shipmentId?: number } => {
    let awbCode: string | undefined;
    let shipmentId: number | undefined;
    const awbRaw = obj.awb_code;
    if (typeof awbRaw === "string" && awbRaw.trim()) awbCode = awbRaw.trim();
    else if (typeof awbRaw === "number" && Number.isFinite(awbRaw)) awbCode = String(awbRaw);
    const sidRaw = obj.shipment_id;
    if (typeof sidRaw === "number" && Number.isFinite(sidRaw)) shipmentId = sidRaw;
    else if (typeof sidRaw === "string" && /^\d+$/.test(sidRaw.trim())) shipmentId = parseInt(sidRaw.trim(), 10);
    return { awbCode, shipmentId };
  };

  const r = raw as Record<string, unknown>;
  let { awbCode, shipmentId } = pick(r);
  for (const key of ["payload", "data", "response"]) {
    const inner = r[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const p = pick(inner as Record<string, unknown>);
      if (!awbCode && p.awbCode) awbCode = p.awbCode;
      if (shipmentId === undefined && p.shipmentId !== undefined) shipmentId = p.shipmentId;
    }
  }
  return { awbCode, shipmentId };
}

/** Docs: AWB may require a separate call after create/adhoc. */
async function assignAwbForShipment(token: string, shipmentId: number): Promise<ApiOk<{ awb: string }> | ApiErr> {
  const res = await axios.post(
    `${SHIPROCKET_API}/courier/assign/awb`,
    { shipment_id: shipmentId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 45_000,
      validateStatus: () => true
    }
  );
  if (res.status >= 400) {
    const msg = extractShiprocketErrorMessage(res.data, res.status);
    logger.warn("shiprocket_assign_awb_failed", { status: res.status, shipmentId, msg });
    return { success: false, error: msg, code: "SHIPROCKET_ASSIGN" };
  }
  const { awbCode } = extractAdhocCreateResult(res.data);
  if (!awbCode) {
    logger.warn("shiprocket_assign_awb_parse", { shipmentId, bodyKeys: res.data && typeof res.data === "object" ? Object.keys(res.data as object) : [] });
    return { success: false, error: "Shiprocket assign AWB did not return awb_code", code: "SHIPROCKET_PARSE" };
  }
  return { success: true, data: { awb: awbCode } };
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
    const pickupLocation = shippingEnv.SHIPROCKET_PICKUP_LOCATION;
    const paymentMethod = order.payments?.[0]?.provider === "COD" ? "COD" : "Prepaid";
    const payload = {
      order_id: order.orderNumber,
      order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      pickup_location: pickupLocation,
      billing_customer_name: ship.fullName,
      billing_last_name: "",
      billing_address: ship.line1,
      billing_address_2: ship.line2 ?? "",
      billing_city: ship.city,
      billing_pincode: ship.postalCode,
      billing_state: ship.state,
      billing_country: shiprocketDisplayCountry(ship.country),
      billing_email: order.email,
      billing_phone: ship.phone,
      shipping_is_billing: true,
      order_items: order.items.map((li) => ({
        name: li.nameSnapshot,
        sku: li.skuSnapshot,
        units: li.qtyOrdered,
        selling_price: Math.max(1, Math.round(li.unitPriceInPaise / 100))
      })),
      payment_method: paymentMethod,
      sub_total: Math.max(1, Math.round(order.subtotalInPaise / 100)),
      length: 10,
      breadth: 10,
      height: 10,
      weight: weightKg
    };

    let bearerToken = auth.data.token;
    let res = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json"
      },
      timeout: 45_000,
      validateStatus: () => true
    });
    if (res.status === 401) {
      clearShiprocketTokenCache();
      const auth2 = await getToken();
      if (!auth2.success) return auth2;
      bearerToken = auth2.data.token;
      res = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json"
        },
        timeout: 45_000,
        validateStatus: () => true
      });
    }
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "create order" }, "SHIPROCKET_CREATE");
    }

    const created = extractAdhocCreateResult(res.data);
    let waybill = created.awbCode;
    if (!waybill && created.shipmentId !== undefined) {
      const assigned = await assignAwbForShipment(bearerToken, created.shipmentId);
      if (!assigned.success) return assigned;
      waybill = assigned.data.awb;
    }
    if (!waybill) {
      logger.warn("shiprocket_create_parse", {
        orderNumber: order.orderNumber,
        bodyKeys: res.data && typeof res.data === "object" ? Object.keys(res.data as object) : []
      });
      return {
        success: false,
        error:
          "Shiprocket accepted the order but returned no AWB and no shipment_id. Check pickup name, KYC, wallet, and duplicate order_id in Shiprocket.",
        code: "SHIPROCKET_PARSE"
      };
    }
    const trackingUrl = `https://shiprocket.co/tracking/${waybill}`;
    return { success: true, data: { waybill, trackingUrl } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_CREATE");
  }
}

/** Shiprocket `shipment_status` / `track_status` numeric codes (API docs → Tracking). */
const SHIPROCKET_TRACK_STATUS_NUM: Record<number, string> = {
  6: "SHIPPED",
  7: "DELIVERED",
  8: "CANCELED",
  9: "RTO INITIATED",
  10: "RTO DELIVERED",
  12: "LOST",
  13: "PICKUP ERROR",
  14: "RTO ACKNOWLEDGED",
  15: "PICKUP RESCHEDULED",
  16: "CANCELLATION REQUESTED",
  17: "OUT FOR DELIVERY",
  18: "IN TRANSIT",
  19: "OUT FOR PICKUP"
};

function extractShiprocketTrackStatus(raw: unknown): string {
  const r = raw as Record<string, unknown>;
  const td = r.tracking_data as Record<string, unknown> | undefined;
  const bucket = td && typeof td === "object" ? td : r;

  const ss = bucket.shipment_status ?? bucket.track_status;
  if (typeof ss === "number") {
    return SHIPROCKET_TRACK_STATUS_NUM[ss] ?? String(ss);
  }
  if (typeof ss === "string" && ss.trim()) return ss.trim();

  if (typeof r.tracking_status === "string" && r.tracking_status.trim()) return r.tracking_status.trim();
  if (typeof r.shipment_status === "string" && r.shipment_status.trim()) return r.shipment_status.trim();

  return "UNKNOWN";
}

export async function trackShipment(waybill: string): Promise<ApiOk<{ status: string; raw: unknown }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    // Official: GET .../courier/track/awb/{awb_code} — we store AWB, not Shiprocket shipment_id.
    const res = await axios.get(`${SHIPROCKET_API}/courier/track/awb/${encodeURIComponent(wb)}`, {
      headers: {
        Authorization: `Bearer ${auth.data.token}`,
        "Content-Type": "application/json"
      },
      timeout: 20_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosErr({ response: res, message: "track" }, "SHIPROCKET_TRACK");
    }
    const raw = res.data;
    const status = extractShiprocketTrackStatus(raw);
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
