import axios, { type AxiosError } from "axios";
import { URLSearchParams } from "node:url";

import { shippingEnv } from "../../config/env";
import { logger } from "../../config/logger";

import type { DelhiveryPackingSlipPackage } from "./delhivery.label";
import { renderDelhiveryPackingSlipHtml } from "./delhivery.label";
import type { ApiErr, ApiOk } from "./types";

/**
 * Paths aligned with Delhivery One B2C docs:
 * - Pincode: GET /c/api/pin-codes/json/?filter_codes=
 * - Create: POST /api/cmu/create.json (format=json&data=...)
 * - Track: GET /api/v1/packages/json/?waybill=
 * - Cancel: POST /api/p/edit { waybill, cancellation: "true" }
 *
 * Base URL: staging https://staging-express.delhivery.com — production https://track.delhivery.com
 */

function authHeadersJson(): Record<string, string> | null {
  const token = shippingEnv.DELHIVERY_API_KEY.trim();
  if (!token) return null;
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
}

function authHeadersForm(): Record<string, string> | null {
  const token = shippingEnv.DELHIVERY_API_KEY.trim();
  if (!token) return null;
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded"
  };
}

function baseUrl(): string {
  return shippingEnv.DELHIVERY_BASE_URL.replace(/\/$/, "");
}

function assertDelhiveryConfigured(): void {
  if (!shippingEnv.DELHIVERY_API_KEY.trim()) {
    throw new Error("Delhivery not configured (DELHIVERY_API_KEY missing)");
  }
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
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "DELHIVERY_NOT_CONFIGURED"
    };
  }
  const headers = authHeadersJson();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const pc = pincode.replace(/\D/g, "").slice(0, 6);
  if (pc.length !== 6) {
    return { success: false, error: "Invalid pincode", code: "INVALID_PINCODE" };
  }
  try {
    const url = `${baseUrl()}/c/api/pin-codes/json/`;
    const res = await axios.get(url, {
      headers,
      params: { filter_codes: pc },
      timeout: 15_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "serviceability failed" }, "DELHIVERY_SERVICEABILITY");
    }
    const raw = res.data as Record<string, unknown>;
    const rows = (raw?.delivery_codes ??
      raw?.deliveryCodes ??
      raw?.data ??
      raw?.pin_codes) as unknown;
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      return { success: true, data: { serviceable: false, estimatedDays: 0 } };
    }
    const first = list[0] as Record<string, unknown>;
    const remark = String(first?.remark ?? first?.Remark ?? "").trim();
    const embargo = remark.toLowerCase().includes("embargo");
    const serviceable = !embargo && remark.toLowerCase() !== "nsz";
    let estimatedDays = 5;
    const est =
      first?.estimated_delivery_days ??
      first?.estimated_days ??
      first?.edd ??
      first?.delivery_estimate ??
      first?.tat;
    if (typeof est === "number" && Number.isFinite(est)) estimatedDays = Math.max(1, Math.round(est));
    else if (typeof est === "string" && /^\d+$/.test(est)) estimatedDays = Math.max(1, parseInt(est, 10));

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
  /** Override computed weight (grams). */
  weightGrams?: number;
  pickupLocation?: string;
  /** Sales channel — stored on order meta; default Sarveda website. */
  channel?: string;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  /** Surface (S) or Express (E) */
  shippingMode?: "S" | "E";
  packageType?: string;
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
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "DELHIVERY_NOT_CONFIGURED"
    };
  }
  const headers = authHeadersForm();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  try {
    const pin = input.pincode.replace(/\D/g, "").slice(0, 6);
    const weightG = Math.max(
      50,
      input.weightGrams != null ? Math.round(input.weightGrams) : Math.round(input.weightKg * 1000)
    );
    const paymentMode = input.paymentMode === "COD" ? "COD" : "Prepaid";
    const lengthCm = Math.max(5, input.lengthCm ?? 10);
    const breadthCm = Math.max(5, input.breadthCm ?? 10);
    const heightCm = Math.max(5, input.heightCm ?? 10);

    const shipment: Record<string, unknown> = {
      name: input.consigneeName,
      phone: input.consigneePhone,
      order: input.orderNumber,
      add: input.address,
      pin,
      city: input.city,
      state: input.state,
      country: "India",
      payment_mode: paymentMode,
      weight: weightG,
      shipment_width: breadthCm,
      shipment_height: heightCm,
      shipment_length: lengthCm
    };
    if (input.shippingMode) {
      shipment.shipping_mode = input.shippingMode === "E" ? "Express" : "Surface";
    }
    if (input.packageType?.trim()) {
      shipment.products_desc = input.packageType.trim();
    }
    if (paymentMode === "COD" && input.codAmountRupees != null) {
      shipment.cod_amount = Number(input.codAmountRupees.toFixed(2));
    }

    const payload: Record<string, unknown> = {
      shipments: [shipment]
    };
    if (input.pickupLocation) {
      payload.pickups = [{ pickup_location: input.pickupLocation }];
    }
    if (input.channel?.trim()) {
      payload.channel = input.channel.trim();
    }

    const form = new URLSearchParams();
    form.append("format", "json");
    form.append("data", JSON.stringify(payload));

    const url = `${baseUrl()}/api/cmu/create.json`;
    const res = await axios.post(url, form.toString(), {
      headers,
      timeout: 45_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "create shipment failed" }, "DELHIVERY_CREATE");
    }
    const body = res.data as Record<string, unknown>;
    const pkgs = (body?.packages ??
      body?.success ??
      body?.Package ??
      body?.data) as Record<string, unknown>[] | Record<string, unknown> | undefined;
    let waybill = "";
    const arr = Array.isArray(pkgs) ? pkgs : pkgs && typeof pkgs === "object" ? [pkgs as Record<string, unknown>] : [];
    if (arr[0]) {
      waybill = String(arr[0].waybill ?? arr[0].AWB ?? arr[0].wb ?? arr[0].Waybill ?? "");
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
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "DELHIVERY_NOT_CONFIGURED"
    };
  }
  const headers = authHeadersJson();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const url = `${baseUrl()}/api/v1/packages/json/`;
    const res = await axios.get(url, {
      headers,
      params: { waybill: wb },
      timeout: 20_000,
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
    } else if (Array.isArray(o?.packages) && (o.packages as unknown[])[0]) {
      const row = (o.packages as Record<string, unknown>[])[0];
      status = String(row?.status ?? row?.Status ?? "UNKNOWN");
    }
    return { success: true, data: { status, raw } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_TRACK");
  }
}

