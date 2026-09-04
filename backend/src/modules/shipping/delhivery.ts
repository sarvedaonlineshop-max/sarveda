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

export type DelhiveryBoxInput = {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightGrams: number;
  /** PLASTIC_COVER = flyer (dead weight up to 1 kg); CARDBOARD_BOX = volumetric billing */
  packageType?: "PLASTIC_COVER" | "CARDBOARD_BOX";
};

export type DelhiveryShipmentInput = {
  orderNumber: string;
  paymentMode: "Pre-paid" | "COD";
  codAmountRupees?: number;
  /** Order invoice / declared value in rupees — populates label `rs` for Pre-paid. */
  orderValueRupees?: number;
  productsDesc?: string;
  sellerGstTin?: string;
  hsnCode?: string;
  invoiceReference?: string;
  weightKg: number;
  /** Override computed weight (grams) when single-box. */
  weightGrams?: number;
  pickupLocation?: string;
  channel?: string;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  shippingMode?: "S" | "E";
  packageType?: "PLASTIC_COVER" | "CARDBOARD_BOX";
  /** Multi-piece (MPS): up to 5 boxes; each needs a pre-fetched waybill. */
  boxes?: DelhiveryBoxInput[];
  consigneeName: string;
  consigneePhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

/** Delhivery chargeable weight: max(dead, volumetric); flyer uses dead weight up to 1 kg. */
export function chargeableWeightGrams(box: DelhiveryBoxInput): number {
  const dead = Math.max(50, Math.round(box.weightGrams));
  if (box.packageType === "PLASTIC_COVER" && dead <= 1000) return dead;
  const volKg = (Math.max(1, box.lengthCm) * Math.max(1, box.breadthCm) * Math.max(1, box.heightCm)) / 5000;
  return Math.max(dead, Math.round(volKg * 1000), 50);
}

export function totalChargeableWeightGrams(boxes: DelhiveryBoxInput[]): number {
  return boxes.reduce((sum, b) => sum + chargeableWeightGrams(b), 0);
}

function resolveBoxes(input: DelhiveryShipmentInput): DelhiveryBoxInput[] {
  if (input.boxes?.length) {
    return input.boxes.slice(0, 5).map((b) => ({
      lengthCm: Math.max(5, b.lengthCm),
      breadthCm: Math.max(5, b.breadthCm),
      heightCm: Math.max(5, b.heightCm),
      weightGrams: Math.max(50, Math.round(b.weightGrams)),
      packageType: b.packageType ?? input.packageType
    }));
  }
  const weightG = Math.max(
    50,
    input.weightGrams != null ? Math.round(input.weightGrams) : Math.round(input.weightKg * 1000)
  );
  return [
    {
      lengthCm: Math.max(5, input.lengthCm ?? 10),
      breadthCm: Math.max(5, input.breadthCm ?? 10),
      heightCm: Math.max(5, input.heightCm ?? 10),
      weightGrams: weightG,
      packageType: input.packageType
    }
  ];
}

function buildShipmentRecord(
  input: DelhiveryShipmentInput,
  box: DelhiveryBoxInput,
  opts: { paymentMode: string; pin: string; orderValue: number; isMaster: boolean; mpsCount: number; waybill?: string; masterWaybill?: string }
): Record<string, unknown> {
  const weightG = chargeableWeightGrams(box);
  const shipment: Record<string, unknown> = {
    name: input.consigneeName,
    phone: input.consigneePhone,
    order: input.orderNumber,
    add: input.address,
    pin: opts.pin,
    city: input.city,
    state: input.state,
    country: "India",
    payment_mode: opts.paymentMode,
    weight: weightG,
    shipment_width: box.breadthCm,
    shipment_height: box.heightCm,
    shipment_length: box.lengthCm
  };
  if (input.shippingMode) {
    shipment.shipping_mode = input.shippingMode === "E" ? "Express" : "Surface";
  }
  if (input.productsDesc?.trim()) {
    shipment.products_desc = input.productsDesc.trim().slice(0, 240);
  }
  if (opts.orderValue > 0) {
    shipment.total_amount = Number(opts.orderValue.toFixed(2));
  }
  if (opts.paymentMode === "COD" && opts.orderValue > 0) {
    shipment.cod_amount = Number(opts.orderValue.toFixed(2));
  } else if (opts.paymentMode === "COD" && input.codAmountRupees != null) {
    shipment.cod_amount = Number(input.codAmountRupees.toFixed(2));
  }
  const gst = input.sellerGstTin?.trim() || process.env.SELLER_GSTIN?.trim();
  if (gst) shipment.seller_gst_tin = gst;
  const hsn = input.hsnCode?.trim() || process.env.DEFAULT_HSN_CODE?.trim();
  if (hsn) shipment.hsn_code = hsn;
  if (input.invoiceReference?.trim()) {
    shipment.invoice_reference = input.invoiceReference.trim().slice(0, 64);
  }
  if (opts.waybill) shipment.waybill = opts.waybill;
  if (opts.mpsCount > 1) {
    if (opts.isMaster) {
      shipment.mps_amount = String(opts.mpsCount);
    } else if (opts.masterWaybill) {
      shipment.master_waybill = opts.masterWaybill;
    }
  }
  return shipment;
}

/** Pre-fetch AWBs for MPS (Delhivery requires explicit waybill per box). */
export async function fetchBulkWaybills(count: number): Promise<ApiOk<{ waybills: string[] }> | ApiErr> {
  try {
    assertDelhiveryConfigured();
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delhivery not configured",
      code: "DELHIVERY_NOT_CONFIGURED"
    };
  }
  const n = Math.min(Math.max(1, Math.round(count)), 10);
  const client = process.env.DELHIVERY_CLIENT_NAME?.trim();
  const token = shippingEnv.DELHIVERY_API_KEY.trim();
  if (!client) {
    return {
      success: false,
      error: "Multi-box shipments need DELHIVERY_CLIENT_NAME in backend .env (Delhivery registered client name).",
      code: "DELHIVERY_CLIENT_NAME"
    };
  }
  try {
    const url = `${baseUrl()}/waybill/api/bulk/json/`;
    const res = await axios.get(url, {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      params: { cl: client, token, count: n },
      timeout: 25_000,
      validateStatus: () => true
    });
    if (res.status >= 400) {
      return mapAxiosError({ response: res, message: "bulk waybill fetch failed" }, "DELHIVERY_WAYBILL");
    }
    const waybills = parseBulkWaybillResponse(res.data);
    if (waybills.length < n) {
      logger.warn("Delhivery bulk waybill returned too few", {
        needed: n,
        got: waybills.length,
        rawType: typeof res.data,
        rawSnippet: String(typeof res.data === "object" ? JSON.stringify(res.data) : res.data).slice(0, 300)
      });
      return {
        success: false,
        error: `Delhivery returned ${waybills.length} waybill(s), needed ${n}`,
        code: "DELHIVERY_WAYBILL"
      };
    }
    return { success: true, data: { waybills: waybills.slice(0, n) } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_WAYBILL");
  }
}

/**
 * Delhivery's bulk waybill endpoint returns the AWBs as a comma-separated
 * string (e.g. "33110110012345,33110110012346"), but can also return a JSON
 * array or an object wrapping the list. Normalise all shapes to string[].
 */
export function parseBulkWaybillResponse(raw: unknown): string[] {
  const splitString = (val: string): string[] =>
    val
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter(Boolean);

  const fromList = (list: unknown): string[] => {
    if (!Array.isArray(list)) return [];
    return list
      .map((w) => {
        if (w && typeof w === "object") {
          const o = w as Record<string, unknown>;
          return String(o.waybill ?? o.wbn ?? o.awb ?? "").trim();
        }
        return String(w).trim();
      })
      .filter(Boolean);
  };

  if (Array.isArray(raw)) return fromList(raw);
  if (typeof raw === "string") return splitString(raw);
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const list = o.waybills ?? o.wbns ?? o.data ?? o.packages;
    if (Array.isArray(list)) return fromList(list);
    if (typeof list === "string") return splitString(list);
  }
  return [];
}

