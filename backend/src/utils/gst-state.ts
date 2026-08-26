/**
 * Authoritative Indian GST state / UT normalization (Phase 5B).
 * Canonical identity = GST state code (2 digits).
 * Do not duplicate this map in other modules — import from here.
 */

export type GstStateCode =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "08"
  | "09"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "26"
  | "27"
  | "28"
  | "29"
  | "30"
  | "31"
  | "32"
  | "33"
  | "34"
  | "35"
  | "36"
  | "37"
  | "38"
  | "97";

type StateEntry = {
  code: GstStateCode;
  name: string;
  aliases: string[];
};

/** Official-ish GST codes + common aliases (name, abbreviation, spaced variants). */
const STATE_ENTRIES: StateEntry[] = [
  { code: "01", name: "Jammu and Kashmir", aliases: ["JK", "J&K", "JAMMU & KASHMIR", "JAMMU AND KASHMIR"] },
  { code: "02", name: "Himachal Pradesh", aliases: ["HP", "HIMACHAL", "HIMACHAL PRADESH"] },
  { code: "03", name: "Punjab", aliases: ["PB", "PUNJAB"] },
  { code: "04", name: "Chandigarh", aliases: ["CH", "CHANDIGARH"] },
  { code: "05", name: "Uttarakhand", aliases: ["UK", "UA", "UTTARAKHAND", "UTTARANCHAL"] },
  { code: "06", name: "Haryana", aliases: ["HR", "HARYANA"] },
  { code: "07", name: "Delhi", aliases: ["DL", "DELHI", "NCT OF DELHI", "NEW DELHI"] },
  { code: "08", name: "Rajasthan", aliases: ["RJ", "RAJASTHAN"] },
  { code: "09", name: "Uttar Pradesh", aliases: ["UP", "UTTAR PRADESH", "UTTARPRADESH"] },
  { code: "10", name: "Bihar", aliases: ["BR", "BIHAR"] },
  { code: "11", name: "Sikkim", aliases: ["SK", "SIKKIM"] },
  { code: "12", name: "Arunachal Pradesh", aliases: ["AR", "ARUNACHAL", "ARUNACHAL PRADESH"] },
  { code: "13", name: "Nagaland", aliases: ["NL", "NAGALAND"] },
  { code: "14", name: "Manipur", aliases: ["MN", "MANIPUR"] },
  { code: "15", name: "Mizoram", aliases: ["MZ", "MIZORAM"] },
  { code: "16", name: "Tripura", aliases: ["TR", "TRIPURA"] },
  { code: "17", name: "Meghalaya", aliases: ["ML", "MEGHALAYA"] },
  { code: "18", name: "Assam", aliases: ["AS", "ASSAM"] },
  { code: "19", name: "West Bengal", aliases: ["WB", "WEST BENGAL", "WESTBENGAL"] },
  { code: "20", name: "Jharkhand", aliases: ["JH", "JHARKHAND"] },
  { code: "21", name: "Odisha", aliases: ["OR", "OD", "ODISHA", "ORISSA"] },
  { code: "22", name: "Chhattisgarh", aliases: ["CG", "CT", "CHHATTISGARH", "CHATTISGARH"] },
  { code: "23", name: "Madhya Pradesh", aliases: ["MP", "MADHYA PRADESH", "MADHYAPRADESH"] },
  { code: "24", name: "Gujarat", aliases: ["GJ", "GUJARAT"] },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", aliases: ["DN", "DD", "DNH", "DNHDD", "DADRA", "DAMAN", "DIU"] },
  { code: "27", name: "Maharashtra", aliases: ["MH", "MAHARASHTRA"] },
  { code: "28", name: "Andhra Pradesh", aliases: ["AP", "ANDHRA", "ANDHRA PRADESH", "ANDHRAPRADESH"] },
  { code: "29", name: "Karnataka", aliases: ["KA", "KARNATAKA"] },
  { code: "30", name: "Goa", aliases: ["GA", "GOA"] },
  { code: "31", name: "Lakshadweep", aliases: ["LD", "LAKSHADWEEP"] },
  { code: "32", name: "Kerala", aliases: ["KL", "KERALA"] },
  { code: "33", name: "Tamil Nadu", aliases: ["TN", "TAMIL NADU", "TAMILNADU", "TAMILNADU"] },
  { code: "34", name: "Puducherry", aliases: ["PY", "PONDICHERRY", "PUDUCHERRY"] },
  { code: "35", name: "Andaman and Nicobar Islands", aliases: ["AN", "ANDAMAN", "ANDAMAN AND NICOBAR"] },
  { code: "36", name: "Telangana", aliases: ["TS", "TG", "TELANGANA"] },
  { code: "37", name: "Andhra Pradesh", aliases: [] }, // reserved historic; kept for code lookup
  { code: "38", name: "Ladakh", aliases: ["LA", "LADAKH"] },
  { code: "97", name: "Other Territory", aliases: ["OT", "OTHER TERRITORY"] }
];

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[.&]/g, " ")
    .replace(/\s+/g, " ");
}

