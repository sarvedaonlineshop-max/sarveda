import { gstFromInclusiveLine, gstRatePercent, isInterState } from "../../utils/gst";
import type { QuotationLineInput, QuotationAddress } from "./quotation.schemas";

export type ComputedQuoteLine = {
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPriceInPaise: number;
  discountInPaise: number;
  taxClass: string | null;
  taxRatePercent: number;
  taxableInPaise: number;
  taxInPaise: number;
  lineTotalInPaise: number;
  sortOrder: number;
};

export type ComputedQuoteTotals = {
  lines: ComputedQuoteLine[];
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
  taxPreviewMode: "INTRA_STATE" | "INTER_STATE" | "UNAVAILABLE" | "NOT_APPLICABLE";
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  taxAttention: string | null;
};

function stripControl(s: string): string {
  return s.replace(/[\u0000-\u001F\u007F<>]/g, "").trim();
}

export function sanitizeQuoteText(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = stripControl(String(s));
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function computeQuotationTotals(opts: {
  lines: QuotationLineInput[];
  shippingInPaise: number;
  headerDiscountInPaise: number;
  currency: string;
  shippingAddress: QuotationAddress;
}): ComputedQuoteTotals {
  const currency = opts.currency.trim().toUpperCase() || "INR";
  const shipCountry = (opts.shippingAddress.country ?? "IN").trim().toUpperCase();
  const gstApplicable = currency === "INR" && shipCountry === "IN";

  let taxAttention: string | null = null;
  let taxPreviewMode: ComputedQuoteTotals["taxPreviewMode"] = "NOT_APPLICABLE";
  let interState = false;

  if (gstApplicable) {
    const state = opts.shippingAddress.state?.trim();
    if (!state) {
      taxPreviewMode = "UNAVAILABLE";
      taxAttention = "Add a shipping state to estimate CGST/SGST or IGST.";
    } else {
      try {
        interState = isInterState(state, shipCountry);
        taxPreviewMode = interState ? "INTER_STATE" : "INTRA_STATE";
      } catch {
        taxPreviewMode = "UNAVAILABLE";
        taxAttention = "Could not determine place of supply for estimated GST.";
      }
    }
  }

  const lines: ComputedQuoteLine[] = opts.lines.map((raw, idx) => {
    const qty = Math.max(1, Math.floor(raw.quantity));
    const unit = Math.max(0, Math.floor(raw.unitPriceInPaise));
    const discount = Math.max(0, Math.floor(raw.discountInPaise ?? 0));
    const gross = qty * unit;
    const lineTotal = Math.max(0, gross - discount);
    const taxClass = raw.taxClass?.trim() || null;
    const rate = gstApplicable ? gstRatePercent(taxClass) : 0;
    const { taxableMinor, taxMinor } =
      gstApplicable && taxPreviewMode !== "UNAVAILABLE"
        ? gstFromInclusiveLine(lineTotal, rate)
        : { taxableMinor: lineTotal, taxMinor: 0 };

    return {
      productId: raw.productId ?? null,
      variantId: raw.variantId ?? null,
      productName: stripControl(raw.productName).slice(0, 500) || "Item",
      sku: sanitizeQuoteText(raw.sku, 120),
      hsnCode: sanitizeQuoteText(raw.hsnCode, 20),
      quantity: qty,
      unitPriceInPaise: unit,
      discountInPaise: discount,
      taxClass,
      taxRatePercent: rate,
      taxableInPaise: taxableMinor,
      taxInPaise: taxMinor,
      lineTotalInPaise: lineTotal,
      sortOrder: idx
    };
  });

  const subtotalInPaise = lines.reduce((s, l) => s + l.quantity * l.unitPriceInPaise, 0);
  const lineDiscountSum = lines.reduce((s, l) => s + l.discountInPaise, 0);
  const headerDiscount = Math.max(0, Math.floor(opts.headerDiscountInPaise));
  const discountInPaise = lineDiscountSum + headerDiscount;
  const shippingInPaise = Math.max(0, Math.floor(opts.shippingInPaise));
  const linesNet = lines.reduce((s, l) => s + l.lineTotalInPaise, 0);
  const afterHeaderDiscount = Math.max(0, linesNet - headerDiscount);
  const grandTotalInPaise = afterHeaderDiscount + shippingInPaise;
  const taxInPaise = lines.reduce((s, l) => s + l.taxInPaise, 0);

  let cgstInPaise = 0;
  let sgstInPaise = 0;
  let igstInPaise = 0;
  if (gstApplicable && taxPreviewMode === "INTRA_STATE") {
    cgstInPaise = Math.floor(taxInPaise / 2);
    sgstInPaise = taxInPaise - cgstInPaise;
  } else if (gstApplicable && taxPreviewMode === "INTER_STATE") {
    igstInPaise = taxInPaise;
  }

  return {
    lines,
    subtotalInPaise,
    discountInPaise,
    shippingInPaise,
    taxInPaise,
    grandTotalInPaise,
    taxPreviewMode,
    cgstInPaise,
    sgstInPaise,
    igstInPaise,
    taxAttention
  };
}