export type DelhiveryShippingEstimateInput = {
  originPin: string;
  destPin: string;
  shippingMode: "S" | "E";
  paymentMode: "Pre-paid" | "COD";
  boxes: DelhiveryBoxInput[];
};

/** Parse Delhivery kinko invoice/charges response (object, array, or XML string). */
export function parseDelhiveryEstimateTotal(raw: unknown): number {
  const asNum = (v: unknown): number => {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const fromRecord = (o: Record<string, unknown>): number => {
    const direct = asNum(
      o.total_amount ??
        o.Total_amount ??
        o.totalAmount ??
        o.total ??
        o.charge ??
        o.freight ??
        o.amount
    );
    if (direct > 0) return direct;

    const gross = asNum(o.gross_amount ?? o.grossAmount ?? o.gross);
    if (gross > 0) {
      const tax =
        asNum(o.tax) +
        asNum(o.cgst) +
        asNum(o.sgst) +
        asNum(o.igst) +
        asNum(o.service_tax);
      return gross + tax;
    }
    return 0;
  };

  const visit = (node: unknown): number => {
    if (node == null) return 0;
    if (typeof node === "number") return asNum(node);
    if (typeof node === "string") {
      const trimmed = node.trim();
      if (!trimmed) return 0;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return visit(JSON.parse(trimmed) as unknown);
        } catch {
          /* fall through to XML / regex */
        }
      }
      const xmlMatch = trimmed.match(/<total_amount[^>]*>([\d.]+)<\/total_amount>/i);
      if (xmlMatch?.[1]) return asNum(xmlMatch[1]);
      const jsonMatch = trimmed.match(/"total_amount"\s*:\s*([\d.]+)/i);
      if (jsonMatch?.[1]) return asNum(jsonMatch[1]);
      return 0;
    }
    if (Array.isArray(node)) {
      let best = 0;
      for (const item of node) {
        best = Math.max(best, visit(item));
      }
      return best;
    }
    if (typeof node === "object") {
      const o = node as Record<string, unknown>;
      const direct = fromRecord(o);
      if (direct > 0) return direct;
      let best = 0;
      for (const v of Object.values(o)) {
        best = Math.max(best, visit(v));
      }
      return best;
    }
    return 0;
  };

  return visit(raw);
}