const LOOKUP = new Map<string, GstStateCode>();

for (const entry of STATE_ENTRIES) {
  LOOKUP.set(entry.code, entry.code);
  LOOKUP.set(normalizeToken(entry.name), entry.code);
  for (const alias of entry.aliases) {
    LOOKUP.set(normalizeToken(alias), entry.code);
  }
}

export type NormalizedGstState = {
  raw: string;
  code: GstStateCode;
  name: string;
};

export type GstStateNormalizeResult =
  | { ok: true; state: NormalizedGstState }
  | { ok: false; raw: string; code: "MISSING_STATE" | "UNKNOWN_STATE" };

export function normalizeGstState(raw: string | null | undefined): GstStateNormalizeResult {
  if (raw == null || !String(raw).trim()) {
    return { ok: false, raw: raw == null ? "" : String(raw), code: "MISSING_STATE" };
  }
  const token = normalizeToken(String(raw));
  // Bare 2-digit GST code
  if (/^\d{2}$/.test(token) && LOOKUP.has(token)) {
    const code = LOOKUP.get(token)!;
    const name = STATE_ENTRIES.find((e) => e.code === code)?.name ?? code;
    return { ok: true, state: { raw: String(raw), code, name } };
  }
  const code = LOOKUP.get(token);
  if (!code) {
    return { ok: false, raw: String(raw), code: "UNKNOWN_STATE" };
  }
  const name = STATE_ENTRIES.find((e) => e.code === code)?.name ?? code;
  return { ok: true, state: { raw: String(raw), code, name } };
}

export function gstStateCodeFromGstin(gstin: string | null | undefined): GstStateCode | null {
  if (!gstin?.trim()) return null;
  const g = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z0-9]{13}$/.test(g) && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(g)) {
    // Soft: accept first two digits if plausible GSTIN length
    if (g.length >= 2 && /^\d{2}/.test(g)) {
      const code = g.slice(0, 2) as GstStateCode;
      return LOOKUP.has(code) ? code : null;
    }
    return null;
  }
  const code = g.slice(0, 2) as GstStateCode;
  return LOOKUP.has(code) ? code : null;
}

export type SellerGstIdentity =
  | {
      ok: true;
      sellerStateRaw: string;
      sellerStateCode: GstStateCode;
      sellerGstin: string | null;
      gstinStateCode: GstStateCode | null;
    }
  | {
      ok: false;
      code: "MISSING_SELLER_STATE" | "UNKNOWN_SELLER_STATE" | "SELLER_STATE_CONFIGURATION_MISMATCH";
      sellerStateRaw: string;
      sellerGstin: string | null;
      gstinStateCode: GstStateCode | null;
      reason: string;
    };

/**
 * Resolve seller POS from SELLER_STATE / SELLER_GSTIN.
 * Prefer GSTIN prefix when present; contradicting SELLER_STATE → fail closed.
 */