export async function cancelShipment(waybill: string): Promise<ApiOk<{ cancelled: boolean }> | ApiErr> {
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "DELHIVERY_NOT_CONFIGURED"
    };
  }
  const headers = authHeadersJson();
  if (!headers) {
    return { success: false, error: "Delhivery is not configured", code: "DELHIVERY_NOT_CONFIGURED" };
  }
  const wb = waybill.trim();
  if (!wb) return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  try {
    const url = `${baseUrl()}/api/p/edit`;
    const res = await axios.post(
      url,
      { waybill: wb, cancellation: "true" },
      {
        headers,
        timeout: 25_000,
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

export async function fetchPackingSlip(
  waybill: string,
  renderOptions?: import("./delhivery.label").LabelRenderOptions
): Promise<ApiOk<{ packages: DelhiveryPackingSlipPackage[]; html: string }> | ApiErr> {
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "NOT_CONFIGURED"
    };
  }
  const headers = authHeadersJson();
  if (!headers) {
    return {
      success: false,
      error: "Not configured",
      code: "NOT_CONFIGURED"
    };
  }
  const wb = waybill.trim();
  if (!wb) {
    return { success: false, error: "Waybill required", code: "BAD_REQUEST" };
  }
  try {
    const url = `${baseUrl()}/api/p/packing_slip?wbns=${encodeURIComponent(wb)}`;
    const res = await axios.get(url, {
      headers,
      timeout: 25_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      const detail =
        res.data && typeof res.data === "object" && "detail" in res.data
          ? String((res.data as { detail?: string }).detail)
          : "Delhivery label request failed";
      return mapAxiosError({ response: res, message: detail }, "DELHIVERY_LABEL");
    }
    const raw = res.data as { packages?: DelhiveryPackingSlipPackage[] };
    const packages = Array.isArray(raw?.packages) ? raw.packages : [];
    if (packages.length === 0) {
      return {
        success: false,
        error: "No packing slip data returned for this waybill",
        code: "DELHIVERY_LABEL_EMPTY"
      };
    }
    return {
      success: true,
      data: {
        packages,
        html: renderDelhiveryPackingSlipHtml(packages, renderOptions)
      }
    };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_LABEL");
  }
}

/** @deprecated Use fetchPackingSlip — Delhivery auth must be server-side, not URL redirect. */
export async function fetchLabelPdf(
  waybill: string
): Promise<ApiOk<{ pdfUrl: string }> | ApiErr> {
  const out = await fetchPackingSlip(waybill);
  if (!out.success) return out;
  return {
    success: false,
    error: "Direct PDF URL is not supported; use admin label endpoint",
    code: "USE_ADMIN_LABEL_PROXY"
  };
}