/** Delhivery invoice/shipping charge API — approximate freight (not label order value). */
export async function estimateShippingCharge(
  input: DelhiveryShippingEstimateInput
): Promise<ApiOk<{ chargeableGrams: number; totalAmount: number; raw: unknown }> | ApiErr> {
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
  const oPin = input.originPin.replace(/\D/g, "").slice(0, 6);
  const dPin = input.destPin.replace(/\D/g, "").slice(0, 6);
  if (oPin.length !== 6 || dPin.length !== 6) {
    return { success: false, error: "Valid 6-digit origin and destination PIN required", code: "BAD_REQUEST" };
  }
  const cgm = totalChargeableWeightGrams(input.boxes);
  const ptCandidates =
    input.paymentMode === "COD"
      ? ["COD", "Cod"]
      : ["Pre-paid", "Prepaid", "Pre-Paid"];
  try {
    const url = `${baseUrl()}/api/kinko/v1/invoice/charges/.json`;
    let raw: unknown = null;
    let totalAmount = 0;
    let usedPt = ptCandidates[0];
    for (const pt of ptCandidates) {
      const res = await axios.get(url, {
        headers,
        params: { md: input.shippingMode, cgm, o_pin: oPin, d_pin: dPin, ss: "Delivered", pt },
        timeout: 20_000,
        validateStatus: () => true
      });
      if (res.status >= 400) {
        return mapAxiosError({ response: res, message: "shipping estimate failed" }, "DELHIVERY_ESTIMATE");
      }
      raw = res.data;
      totalAmount = parseDelhiveryEstimateTotal(raw);
      usedPt = pt;
      if (totalAmount > 0) break;
    }
    if (totalAmount <= 0) {
      logger.warn("delhivery_estimate_zero_amount", {
        cgm,
        md: input.shippingMode,
        oPin,
        dPin,
        pt: usedPt,
        sample: typeof raw === "string" ? raw.slice(0, 400) : raw
      });
    }
    return { success: true, data: { chargeableGrams: cgm, totalAmount, raw } };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_ESTIMATE");
  }
}

export async function createShipment(
  input: DelhiveryShipmentInput
): Promise<ApiOk<{ waybill: string; trackingUrl: string; mpsWaybills?: string[] }> | ApiErr> {
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
    const paymentMode = input.paymentMode === "COD" ? "COD" : "Prepaid";
    const boxes = resolveBoxes(input);
    const orderValue =
      input.orderValueRupees ??
      (input.paymentMode === "COD" ? input.codAmountRupees : undefined) ??
      0;

    let waybills: string[] = [];
    if (boxes.length > 1) {
      const bulk = await fetchBulkWaybills(boxes.length);
      if (!bulk.success) return bulk;
      waybills = bulk.data.waybills;
    }

    const shipments = boxes.map((box, idx) =>
      buildShipmentRecord(input, box, {
        paymentMode,
        pin,
        orderValue,
        isMaster: idx === 0,
        mpsCount: boxes.length,
        waybill: waybills[idx],
        masterWaybill: idx > 0 ? waybills[0] : undefined
      })
    );

    const payload: Record<string, unknown> = {
      shipments
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
      const pkg0 = arr[0] as Record<string, unknown> | undefined;
      const remarksRaw = pkg0?.remarks;
      const remarks = Array.isArray(remarksRaw)
        ? remarksRaw.map((r) => String(r)).filter(Boolean).join(" ")
        : typeof remarksRaw === "string"
          ? remarksRaw
          : "";
      const rmk = typeof body?.rmk === "string" ? body.rmk.trim() : "";
      const pkgStatus = typeof pkg0?.status === "string" ? pkg0.status : "";
      const detail =
        [remarks, rmk && rmk !== remarks ? rmk : ""].filter(Boolean).join(" — ") ||
        "Delhivery did not return a waybill";
      return {
        success: false,
        error: detail,
        code:
          pkgStatus.toLowerCase() === "fail" || pkg0?.serviceable === false || /non[- ]?serviceable/i.test(detail)
            ? "DELHIVERY_CREATE"
            : "DELHIVERY_PARSE"
      };
    }
    const trackingUrl = `https://www.delhivery.com/track/package/${waybill}`;
    return {
      success: true,
      data: {
        waybill,
        trackingUrl,
        ...(waybills.length > 1 ? { mpsWaybills: waybills } : {})
      }
    };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_CREATE");
  }
}

