import axios, { type AxiosError } from "axios";
import type { Prisma } from "@prisma/client";

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

/** Best-effort Shiprocket ids from create/adhoc JSON (for cancel). */
export function extractShiprocketCarrierMeta(raw: unknown): Prisma.JsonObject {
  let shipmentId: number | undefined;
  let orderId: number | undefined;
  const seen = new WeakSet<object>();

  function consider(key: string, val: unknown): void {
    const k = key.toLowerCase().replace(/-/g, "_");
    if (k === "shipment_id" || k === "shipmentid") {
      if (typeof val === "number" && Number.isFinite(val)) shipmentId = val;
      else if (typeof val === "string" && /^\d+$/.test(val.trim())) shipmentId = parseInt(val.trim(), 10);
    }
    if (k === "order_id" || k === "channel_order_id" || k === "channel_orderid") {
      if (typeof val === "number" && Number.isFinite(val)) orderId = val;
      else if (typeof val === "string" && /^\d+$/.test(val.trim())) orderId = parseInt(val.trim(), 10);
    }
  }

  function visit(node: unknown, depth: number): void {
    if (depth > 14 || node === null || node === undefined) return;
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      consider(key, val);
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") visit(val, depth + 1);
    }
  }

  visit(raw, 0);
  const out: Prisma.JsonObject = {};
  if (shipmentId !== undefined) out.shiprocketShipmentId = shipmentId;
  if (orderId !== undefined) out.shiprocketOrderId = orderId;
  return out;
}

/** Shiprocket assign/awb nests AWB under `response`, `data`, or `awb_assign[]` depending on version. */
function extractAssignAwbCode(raw: unknown): string | undefined {
  const fromMain = extractAdhocCreateResult(raw);
  if (fromMain.awbCode) return fromMain.awbCode;
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  for (const key of ["response", "data", "payload", "result"] as const) {
    const nested = r[key];
    const fromNested = extractAdhocCreateResult(nested);
    if (fromNested.awbCode) return fromNested.awbCode;
  }
  const assign = r.awb_assign ?? r.awbAssign;
  if (Array.isArray(assign)) {
    for (const row of assign) {
      if (row && typeof row === "object") {
        const o = row as Record<string, unknown>;
        const code = o.awb_code ?? o.awb ?? o.airway_bill_number ?? o.airwaybill;
        if (typeof code === "string" && code.trim()) return code.trim();
        if (typeof code === "number" && Number.isFinite(code)) return String(code);
      }
    }
  }
  return undefined;
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
  const awbCode = extractAssignAwbCode(res.data);
  if (!awbCode) {
    logger.warn("shiprocket_assign_awb_parse", {
      shipmentId,
      bodyKeys: res.data && typeof res.data === "object" ? Object.keys(res.data as object) : []
    });
    return { success: false, error: "Shiprocket assign AWB did not return awb_code", code: "SHIPROCKET_PARSE" };
  }
  return { success: true, data: { awb: awbCode } };
}

export async function createInternationalShipment(
  order: OrderWithShippingContext,
  options?: { pickupLocationName?: string; channelOrderId?: string }
): Promise<ApiOk<{ waybill: string; trackingUrl: string; carrierMeta: Prisma.JsonObject | null }> | ApiErr> {
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

    const channelOrderId = (options?.channelOrderId ?? order.orderNumber).trim().slice(0, 50);
    const payload = {
      order_id: channelOrderId,
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
    const carrierMetaFromResponse = extractShiprocketCarrierMeta(res.data);
    const carrierMeta: Prisma.JsonObject = { ...carrierMetaFromResponse };
    if (created.shipmentId !== undefined) carrierMeta.shiprocketShipmentId = created.shipmentId;
    carrierMeta.awbCode = waybill;
    carrierMeta.channelOrderId = channelOrderId;
    const carrierMetaOut = Object.keys(carrierMeta).length > 0 ? carrierMeta : null;
    return { success: true, data: { waybill, trackingUrl, carrierMeta: carrierMetaOut } };
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

function extractServiceabilityCourierRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  const d = r.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    const dd = d as Record<string, unknown>;
    const ac = dd.available_courier_companies ?? dd.available_couriers ?? dd.data;
    if (Array.isArray(ac)) return ac;
  }
  const top = r.available_courier_companies ?? r.available_couriers ?? r.courier_company;
  if (Array.isArray(top)) return top;
  return [];
}

/**
 * India domestic: Shiprocket must return at least one courier for pickup→delivery (+COD flag when used).
 */
