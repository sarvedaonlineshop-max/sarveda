import PDFDocument from "pdfkit";

import { amountInCurrencyWords } from "./numberWords";

type InvoiceAddress = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type GstInvoiceLine = {
  name: string;
  sku: string;
  qty: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  taxClass: string;
  hsn: string;
  gstRatePercent: number;
  taxableMinor: number;
  taxMinor: number;
};

export type GstInvoiceInput = {
  invoiceNo: string;
  orderNumber: string;
  currency: string;
  issuedAt: Date;
  buyerEmail: string;
  shippingAddress: InvoiceAddress;
  items: GstInvoiceLine[];
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
  interState: boolean;
  /** True for India shipping + INR — GST tax invoice. */
  isGstApplicable: boolean;
};

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB"
};

function currencyCode(input: GstInvoiceInput): string {
  return input.currency.trim().toUpperCase() || "INR";
}

function currencySymbol(code: string): string {
  switch (code) {
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "INR":
    default:
      return "₹";
  }
}

function fmtMinor(minor: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "INR";
  const locale = CURRENCY_LOCALES[code] ?? "en-US";
  return (minor / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtTotal(minor: number, currency: string): string {
  return `${currencySymbol(currency)}${fmtMinor(minor, currency)}`;
}

const STATE_GST_CODES: Record<string, string> = {
  karnataka: "29",
  delhi: "07",
  maharashtra: "27",
  tamilnadu: "33",
  "tamil nadu": "33",
  haryana: "06",
  uttarpradesh: "09",
  "uttar pradesh": "09",
  westbengal: "19",
  "west bengal": "19",
  gujarat: "24",
  rajasthan: "08",
  punjab: "03",
  telangana: "36",
  andhrapradesh: "37",
  "andhra pradesh": "37",
  kerala: "32",
  madhyapradesh: "23",
  "madhya pradesh": "23"
};

function fiscalYearLabel(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = m >= 3 ? y : y - 1;
  const end = (start + 1) % 100;
  return `${String(start % 100).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

export function formatDisplayInvoiceNo(orderNumber: string, issuedAt: Date): string {
  const fy = fiscalYearLabel(issuedAt);
  const digits = orderNumber.replace(/\D/g, "");
  const seq = digits.slice(-5).padStart(5, "0");
  return `INV/${fy}/${seq}`;
}

function placeOfSupply(state: string): string {
  const key = state.trim().toLowerCase();
  const code = STATE_GST_CODES[key];
  const label = state.trim() || "India";
  return code ? `${label} (${code})` : label;
}

function sellerBlock(): {
  name: string;
  companyId: string;
  addressLines: string[];
  gstin: string;
  phone: string;
  email: string;
  website: string;
} {
  const address = process.env.SELLER_ADDRESS?.trim() || "Bengaluru, Karnataka, India";
  return {
    name: process.env.SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited",
    companyId: process.env.SELLER_COMPANY_ID?.trim() || "",
    addressLines: address.split(/\n+/).map((l) => l.trim()).filter(Boolean),
    gstin: process.env.SELLER_GSTIN?.trim() || "",
    phone: process.env.SELLER_PHONE?.trim() || "",
    email: process.env.SELLER_EMAIL?.trim() || "care@sarveda.com",
    website: process.env.SELLER_WEBSITE?.trim() || "www.sarveda.com"
  };
}

type TaxBucket = { rate: number; cgst: number; sgst: number; igst: number };

export function buildOrderInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return input.isGstApplicable ? buildGstInvoicePdf(input) : buildCommercialInvoicePdf(input);
}

type PdfDoc = InstanceType<typeof PDFDocument>;

// ── Palette ───────────────────────────────────────────────────────────────────
const BRAND_DARK  = "#1C1C1C";
const BRAND_OLIVE = "#4A5E3A";
const ROW_ALT     = "#F7F6F3";
const RULE_LIGHT  = "#E2E0DA";
const TEXT_MUTED  = "#6B6860";
const TEXT_BODY   = "#2C2B28";
const INV_WHITE   = "#FFFFFF";

function renderInvoiceHeader(
  doc: PdfDoc,
  input: GstInvoiceInput,
  title: string,
  opts: { showGstin: boolean; showPlaceOfSupply: boolean }
): void {
  const seller           = sellerBlock();
  const displayInvoiceNo = formatDisplayInvoiceNo(input.orderNumber, input.issuedAt);
  const addr             = input.shippingAddress;
  const pageWidth        = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left             = doc.page.margins.left;
  const top              = doc.page.margins.top;

  // ── 1. Full-width dark header bar ──────────────────────────────────────────
  const barH = 54;
  doc.rect(left - doc.page.margins.left, top - doc.page.margins.top,
           doc.page.width, barH)
     .fill(BRAND_DARK);

  // Brand name — left
  doc.fillColor(INV_WHITE).fontSize(18).font("Helvetica-Bold")
     .text("SARVEDA", left, top + 10, { width: pageWidth * 0.5 });
  doc.fillColor("#B8C4A8").fontSize(7).font("Helvetica")
     .text("YOGA  \u00B7  AYURVEDA  \u00B7  SOUND", left, top + 32,
           { width: pageWidth * 0.5, characterSpacing: 1.2 });

  // Invoice title — right
  doc.fillColor(INV_WHITE).fontSize(18).font("Helvetica-Bold")
     .text(title.toUpperCase(), left, top + 9,
           { width: pageWidth, align: "right", characterSpacing: 1 });
  doc.fillColor("#B8C4A8").fontSize(7.5).font("Helvetica")
     .text(`Invoice# ${displayInvoiceNo}`, left, top + 32,
           { width: pageWidth, align: "right" });

  doc.y = top + barH + 14;
  doc.fillColor(TEXT_BODY);

  // ── 2. Seller info (left) + Bill To (right) ────────────────────────────────
  const colGap       = 20;
  const leftColWidth = pageWidth * 0.52;
  const rightColX    = left + leftColWidth + colGap;
  const rightColW    = pageWidth - leftColWidth - colGap;
  let sellerY        = doc.y;
  const billStartY   = doc.y;

  doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_BODY)
     .text(seller.name, left, sellerY, { width: leftColWidth });
  sellerY = doc.y + 3;

  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);
  const sellerLines: string[] = [];
  if (seller.companyId) sellerLines.push(`Company ID: ${seller.companyId}`);
  sellerLines.push(...seller.addressLines);
  if (opts.showGstin) {
    sellerLines.push(seller.gstin ? `GSTIN: ${seller.gstin}` : "GSTIN: available on request");
  }
  if (seller.phone) sellerLines.push(seller.phone);
  sellerLines.push(seller.email, seller.website);
  for (const line of sellerLines) {
    doc.text(line, left, sellerY, { width: leftColWidth });
    sellerY = doc.y + 1;
  }

  // Bill To — right column, same start Y
  doc.fontSize(7).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
     .text("BILL TO", rightColX, billStartY, { width: rightColW, characterSpacing: 0.8 });
  let byY = billStartY + 13;
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor(TEXT_BODY)
     .text(addr.fullName, rightColX, byY, { width: rightColW });
  byY = doc.y + 2;
  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);
  const billLines = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country,
    input.buyerEmail
  ].filter((l): l is string => Boolean(l?.trim()));
  for (const line of billLines) {
    doc.text(line, rightColX, byY, { width: rightColW });
    byY = doc.y + 1;
  }
  if (opts.showPlaceOfSupply) {
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
       .text(`Place of Supply: ${placeOfSupply(addr.state)}`, rightColX, byY + 3, { width: rightColW });
    byY = doc.y + 1;
  }

  doc.y = Math.max(sellerY, byY) + 12;

  // ── 3. Olive accent rule ────────────────────────────────────────────────────
  doc.rect(left, doc.y, pageWidth, 1.5).fill(BRAND_OLIVE);
  doc.y += 6;

  // ── 4. Meta strip ──────────────────────────────────────────────────────────
  const invoiceDate = input.issuedAt.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
  const metaY    = doc.y;
  const third    = pageWidth / 3;
  const metaCols = [left, left + third, left + third * 2];
  const labels   = ["INVOICE DATE", "TERMS", "DUE DATE"];
  const values   = [invoiceDate, "Due on Receipt", invoiceDate];

  doc.rect(left - 6, metaY - 4, pageWidth + 12, 28).fill("#F0EFE9");
  doc.fillColor(BRAND_OLIVE).fontSize(6.5).font("Helvetica-Bold");
  labels.forEach((lbl, i) => {
    doc.text(lbl, metaCols[i] + 6, metaY, { width: third - 8, characterSpacing: 0.5 });
  });
  doc.fillColor(TEXT_BODY).fontSize(8.5).font("Helvetica-Bold");
  values.forEach((val, i) => {
    doc.text(val, metaCols[i] + 6, metaY + 12, { width: third - 8 });
  });

  doc.y = metaY + 28 + 10;
  doc.fillColor(TEXT_BODY);
}