export function resolveSellerGstIdentity(opts?: {
  sellerState?: string | null;
  sellerGstin?: string | null;
}): SellerGstIdentity {
  const sellerStateRaw = (opts?.sellerState ?? process.env.SELLER_STATE ?? "Karnataka").trim();
  const sellerGstin = (opts?.sellerGstin ?? process.env.SELLER_GSTIN ?? "").trim() || null;
  const gstinStateCode = gstStateCodeFromGstin(sellerGstin);
  const normalized = normalizeGstState(sellerStateRaw);

  if (!normalized.ok) {
    return {
      ok: false,
      code: normalized.code === "MISSING_STATE" ? "MISSING_SELLER_STATE" : "UNKNOWN_SELLER_STATE",
      sellerStateRaw,
      sellerGstin,
      gstinStateCode,
      reason: `Seller state cannot be normalized: ${normalized.code}`
    };
  }

  if (gstinStateCode && gstinStateCode !== normalized.state.code) {
    return {
      ok: false,
      code: "SELLER_STATE_CONFIGURATION_MISMATCH",
      sellerStateRaw,
      sellerGstin,
      gstinStateCode,
      reason: `SELLER_GSTIN prefix ${gstinStateCode} contradicts SELLER_STATE (${normalized.state.code} / ${sellerStateRaw})`
    };
  }

  return {
    ok: true,
    sellerStateRaw,
    sellerStateCode: normalized.state.code,
    sellerGstin,
    gstinStateCode
  };
}

export type SupplyType = "INTRA_STATE" | "INTER_STATE";

export type PlaceOfSupplyResolution =
  | {
      ok: true;
      supplyType: SupplyType;
      sellerStateRaw: string;
      sellerStateCode: GstStateCode;
      placeOfSupplyRaw: string;
      placeOfSupplyCode: GstStateCode;
      sellerGstin: string | null;
    }
  | {
      ok: false;
      code:
        | "GST_PLACE_OF_SUPPLY_DATA_GAP"
        | "MISSING_SELLER_STATE"
        | "UNKNOWN_SELLER_STATE"
        | "SELLER_STATE_CONFIGURATION_MISMATCH";
      sellerStateRaw: string;
      placeOfSupplyRaw: string;
      sellerGstin: string | null;
      reason: string;
    };

export function resolvePlaceOfSupply(opts: {
  placeOfSupplyRaw: string | null | undefined;
  sellerState?: string | null;
  sellerGstin?: string | null;
}): PlaceOfSupplyResolution {
  const seller = resolveSellerGstIdentity({
    sellerState: opts.sellerState,
    sellerGstin: opts.sellerGstin
  });
  const placeRaw = opts.placeOfSupplyRaw ?? "";
  if (!seller.ok) {
    return {
      ok: false,
      code: seller.code,
      sellerStateRaw: seller.sellerStateRaw,
      placeOfSupplyRaw: placeRaw,
      sellerGstin: seller.sellerGstin,
      reason: seller.reason
    };
  }
  const place = normalizeGstState(placeRaw);
  if (!place.ok) {
    return {
      ok: false,
      code: "GST_PLACE_OF_SUPPLY_DATA_GAP",
      sellerStateRaw: seller.sellerStateRaw,
      placeOfSupplyRaw: placeRaw,
      sellerGstin: seller.sellerGstin,
      reason: `Place of supply state unrecognized: ${place.code}`
    };
  }
  const supplyType: SupplyType =
    seller.sellerStateCode === place.state.code ? "INTRA_STATE" : "INTER_STATE";
  return {
    ok: true,
    supplyType,
    sellerStateRaw: seller.sellerStateRaw,
    sellerStateCode: seller.sellerStateCode,
    placeOfSupplyRaw: place.state.raw,
    placeOfSupplyCode: place.state.code,
    sellerGstin: seller.sellerGstin
  };
}

/** Phase 5B shipping policy: do not invent GST on shipping without rate evidence. */
export const SHIPPING_GST_POLICY = "SHIPPING_GST_DATA_GAP" as const;

/** CGST/SGST split for NEW tax snapshots / sales reporting (ORDER_PAID_V1 aligned). */
export function splitOutputGstPaise(taxPaise: number, supplyType: SupplyType) {
  if (supplyType === "INTER_STATE") {
    return { cgstInPaise: 0, sgstInPaise: 0, igstInPaise: taxPaise };
  }
  const cgstInPaise = Math.round(taxPaise / 2);
  return { cgstInPaise, sgstInPaise: taxPaise - cgstInPaise, igstInPaise: 0 };
}