export async function checkIndiaCourierServiceability(input: {
  deliveryPincode: string;
  weightKg: number;
  cod: boolean;
}): Promise<ApiOk<{ serviceable: boolean; courierCount: number }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;

  const pickup = shippingEnv.SHIPPING_ORIGIN_PINCODE.replace(/\D/g, "").slice(0, 6);
  if (pickup.length !== 6) {
    return {
      success: false,
      error:
        "Set SHIPPING_ORIGIN_PINCODE to your warehouse’s 6-digit pin (same region as Shiprocket pickup) for India delivery checks.",
      code: "SHIPROCKET_ORIGIN_PIN"
    };
  }
  const delivery = input.deliveryPincode.replace(/\D/g, "").slice(0, 6);
  if (delivery.length !== 6) {
    return { success: false, error: "Delivery PIN must be 6 digits", code: "BAD_REQUEST" };
  }
  const weight = Math.max(0.05, input.weightKg);

  try {
    const res = await axios.get(`${SHIPROCKET_API}/courier/serviceability/`, {
      headers: {
        Authorization: `Bearer ${auth.data.token}`,
        Accept: "application/json"
      },
      params: {
        pickup_postcode: pickup,
        delivery_postcode: delivery,
        weight: String(weight),
        cod: input.cod ? 1 : 0
      },
      timeout: 20_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      const msg = formatShiprocketApiMessage(res.data, res.status);
      logger.warn("shiprocket_serviceability_http", { status: res.status, msg });
      return {
        success: false,
        error: msg || "Shiprocket could not check delivery to this PIN. Try again or use another pincode.",
        code: "SHIPROCKET_SERVICEABILITY"
      };
    }
    const rows = extractServiceabilityCourierRows(res.data);
    const courierCount = rows.filter((row) => row && typeof row === "object").length;
    const serviceable = courierCount > 0;
    return { success: true, data: { serviceable, courierCount } };
  } catch (err) {
    return mapAxiosErr(err, "SHIPROCKET_SERVICEABILITY");
  }
}

function parseNumericId(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && /^\d+$/.test(val.trim())) return parseInt(val.trim(), 10);
  return undefined;
}

function parseShiprocketMetaForCancel(carrierMeta: Prisma.JsonValue | null | undefined): {
  shiprocketOrderId?: number;
  channelOrderId?: string;
} {
  if (carrierMeta === null || carrierMeta === undefined) return {};
  if (typeof carrierMeta !== "object" || Array.isArray(carrierMeta)) return {};
  const o = carrierMeta as Record<string, unknown>;
  const shiprocketOrderId = parseNumericId(o.shiprocketOrderId);
  const channelOrderId =
    typeof o.channelOrderId === "string" && o.channelOrderId.trim()
      ? o.channelOrderId.trim()
      : undefined;
  return { shiprocketOrderId, channelOrderId };
}

/** Cancel API returned 404 / “does not exist” — often already voided in Shiprocket dashboard. */
export function isShiprocketCancelUnavailable(msg: string, httpStatus?: number): boolean {
  if (httpStatus === 404) return true;
  const m = msg.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("not found") ||
    m.includes("already cancel") ||
    m.includes("already cancelled")
  );
}

/** True when Shiprocket/courier tracking reports voided / cancelled shipment. */
export function isCarrierStatusCancelled(statusLabel: string): boolean {
  const s = statusLabel.toUpperCase();
  return s.includes("CANCEL") || s.includes("CANCELLATION");
}

export async function cancelShipment(
  waybill: string,
  carrierMeta?: Prisma.JsonValue | null
): Promise<ApiOk<{ cancelled: boolean }> | ApiErr> {
  const auth = await getToken();
  if (!auth.success) return auth;
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  const { shiprocketOrderId } = parseShiprocketMetaForCancel(carrierMeta);
  const token = auth.data.token;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json" as const
  };

  type Attempt = { label: string; url: string; body: unknown };
  const attempts: Attempt[] = [
    { label: "awbs", url: `${SHIPROCKET_API}/orders/cancel/shipment/awb`, body: { awbs: [wb] } },
    { label: "awb", url: `${SHIPROCKET_API}/orders/cancel/shipment/awb`, body: { awb: wb } },
    { label: "awb_code", url: `${SHIPROCKET_API}/orders/cancel/shipment/awb`, body: { awb_code: wb } },
    { label: "awb_alt", url: `${SHIPROCKET_API}/orders/cancel/awb`, body: { awb: wb } }
  ];
  if (shiprocketOrderId !== undefined) {
    attempts.push({
      label: "order_ids",
      url: `${SHIPROCKET_API}/orders/cancel`,
      body: { ids: [shiprocketOrderId] }
    });
  }

  try {
    let lastStatus = 0;
    let lastBody: unknown;
    for (const a of attempts) {
      const res = await axios.post(a.url, a.body, {
        headers,
        timeout: 25_000,
        validateStatus: () => true
      });
      lastStatus = res.status;
      lastBody = res.data;
      if (res.status < 400) {
        const data = res.data;
        if (data && typeof data === "object") {
          const r = data as Record<string, unknown>;
          if (r.success === false || r.success === 0) {
            const msg = formatShiprocketApiMessage(data, res.status);
            logger.warn("shiprocket_cancel_declined", { waybill, attempt: a.label, msg });
            continue;
          }
        }
        logger.info("shiprocket_cancel_ok", { waybill, attempt: a.label, shiprocketOrderId });
        return { success: true, data: { cancelled: true } };
      }
      if (res.status !== 404) {
        logger.warn("shiprocket_cancel_http", {
          waybill,
          attempt: a.label,
          status: res.status,
          msg: formatShiprocketApiMessage(res.data, res.status)
        });
      }
    }
    const lastMsg =
      typeof lastBody === "object" ? formatShiprocketApiMessage(lastBody, lastStatus) : String(lastBody);
    logger.warn("shiprocket_cancel_exhausted", {
      waybill,
      lastStatus,
      shiprocketOrderId,
      msg: lastMsg
    });
    return {
      success: false,
      error:
        "Shiprocket could not cancel this shipment (404 or declined). If you already cancelled in Shiprocket, use “Remove label only”.",
      code: "SHIPROCKET_CANCEL",
      httpStatus: lastStatus,
      carrierMessage: lastMsg
    };
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