function renderInvoiceFooter(
  doc: PdfDoc,
  input: GstInvoiceInput,
  totalMinor: number
): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left      = doc.page.margins.left;
  const code      = currencyCode(input);

  doc.moveDown(1.2);

  // Olive rule
  doc.rect(left, doc.y, pageWidth, 1).fill(BRAND_OLIVE);
  doc.y += 10;

  // Total in Words
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
     .text("TOTAL IN WORDS", left, doc.y, { characterSpacing: 0.5 });
  doc.y += 11;
  doc.fontSize(8.5).font("Helvetica-Oblique").fillColor(TEXT_BODY)
     .text(amountInCurrencyWords(totalMinor, code), left, doc.y, { width: pageWidth * 0.65 });

  // Notes
  doc.y += 14;
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
     .text("NOTES", left, doc.y, { characterSpacing: 0.5 });
  doc.y += 11;
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
     .text(
       input.isGstApplicable
         ? "Thank you for choosing Sarveda. We hope you enjoy your order."
         : "Export sale — prices are tax-inclusive for your region. Thank you for choosing Sarveda.",
       left, doc.y, { width: pageWidth * 0.65 }
     );

  // Terms
  doc.y += 16;
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
     .text("TERMS & CONDITIONS", left, doc.y, { characterSpacing: 0.5 });
  doc.y += 11;
  doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED)
     .text("Due upon receipt.", left, doc.y);

  // Authorized signature — right aligned
  const sigY     = doc.y - 30;
  const sigLineY = sigY + 28;
  const sigLineX = left + pageWidth * 0.68;
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(BRAND_OLIVE)
     .text("AUTHORIZED SIGNATORY", left, sigY,
           { width: pageWidth, align: "right", characterSpacing: 0.5 });
  doc.moveTo(sigLineX, sigLineY)
     .lineTo(left + pageWidth, sigLineY)
     .strokeColor(RULE_LIGHT).lineWidth(0.5).stroke();
  doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
     .text("for Sarveda Life Private Limited", left, sigLineY + 3,
           { width: pageWidth, align: "right" });

  // Dark footer bar
  const footerY = doc.page.height - doc.page.margins.bottom - 18;
  doc.rect(left - doc.page.margins.left, footerY - 4,
           doc.page.width, 22).fill(BRAND_DARK);
  doc.fontSize(6.5).font("Helvetica").fillColor("#9A9890")
     .text(
       `Order ${input.orderNumber}  \u00B7  ${input.buyerEmail}  \u00B7  Computer-generated invoice`,
       left, footerY + 1,
       { align: "center", width: pageWidth }
     );
}

function buildCommercialInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const code = currencyCode(input);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    renderInvoiceHeader(doc, input, "Invoice", { showGstin: false, showPlaceOfSupply: false });

    const cols = {
      num: left,
      item: left + 18,
      qty: left + 300,
      rate: left + 340,
      amt: left + 410
    };

    doc.fontSize(7).font("Helvetica-Bold");
    const headY = doc.y;
    doc.text("#", cols.num, headY);
    doc.text("Item", cols.item, headY);
    doc.text("Qty", cols.qty, headY);
    doc.text("Rate", cols.rate, headY);
    doc.text("Amount", cols.amt, headY);
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    let merchandiseSum = 0;
    let qtySum = 0;

    input.items.forEach((line, index) => {
      const y = doc.y;
      const unitMinor =
        line.qty > 0 ? Math.round(line.lineTotalInPaise / line.qty) : line.lineTotalInPaise;
      merchandiseSum += line.lineTotalInPaise;
      qtySum += line.qty;

      doc.fontSize(7).font("Helvetica");
      doc.text(String(index + 1), cols.num, y);
      doc.text(line.name, cols.item, y, { width: 260 });
      doc.text(line.qty.toFixed(2), cols.qty, y);
      doc.text(fmtMinor(unitMinor, code), cols.rate, y);
      doc.text(fmtMinor(line.lineTotalInPaise, code), cols.amt, y);
      doc.moveDown(1.1);
    });

    const summaryX = left + pageWidth * 0.52;
    const summaryValX = left + pageWidth * 0.82;
    let sy = doc.y + 8;

    const addSummaryRow = (label: string, value: string, bold = false) => {
      doc.fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica");
      doc.text(label, summaryX, sy, { width: pageWidth * 0.28, align: "right" });
      doc.text(value, summaryValX, sy, { width: pageWidth * 0.18, align: "right" });
      sy += 14;
    };

    addSummaryRow("Sub Total", fmtMinor(merchandiseSum, code));
    if (input.discountInPaise > 0) {
      addSummaryRow("Discount", `-${fmtMinor(input.discountInPaise, code)}`);
    }
    if (input.shippingInPaise > 0) {
      addSummaryRow("Shipping charge", fmtMinor(input.shippingInPaise, code));
    }
    addSummaryRow("Items in Total", qtySum.toFixed(2));
    sy += 4;
    addSummaryRow("Total", fmtTotal(input.grandTotalInPaise, code), true);
    doc.y = Math.max(doc.y, sy + 10);

    renderInvoiceFooter(doc, input, input.grandTotalInPaise);
    doc.end();
  });
}

