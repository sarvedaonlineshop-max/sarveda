import axios, { type AxiosError } from "axios";
import { URLSearchParams } from "node:url";

import { shippingEnv } from "../../config/env";
import { logger } from "../../config/logger";

import type { ApiErr, ApiOk } from "./types";

const HEADER_TOKEN = "Authorization";

function authHeaders(): Record<string, string> | null {
  const token = shippingEnv.DELHIVERY_API_KEY.trim();
  if (!token) return null;
  return {
    [HEADER_TOKEN]: `Token ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

function baseUrl(): string {
  return shippingEnv.DELHIVERY_BASE_URL.replace(/\/$/, "");
}

function mapAxiosError(err: unknown, code: string): ApiErr {
  const ax = err as AxiosError<{ message?: string }>;
  const msg =
    ax.response?.data && typeof ax.response.data === "object" && "message" in ax.response.data
      ? String((ax.response.data as { message?: string }).message ?? ax.message)
      : ax.message || "Delhivery request failed";
  logger.warn("delhivery_http_error", { code, status: ax.response?.status, msg });
  return { success: false, error: msg, code };
}

export async function checkPincodeServiceability(
  pincode: string
): Promise<ApiOk<{ serviceable: boolean; estimatedDays: number }> | ApiErr> {
  const headers = authHeaders();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const pc = pincode.replace(/\D/g, "").slice(0, 6);
  if (pc.length !== 6) {
    return { success: false, error: "Invalid pincode", code: "INVALID_PINCODE" };
  }
  try {
    const url = `${baseUrl()}/api/backend/client/serviceability/`;
    const res = await axios.get(url, {
      headers,
      params: { pincode: pc },
      timeout: 15_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "serviceability failed" }, "DELHIVERY_SERVICEABILITY");
    }
    const body = res.data as Record<string, unknown>;
    const deliveryCodes = body?.delivery_codes ?? body?.deliveryCodes ?? body?.data;
    let serviceable = false;
    let estimatedDays = 5;
    if (Array.isArray(deliveryCodes) && deliveryCodes.length > 0) {
      serviceable = true;
      const first = deliveryCodes[0] as Record<string, unknown>;
      const est =
        first?.estimated_delivery_days ??
        first?.estimated_days ??
        first?.edd ??
        first?.delivery_estimate;
      if (typeof est === "number" && Number.isFinite(est)) estimatedDays = Math.max(1, Math.round(est));
      else if (typeof est === "string" && /^\d+$/.test(est)) estimatedDays = Math.max(1, parseInt(est, 10));
    }
    if (typeof body?.serviceable === "boolean") serviceable = body.serviceable;
    return { success: true, data: { serviceable, estimatedDays } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_SERVICEABILITY");
  }
}

export type DelhiveryShipmentInput = {
  orderNumber: string;
  paymentMode: "Pre-paid" | "COD";
  codAmountRupees?: number;
  weightKg: number;
  pickupLocation?: string;
  /** Ship-to */
  consigneeName: string;
  consigneePhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

export async function createShipment(
  input: DelhiveryShipmentInput
): Promise<ApiOk<{ waybill: string; trackingUrl: string }> | ApiErr> {
  const headers = authHeaders();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  try {
    const shipments = [
      {
        name: input.consigneeName,
        phone: input.consigneePhone,
        order: input.orderNumber,
        payment_mode: input.paymentMode,
        cod_amount:
          input.paymentMode === "COD" && input.codAmountRupees != null
            ? Number(input.codAmountRupees.toFixed(2))
            : undefined,
        weight: input.weightKg,
        shipment_width: 10,
        shipment_height: 10,
        shipment_length: 10,
        address: input.address,
        city: input.city,
        state: input.state,
        pin: input.pincode.replace(/\D/g, "").slice(0, 6),
        country: "India"
      }
    ];
    const form = new URLSearchParams();
    form.append("format", "json");
    form.append(
      "data",
      JSON.stringify({
        pickups: input.pickupLocation ? [{ pickup_location: input.pickupLocation }] : undefined,
        shipments
      })
    );
    const url = `${baseUrl()}/api/backend/client/json/`;
    const res = await axios.post(url, form.toString(), {
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "create shipment failed" }, "DELHIVERY_CREATE");
    }
    const body = res.data as Record<string, unknown>;
    const pkgs = (body?.packages ?? body?.success ?? body?.data) as Record<string, unknown>[] | undefined;
    let waybill = "";
    if (Array.isArray(pkgs) && pkgs[0]) {
      waybill = String(pkgs[0].waybill ?? pkgs[0].AWB ?? pkgs[0].wb ?? "");
    }
    if (!waybill && typeof body?.waybill === "string") waybill = body.waybill;
    if (!waybill) {
      logger.warn("delhivery_create_unparsed", { body });
      return {
        success: false,
        error: "Delhivery did not return a waybill",
        code: "DELHIVERY_PARSE"
      };
    }
    const trackingUrl = `https://www.delhivery.com/track/package/${waybill}`;
    return { success: true, data: { waybill, trackingUrl } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_CREATE");
  }
}

export async function trackShipment(waybill: string): Promise<ApiOk<{ status: string; raw: unknown }> | ApiErr> {
  const headers = authHeaders();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const url = `${baseUrl()}/api/backend/client/track`;
    const res = await axios.get(url, {
      headers,
      params: { waybill: wb },
      timeout: 15_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "track failed" }, "DELHIVERY_TRACK");
    }
    const raw = res.data;
    let status = "UNKNOWN";
    const o = raw as Record<string, unknown>;
    if (typeof o?.status === "string") status = o.status;
    else if (typeof o?.Status === "string") status = o.Status;
    else if (Array.isArray(o?.ShipmentData) && (o.ShipmentData as unknown[])[0]) {
      const row = (o.ShipmentData as Record<string, unknown>[])[0];
      status = String(row?.Status ?? row?.status ?? "UNKNOWN");
    }
    return { success: true, data: { status, raw } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_TRACK");
  }
}

export async function cancelShipment(waybill: string): Promise<ApiOk<{ cancelled: boolean }> | ApiErr> {
  const headers = authHeaders();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const url = `${baseUrl()}/api/backend/client/json/cancel`;
    const res = await axios.post(
      url,
      { waybill: wb },
      {
        headers,
        timeout: 20_000,
        validateStatus: () => true
      }
    );
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "cancel failed" }, "DELHIVERY_CANCEL");
    }
    return { success: true, data: { cancelled: true } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_CANCEL");
  }
}