export type DelhiveryReverseInput = {
  orderNumber: string;
  consigneeName: string;
  consigneePhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  pickupLocation?: string;
  channel?: string;
  productsDesc?: string;
  weightGrams: number;
  lengthCm?: number;
  breadthCm?: number;
  heightCm?: number;
  shippingMode?: "S" | "E";
  /** Return warehouse — if omitted Delhivery uses registered warehouse. */
  returnName?: string;
  returnPhone?: string;
  returnAddress?: string;
  returnCity?: string;
  returnState?: string;
  returnPin?: string;
  reason?: string;
};

/** Delhivery RVP / reverse pickup — same create API with payment_mode Pickup. */
export async function createReversePickup(
  input: DelhiveryReverseInput
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
    const weightG = Math.max(50, Math.round(input.weightGrams));
    const shipment: Record<string, unknown> = {
      name: input.consigneeName,
      phone: input.consigneePhone,
      order: input.orderNumber,
      add: input.address,
      pin,
      city: input.city,
      state: input.state,
      country: "India",
      payment_mode: "Pickup",
      weight: weightG,
      shipment_length: Math.max(5, input.lengthCm ?? 10),
      shipment_width: Math.max(5, input.breadthCm ?? 10),
      shipment_height: Math.max(5, input.heightCm ?? 10)
    };
    if (input.shippingMode) {
      shipment.shipping_mode = input.shippingMode === "E" ? "Express" : "Surface";
    }
    if (input.productsDesc?.trim()) {
      shipment.products_desc = input.productsDesc.trim().slice(0, 240);
    }
    if (input.reason?.trim()) {
      shipment.seller_inv = input.reason.trim().slice(0, 120);
    }
    if (input.returnAddress?.trim()) {
      shipment.return_name = input.returnName?.trim() || input.consigneeName;
      shipment.return_phone = input.returnPhone?.trim() || input.consigneePhone;
      shipment.return_add = input.returnAddress.trim();
      shipment.return_pin = (input.returnPin ?? "").replace(/\D/g, "").slice(0, 6);
      shipment.return_city = input.returnCity?.trim() ?? "";
      shipment.return_state = input.returnState?.trim() ?? "";
    }
    const payload: Record<string, unknown> = { shipments: [shipment] };
    if (input.pickupLocation?.trim()) {
      payload.pickups = [{ pickup_location: input.pickupLocation.trim() }];
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
      return mapAxiosError({ response: res, message: "reverse pickup failed" }, "DELHIVERY_REVERSE");
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
      logger.warn("delhivery_reverse_unparsed", { body });
      return {
        success: false,
        error: "Delhivery did not return a reverse pickup waybill",
        code: "DELHIVERY_PARSE"
      };
    }
    return {
      success: true,
      data: { waybill, trackingUrl: `https://www.delhivery.com/track/package/${waybill}` }
    };
  } catch (err) {
    return mapAxiosError(err, "DELHIVERY_REVERSE");
  }
}

/** Cancel master + all MPS child waybills when present in carrierMeta. */
export async function cancelShipmentWithMps(
  masterWaybill: string,
  carrierMeta: unknown
): Promise<ApiOk<{ cancelled: string[] }> | ApiErr> {
  const meta =
    carrierMeta && typeof carrierMeta === "object"
      ? (carrierMeta as { mpsWaybills?: unknown })
      : null;
  const list = Array.isArray(meta?.mpsWaybills)
    ? meta!.mpsWaybills!.map((w) => String(w)).filter(Boolean)
    : [];
  const waybills = list.length > 1 ? list : [masterWaybill.trim()];
  const cancelled: string[] = [];
  for (const wb of waybills) {
    const r = await cancelShipment(wb);
    if (!r.success) return r;
    cancelled.push(wb);
  }
  return { success: true, data: { cancelled } };
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