export function buildGstInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const code      = "INR";
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left      = doc.page.margins.left;

    renderInvoiceHeader(doc, input, "Tax Invoice", { showGstin: true, showPlaceOfSupply: true });

    // ── Column layout ─────────────────────────────────────────────────────────
    // Inter-state:  #  Item  HSN  Qty  Rate  IGST%  IGST₹  Amount
    // Intra-state:  #  Item  HSN  Qty  Rate  CGST%  CGST₹  SGST%  SGST₹  Amount
    const C = input.interState
      ? {
          num:    left,
          item:   left + 16,
          hsn:    left + 198,
          qty:    left + 258,
          rate:   left + 290,
          tax:    left + 336,
          taxAmt: left + 366,
          amt:    left + 418,
        }
      : {
          num:     left,
          item:    left + 16,
          hsn:     left + 182,
          qty:     left + 238,
          rate:    left + 268,
          cgstPct: left + 308,
          cgstAmt: left + 332,
          sgstPct: left + 370,
          sgstAmt: left + 394,
          amt:     left + 436,
        };

    // ── Table header row (dark filled) ────────────────────────────────────────
    const tableHeaderY = doc.y;
    doc.rect(left - 2, tableHeaderY - 3, pageWidth + 4, 16).fill(BRAND_DARK);
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(INV_WHITE);
    doc.text("#",      C.num,           tableHeaderY, { width: 14,  align: "right" });
    doc.text("ITEM",   C.item,          tableHeaderY, { width: 160 });
    doc.text("HSN",    (C as any).hsn,  tableHeaderY, { width: 50 });
    doc.text("QTY",    (C as any).qty,  tableHeaderY, { width: 36,  align: "right" });
    doc.text("RATE",   (C as any).rate, tableHeaderY, { width: 44,  align: "right" });
    if (input.interState) {
      doc.text("IGST%",  (C as any).tax,    tableHeaderY, { width: 28, align: "right" });
      doc.text("IGST",   (C as any).taxAmt, tableHeaderY, { width: 44, align: "right" });
    } else {
      doc.text("CGST%",  (C as any).cgstPct, tableHeaderY, { width: 24, align: "right" });
      doc.text("CGST",   (C as any).cgstAmt, tableHeaderY, { width: 36, align: "right" });
      doc.text("SGST%",  (C as any).sgstPct, tableHeaderY, { width: 24, align: "right" });
      doc.text("SGST",   (C as any).sgstAmt, tableHeaderY, { width: 36, align: "right" });
    }
    doc.text("AMOUNT", (C as any).amt, tableHeaderY, { width: 60, align: "right" });
    doc.y = tableHeaderY + 16 + 2;
    doc.fillColor(TEXT_BODY);

    // ── Table rows ────────────────────────────────────────────────────────────
    const buckets = new Map<number, TaxBucket>();
    let taxableSum = 0;
    let taxSum     = 0;
    let qtySum     = 0;

    input.items.forEach((line, index) => {
      const rowY    = doc.y;
      const isAlt   = index % 2 === 1;
      const halfTax = Math.round(line.taxMinor / 2);
      const cgstAmt = input.interState ? 0 : halfTax;
      const sgstAmt = input.interState ? 0 : line.taxMinor - halfTax;
      const igstAmt = input.interState ? line.taxMinor : 0;

      const lineCount = Math.ceil(line.name.length / 28) + 1;
      const rowH      = Math.max(18, lineCount * 10 + 6);

      if (isAlt) {
        doc.rect(left - 2, rowY - 2, pageWidth + 4, rowH).fill(ROW_ALT);
      }

      const bucket = buckets.get(line.gstRatePercent)
        ?? { rate: line.gstRatePercent, cgst: 0, sgst: 0, igst: 0 };
      bucket.cgst += cgstAmt;
      bucket.sgst += sgstAmt;
      bucket.igst += igstAmt;
      buckets.set(line.gstRatePercent, bucket);

      taxableSum += line.taxableMinor;
      taxSum     += line.taxMinor;
      qtySum     += line.qty;

      const unitTaxableMinor = line.qty > 0
        ? Math.round(line.taxableMinor / line.qty)
        : line.taxableMinor;

      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_BODY);
      doc.text(String(index + 1), C.num,          rowY, { width: 14,  align: "right" });
      doc.text(line.name,         C.item,          rowY, { width: 158 });
      doc.text(line.hsn ?? "",    (C as any).hsn,  rowY, { width: 50 });
      doc.text(line.qty.toFixed(2), (C as any).qty, rowY, { width: 36, align: "right" });
      doc.text(fmtMinor(unitTaxableMinor, code), (C as any).rate, rowY, { width: 44, align: "right" });

      if (input.interState) {
        doc.text(`${line.gstRatePercent}%`,  (C as any).tax,    rowY, { width: 28, align: "right" });
        doc.text(fmtMinor(igstAmt, code),    (C as any).taxAmt, rowY, { width: 44, align: "right" });
      } else {
        doc.text(`${line.gstRatePercent / 2}%`, (C as any).cgstPct, rowY, { width: 24, align: "right" });
        doc.text(fmtMinor(cgstAmt, code),        (C as any).cgstAmt, rowY, { width: 36, align: "right" });
        doc.text(`${line.gstRatePercent / 2}%`, (C as any).sgstPct, rowY, { width: 24, align: "right" });
        doc.text(fmtMinor(sgstAmt, code),        (C as any).sgstAmt, rowY, { width: 36, align: "right" });
      }
      doc.text(fmtMinor(line.taxableMinor, code), (C as any).amt, rowY, { width: 60, align: "right" });

      doc.y = rowY + rowH;
      doc.moveTo(left, doc.y - 1)
         .lineTo(left + pageWidth, doc.y - 1)
         .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
    });

    doc.y += 6;

    // ── Summary block ─────────────────────────────────────────────────────────
    const summaryLabelX = left + pageWidth * 0.50;
    const summaryValX   = left + pageWidth * 0.80;
    const summaryW      = pageWidth * 0.28;
    const valW          = pageWidth * 0.20;
    let sy = doc.y;

    const addRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        doc.rect(left + pageWidth * 0.48, sy - 3, pageWidth * 0.52 + 2, 17).fill(BRAND_DARK);
        doc.fillColor(INV_WHITE).fontSize(8.5).font("Helvetica-Bold");
      } else {
        doc.fillColor(bold ? TEXT_BODY : TEXT_MUTED)
           .fontSize(bold ? 8 : 7.5)
           .font(bold ? "Helvetica-Bold" : "Helvetica");
      }
      doc.text(label, summaryLabelX, sy, { width: summaryW, align: "right" });
      doc.text(value, summaryValX,   sy, { width: valW,     align: "right" });
      if (!highlight) {
        doc.moveTo(summaryLabelX, sy + 12)
           .lineTo(left + pageWidth, sy + 12)
           .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
      }
      sy += 15;
      doc.fillColor(TEXT_BODY);
    };

    addRow("Sub Total",            fmtMinor(taxableSum, code));
    addRow("Total Taxable Amount", fmtMinor(taxableSum, code));

    const sortedRates = [...buckets.keys()].sort((a, b) => a - b);
    for (const rate of sortedRates) {
      const b = buckets.get(rate)!;
      if (input.interState) {
        if (b.igst > 0) addRow(`IGST (${rate}%)`, fmtMinor(b.igst, code));
      } else {
        if (b.cgst > 0) addRow(`CGST${rate / 2} (${rate / 2}%)`, fmtMinor(b.cgst, code));
        if (b.sgst > 0) addRow(`SGST${rate / 2} (${rate / 2}%)`, fmtMinor(b.sgst, code));
      }
    }

    if (input.shippingInPaise > 0) {
      addRow("Shipping charge", fmtMinor(input.shippingInPaise, code));
    }

    const computedTotal = taxableSum + taxSum + input.shippingInPaise - input.discountInPaise;
    const roundOff      = input.grandTotalInPaise - computedTotal;
    if (Math.abs(roundOff) >= 1) {
      const sign = roundOff < 0 ? "(-)" : "(+)";
      addRow(`Round Off ${sign}`, fmtMinor(Math.abs(roundOff), code));
    }

    addRow("Items in Total", qtySum.toFixed(2));
    sy += 2;
    addRow("Total", fmtTotal(input.grandTotalInPaise, code), true, true);

    doc.y = Math.max(doc.y, sy + 8);
    renderInvoiceFooter(doc, input, input.grandTotalInPaise);
    doc.end();
  });
}

export function invoiceNumberForOrder(orderNumber: string): string {
  return `INV-${orderNumber}`;
}
