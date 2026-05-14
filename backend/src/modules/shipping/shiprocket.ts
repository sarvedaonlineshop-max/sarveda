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

/** Laravel-style `errors` map + top-level message (422 "Invalid Data"). */
function formatShiprocketApiMessage(data: unknown, status: number): string {
  const base = extractShiprocketErrorMessage(data, status);
  if (!data || typeof data !== "object") return base;
  const d = data as Record<string, unknown>;
  const errors = d.errors;
  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.map(String).join(", ")}`);
      else if (v && typeof v === "object") parts.push(`${k}: ${JSON.stringify(v)}`);
      else parts.push(`${k}: ${String(v)}`);
    }
    if (parts.length) return `${base} — ${parts.join("; ")}`;
  }
  return base;
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

/** Digits only; India → last 10 (strip leading 91). */
function normalizeShiprocketPhone(phone: string, country: string): string {
  const digits = phone.replace(/\D/g, "");
  if (shiprocketDisplayCountry(country) === "India") {
    if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
    if (digits.length > 10) return digits.slice(-10);
    return digits;
  }
  return digits.slice(0, 15);
}

/** Deep-scan JSON for `awb_code` / `shipment_id` (Shiprocket nests these unpredictably). */
function extractAdhocCreateResult(raw: unknown): { awbCode?: string; shipmentId?: number } {
  let awbCode: string | undefined;
  let shipmentId: number | undefined;
  const seen = new WeakSet<object>();

  function considerKey(key: string, val: unknown): void {
    const k = key.toLowerCase().replace(/-/g, "_");
    if (
      !awbCode &&
      (k === "awb_code" || k === "awb" || k === "awbcode" || k === "airwaybill_number")
    ) {
      if (typeof val === "string" && val.trim()) awbCode = val.trim();
      else if (typeof val === "number" && Number.isFinite(val)) awbCode = String(val);
    }
    if (
      shipmentId === undefined &&
      (k === "shipment_id" || k === "shipmentid" || k === "sr_shipment_id" || k === "order_shipment_id")
    ) {
      if (typeof val === "number" && Number.isFinite(val)) shipmentId = val;
      else if (typeof val === "string" && /^\d+$/.test(val.trim())) shipmentId = parseInt(val.trim(), 10);
    }
  }

  function visit(node: unknown, depth: number): void {
    if (depth > 12 || node === null || node === undefined) return;
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      considerKey(key, val);
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") visit(val, depth + 1);
    }
  }

  visit(raw, 0);
  return { awbCode, shipmentId };
}

/** GET …/settings/company/pickup — names must match `pickup_location` on create/adhoc. */
async function fetchPickupLocationNames(token: string): Promise<string[]> {
  const names = new Set<string>();
  try {
    const res = await axios.get(`${SHIPROCKET_API}/settings/company/pickup`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20_000,
      validateStatus: () => true
    });
    if (res.status >= 400) return [];
    function walk(o: unknown): void {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) {
        for (const x of o) walk(x);
        return;
      }
      const r = o as Record<string, unknown>;
      for (const [k, v] of Object.entries(r)) {
        if (k === "pickup_location" && typeof v === "string" && v.trim()) {
          names.add(v.trim());
        } else if (v && typeof v === "object") walk(v);
      }
    }
    walk(res.data);
    return [...names];
  } catch {
    return [];
  }
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
    const msg = formatShiprocketApiMessage(res.data, res.status);
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
  order: OrderWithShippingContext,
  options?: { pickupLocationName?: string }
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
    const displayCountry = shiprocketDisplayCountry(ship.country);
    const pinDigits = ship.postalCode.replace(/\D/g, "").slice(0, 6);
    if (displayCountry === "India" && pinDigits.length !== 6) {
      return {
        success: false,
        error: "Shipping pincode must be 6 digits for Shiprocket (India).",
        code: "BAD_REQUEST"
      };
    }
    const phoneDigits = normalizeShiprocketPhone(ship.phone, ship.country);
    if (displayCountry === "India" && phoneDigits.length < 10) {
      return {
        success: false,
        error: "Shipping phone must have at least 10 digits for Shiprocket (India).",
        code: "BAD_REQUEST"
      };
    }

    const pickupLocation = (options?.pickupLocationName ?? shippingEnv.SHIPROCKET_PICKUP_LOCATION ?? "").trim();
    if (!pickupLocation) {
      return {
        success: false,
        error: "Pickup location is not configured (admin warehouses or SHIPROCKET_PICKUP_LOCATION).",
        code: "BAD_REQUEST"
      };
    }
    const paymentMethod = order.payments?.[0]?.provider === "COD" ? "COD" : "Pre-paid";

    const orderItemsPayload = order.items.map((li) => {
      const name = (li.nameSnapshot ?? "Item").trim().slice(0, 200) || "Item";
      const sku = (li.skuSnapshot ?? "SKU").trim().slice(0, 100) || "SKU";
      const selling_price = Math.max(1, Math.round(li.unitPriceInPaise / 100));
      return { name, sku, units: li.qtyOrdered, selling_price };
    });
    const subTotalFromLines = Math.max(
      1,
      orderItemsPayload.reduce((s, it) => s + it.selling_price * it.units, 0)
    );
    const shippingRupees = Math.max(0, Math.round((order.shippingInPaise ?? 0) / 100));

    const orderPlaced = order.placedAt ?? order.createdAt;
    const orderDate =
      orderPlaced instanceof Date && !Number.isNaN(orderPlaced.getTime())
        ? orderPlaced.toISOString().slice(0, 19).replace("T", " ")
        : new Date().toISOString().slice(0, 19).replace("T", " ");

    const payload = {
      order_id: order.orderNumber,
      order_date: orderDate,
      pickup_location: pickupLocation,
      billing_customer_name: ship.fullName.trim().slice(0, 100) || "Customer",
      billing_last_name: "",
      billing_address: (ship.line1 ?? "").trim().slice(0, 190) || "Address",
      billing_address_2: (ship.line2 ?? "").trim().slice(0, 190),
      billing_city: ship.city.trim().slice(0, 30),
      billing_pincode: displayCountry === "India" ? pinDigits : ship.postalCode.trim().slice(0, 12),
      billing_state: ship.state.trim().slice(0, 50),
      billing_country: displayCountry,
      billing_email: order.email.trim(),
      billing_phone: phoneDigits,
      shipping_is_billing: 1,
      order_items: orderItemsPayload,
      payment_method: paymentMethod,
      sub_total: subTotalFromLines,
      shipping_charges: shippingRupees,
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
      const msg = formatShiprocketApiMessage(res.data, res.status);
      logger.warn("shiprocket_http_error", {
        code: "SHIPROCKET_CREATE",
        status: res.status,
        msg,
        orderNumber: order.orderNumber
      });
      return { success: false, error: msg, code: "SHIPROCKET_CREATE" };
    }

    if (res.data && typeof res.data === "object") {
      const rd = res.data as Record<string, unknown>;
      if (rd.success === false || rd.success === 0) {
        const msg = formatShiprocketApiMessage(res.data, res.status);
        logger.warn("shiprocket_create_declined", { orderNumber: order.orderNumber, msg });
        return { success: false, error: msg || "Shiprocket declined order creation", code: "SHIPROCKET_CREATE" };
      }
    }

    let created = extractAdhocCreateResult(res.data);
    let waybill = created.awbCode;
    if (!waybill && created.shipmentId !== undefined) {
      const assigned = await assignAwbForShipment(bearerToken, created.shipmentId);
      if (!assigned.success) return assigned;
      waybill = assigned.data.awb;
    }

    const missingIds = !waybill && created.shipmentId === undefined;
    if (missingIds) {
      const altNames = await fetchPickupLocationNames(bearerToken);
      let altPickup = altNames.find((n) => n !== pickupLocation);
      if (altPickup === undefined && altNames.length > 0 && !altNames.includes(pickupLocation)) {
        altPickup = altNames[0];
      }
      if (altPickup) {
        logger.warn("shiprocket_pickup_retry", {
          configured: pickupLocation,
          usingPickup: altPickup,
          available: altNames
        });
        const payload2 = { ...payload, pickup_location: altPickup };
        res = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload2, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json"
          },
          timeout: 45_000,
          validateStatus: () => true
        });
        if (res.status === 401) {
          clearShiprocketTokenCache();
          const auth3 = await getToken();
          if (!auth3.success) return auth3;
          bearerToken = auth3.data.token;
          res = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload2, {
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              "Content-Type": "application/json"
            },
            timeout: 45_000,
            validateStatus: () => true
          });
        }
        if (res.status >= 400) {
          const msg = formatShiprocketApiMessage(res.data, res.status);
          logger.warn("shiprocket_http_error", {
            code: "SHIPROCKET_CREATE",
            status: res.status,
            msg,
            orderNumber: order.orderNumber
          });
          return { success: false, error: msg, code: "SHIPROCKET_CREATE" };
        }
        if (res.data && typeof res.data === "object") {
          const rd2 = res.data as Record<string, unknown>;
          if (rd2.success === false || rd2.success === 0) {
            const msg = formatShiprocketApiMessage(res.data, res.status);
            return { success: false, error: msg || "Shiprocket declined order creation", code: "SHIPROCKET_CREATE" };
          }
        }
        created = extractAdhocCreateResult(res.data);
        waybill = created.awbCode;
        if (!waybill && created.shipmentId !== undefined) {
          const assigned2 = await assignAwbForShipment(bearerToken, created.shipmentId);
          if (!assigned2.success) return assigned2;
          waybill = assigned2.data.awb;
        }
      }
    }

    if (!waybill) {
      const rootMsg =
        res.data && typeof res.data === "object" && typeof (res.data as Record<string, unknown>).message === "string"
          ? String((res.data as Record<string, unknown>).message)
          : "";
      logger.warn("shiprocket_create_parse", {
        orderNumber: order.orderNumber,
        bodyKeys: res.data && typeof res.data === "object" ? Object.keys(res.data as object) : [],
        rootMsg: rootMsg.slice(0, 500)
      });
      const hint = rootMsg ? ` Shiprocket said: ${rootMsg}` : "";
      return {
        success: false,
        error: `Shiprocket returned no AWB and no shipment_id in the API response.${hint} Check Shiprocket dashboard for this order id, pickup name (${pickupLocation}), KYC, wallet, and duplicate order_id.`,
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
