import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

import { resolveCustomerWhatsApp, resolveSupportContactEmail } from "./customerContact";
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
    case "USD": return "$";
    case "GBP": return "£";
    case "INR":
    default:    return "₹";
  }
}

function fmtMinor(minor: number, currency: string): string {
  const code   = currency.trim().toUpperCase() || "INR";
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
  karnataka: "29", delhi: "07", maharashtra: "27",
  tamilnadu: "33", "tamil nadu": "33", haryana: "06",
  uttarpradesh: "09", "uttar pradesh": "09",
  westbengal: "19", "west bengal": "19", gujarat: "24",
  rajasthan: "08", punjab: "03", telangana: "36",
  andhrapradesh: "37", "andhra pradesh": "37",
  kerala: "32", madhyapradesh: "23", "madhya pradesh": "23"
};

function fiscalYearLabel(date: Date): string {
  const y     = date.getFullYear();
  const m     = date.getMonth();
  const start = m >= 3 ? y : y - 1;
  const end   = (start + 1) % 100;
  return `${String(start % 100).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

export function formatDisplayInvoiceNo(orderNumber: string, issuedAt: Date): string {
  const fy     = fiscalYearLabel(issuedAt);
  const digits = orderNumber.replace(/\D/g, "");
  const seq    = digits.slice(-5).padStart(5, "0");
  return `INV/${fy}/${seq}`;
}

function placeOfSupply(state: string): string {
  const key   = state.trim().toLowerCase();
  const code  = STATE_GST_CODES[key];
  const label = state.trim() || "India";
  return code ? `${label} (${code})` : label;
}

function sellerBlock(): {
  name: string; companyId: string; addressLines: string[];
  gstin: string; phone: string; email: string; website: string;
} {
  const address = process.env.SELLER_ADDRESS?.trim() ||
    "Plot No. B, Part 2, RASUDHI WAREHOUSE\nKIADB Industrial Housing Layout, Hebbal 2nd stage\nMysore Karnataka 570016\nIndia";
  const wa = resolveCustomerWhatsApp();
  return {
    name:         process.env.SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited",
    companyId:    "",
    addressLines: address.split(/\n+/).map((l) => l.trim()).filter(Boolean),
    gstin:        process.env.SELLER_GSTIN?.trim()      || "29ABFCS0538N1ZV",
    phone:        wa?.raw || process.env.SELLER_PHONE?.trim() || "",
    email:        resolveSupportContactEmail(),
    website:      process.env.SELLER_WEBSITE?.trim()    || "www.sarveda.com"
  };
}

type TaxBucket = { rate: number; cgst: number; sgst: number; igst: number };

export function buildOrderInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return input.isGstApplicable ? buildGstInvoicePdf(input) : buildCommercialInvoicePdf(input);
}

type PdfDoc = InstanceType<typeof PDFDocument>;

// ── Palette ──────────────────────────────────────────────────────────────────
const BRAND_DARK  = "#1C1C1C";
const BRAND_OLIVE = "#4A5E3A";
const ROW_ALT     = "#F7F6F3";
const RULE_LIGHT  = "#D8D6D0";
const TEXT_MUTED  = "#7A7870";
const TEXT_BODY   = "#1A1A18";
const INV_WHITE   = "#FFFFFF";

function resolveInvoiceLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../assets/labels/sarveda-logo-with-name.png"),
    path.join(process.cwd(), "assets/labels/sarveda-logo-with-name.png"),
    path.join(process.cwd(), "backend/assets/labels/sarveda-logo-with-name.png")
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return file;
    } catch {
      /* try next */
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// renderInvoiceHeader
// ─────────────────────────────────────────────────────────────────────────────
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
  const leftColW         = pageWidth * 0.52;
  const rightColX        = left + leftColW + 18;
  const rightColW        = pageWidth - leftColW - 18;

  // ── 1. Brand logo (left) + invoice title (right) ───────────────────────────
  const logoPath = resolveInvoiceLogoPath();
  const logoH = 28;
  const logoW = Math.round(logoH * (933 / 313));
  let sellerTextTop = top;
  if (logoPath) {
    try {
      doc.image(logoPath, left, top, { width: logoW, height: logoH });
      sellerTextTop = top + logoH + 8;
    } catch {
      doc.fontSize(13).font("Helvetica-Bold").fillColor(TEXT_BODY)
         .text(seller.name, left, top, { width: leftColW });
      sellerTextTop = top + 18;
    }
  } else {
    doc.fontSize(13).font("Helvetica-Bold").fillColor(TEXT_BODY)
       .text(seller.name, left, top, { width: leftColW });
    sellerTextTop = top + 18;
  }

  doc.fontSize(24).font("Helvetica-Bold").fillColor(TEXT_BODY)
     .text(title, left, top - 4, { width: pageWidth, align: "right" });

  // ── 2. Seller details ──────────────────────────────────────────────────────
  let sy = sellerTextTop;
  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);

  // Legal name under logo when logo is present
  if (logoPath) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_BODY)
       .text(seller.name, left, sy, { width: leftColW });
    sy = doc.y + 2;
    doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);
  }

  for (const line of seller.addressLines) {
    doc.text(line, left, sy, { width: leftColW });
    sy = doc.y + 1;
  }
  if (opts.showGstin && seller.gstin) {
    doc.text(`GSTIN: ${seller.gstin}`, left, sy, { width: leftColW });
    sy = doc.y + 1;
  }
  if (seller.phone) {
    doc.text(seller.phone, left, sy, { width: leftColW });
    sy = doc.y + 1;
  }
  doc.text(seller.email,   left, sy, { width: leftColW }); sy = doc.y + 1;
  doc.text(seller.website, left, sy, { width: leftColW }); sy = doc.y + 1;

  // ── 3. Invoice# below title ────────────────────────────────────────────────
  doc.fontSize(9).font("Helvetica").fillColor(TEXT_MUTED)
     .text(`Invoice# ${displayInvoiceNo}`, left, top + 28, { width: pageWidth, align: "right" });

  // ── 4. Bill To (right column) ──────────────────────────────────────────────
  const billStartY = Math.max(top + 48, sellerTextTop);
  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED)
     .text("Bill To", rightColX, billStartY, { width: rightColW });
  let byY = billStartY + 12;
  doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_BODY)
     .text(addr.fullName, rightColX, byY, { width: rightColW });
  byY = doc.y + 3;
  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED);
  const billLines = [
    addr.line1, addr.line2,
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country, input.buyerEmail
  ].filter((l): l is string => Boolean(l?.trim()));
  for (const line of billLines) {
    doc.text(line, rightColX, byY, { width: rightColW });
    byY = doc.y + 1;
  }
  if (opts.showPlaceOfSupply) {
    byY += 4;
    doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED)
       .text(`Place Of Supply: ${placeOfSupply(addr.state)}`, rightColX, byY, { width: rightColW });
    byY = doc.y + 1;
  }

  doc.y = Math.max(sy, byY) + 14;

  // ── 5. Invoice date strip (no Terms, no Due Date) ──────────────────────────
  const stripY = doc.y;
  doc.rect(left - doc.page.margins.left, stripY - 3, doc.page.width, 26).fill("#EEECE6");
  doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
     .text("Invoice Date", left + 6, stripY + 1, { width: 120 });
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor(TEXT_BODY)
     .text(
       input.issuedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
       left + 6, stripY + 11, { width: 120 }
     );

  doc.y = stripY + 26 + 12;
  doc.fillColor(TEXT_BODY);
}

// ─────────────────────────────────────────────────────────────────────────────
// renderInvoiceFooter
// ─────────────────────────────────────────────────────────────────────────────
function renderInvoiceFooter(
  doc: PdfDoc,
  input: GstInvoiceInput,
  totalMinor: number
): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left      = doc.page.margins.left;
  const code      = currencyCode(input);

  doc.moveDown(1.2);

  // Thin olive rule
  doc.rect(left, doc.y, pageWidth, 0.75).fill(BRAND_OLIVE);
  doc.y += 12;

  // Two-column footer: Total in Words (left) | digital invoice note (right)
  const footLeftW  = pageWidth * 0.60;
  const footRightX = left + footLeftW + 16;
  const footRightW = pageWidth - footLeftW - 16;
  const footStartY = doc.y;

  // Left: Total in Words + Notes
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(TEXT_MUTED)
     .text("Total In Words:", left, footStartY, { width: footLeftW });
  doc.y += 11;
  doc.fontSize(8.5).font("Helvetica-Oblique").fillColor(TEXT_BODY)
     .text(amountInCurrencyWords(totalMinor, code), left, doc.y, { width: footLeftW });

  // Right: digital invoice note (no wet-ink signature required)
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor(TEXT_MUTED)
     .text("Digital Invoice", footRightX, footStartY, { width: footRightW, align: "center" });
  doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_BODY)
     .text(
       "This is a computer-generated invoice and does not require an authorized signature.",
       footRightX,
       footStartY + 14,
       { width: footRightW, align: "center" }
     );
  doc.fontSize(7).font("Helvetica").fillColor(TEXT_MUTED)
     .text("for Sarveda Life Private Limited", footRightX, footStartY + 48,
           { width: footRightW, align: "center" });

  // Page footer
  doc.fontSize(6.5).font("Helvetica").fillColor(RULE_LIGHT)
     .text(
       `Order ${input.orderNumber}  ·  ${input.buyerEmail}  ·  Computer-generated invoice`,
       left,
       doc.page.height - doc.page.margins.bottom - 12,
       { align: "center", width: pageWidth }
     );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildGstInvoicePdf
// ─────────────────────────────────────────────────────────────────────────────
export function buildGstInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data",  (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const code      = "INR";
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left      = doc.page.margins.left;

    renderInvoiceHeader(doc, input, "Tax Invoice", { showGstin: true, showPlaceOfSupply: true });

    // ── Column layout ─────────────────────────────────────────────────────────
    const C = input.interState
      ? { num: left, item: left+16, hsn: left+200, qty: left+264, rate: left+298,
          taxPct: left+344, taxAmt: left+372, amt: left+430 }
      : { num: left, item: left+16, hsn: left+185, qty: left+242, rate: left+274,
          cgstPct: left+314, cgstAmt: left+338, sgstPct: left+376, sgstAmt: left+400, amt: left+440 };

    // ── Table header ──────────────────────────────────────────────────────────
    const thY = doc.y;
    doc.rect(left - 2, thY - 3, pageWidth + 4, 17).fill(BRAND_DARK);
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(INV_WHITE);
    doc.text("#",      C.num,            thY, { width: 14,  align: "right" });
    doc.text("Item",   C.item,           thY, { width: 155 });
    doc.text("HSN/SAC",(C as any).hsn,   thY, { width: 58 });
    doc.text("Qty",    (C as any).qty,   thY, { width: 34,  align: "right" });
    doc.text("Rate",   (C as any).rate,  thY, { width: 46,  align: "right" });
    if (input.interState) {
      doc.text("IGST%", (C as any).taxPct, thY, { width: 28, align: "right" });
      doc.text("IGST",  (C as any).taxAmt, thY, { width: 50, align: "right" });
    } else {
      doc.text("CGST%", (C as any).cgstPct, thY, { width: 24, align: "right" });
      doc.text("CGST",  (C as any).cgstAmt, thY, { width: 38, align: "right" });
      doc.text("SGST%", (C as any).sgstPct, thY, { width: 24, align: "right" });
      doc.text("SGST",  (C as any).sgstAmt, thY, { width: 38, align: "right" });
    }
    doc.text("Amount", (C as any).amt,   thY, { width: 58, align: "right" });
    doc.y = thY + 17 + 2;
    doc.fillColor(TEXT_BODY);

    // ── Rows ──────────────────────────────────────────────────────────────────
    const buckets = new Map<number, TaxBucket>();
    let taxableSum = 0, taxSum = 0, qtySum = 0;

    input.items.forEach((line, idx) => {
      const rowY    = doc.y;
      const halfTax = Math.round(line.taxMinor / 2);
      const cgstAmt = input.interState ? 0 : halfTax;
      const sgstAmt = input.interState ? 0 : line.taxMinor - halfTax;
      const igstAmt = input.interState ? line.taxMinor : 0;

      const bucket = buckets.get(line.gstRatePercent) ?? { rate: line.gstRatePercent, cgst: 0, sgst: 0, igst: 0 };
      bucket.cgst += cgstAmt; bucket.sgst += sgstAmt; bucket.igst += igstAmt;
      buckets.set(line.gstRatePercent, bucket);

      taxableSum += line.taxableMinor;
      taxSum     += line.taxMinor;
      qtySum     += line.qty;

      const lineCount = Math.ceil(line.name.length / 26) + 1;
      const rowH      = Math.max(20, lineCount * 10 + 6);

      if (idx % 2 === 1) doc.rect(left - 2, rowY - 2, pageWidth + 4, rowH).fill(ROW_ALT);

      const unitTax = line.qty > 0 ? Math.round(line.taxableMinor / line.qty) : line.taxableMinor;

      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_BODY);
      doc.text(String(idx + 1),          C.num,           rowY, { width: 14, align: "right" });
      doc.text(line.name,                C.item,          rowY, { width: 155 });
      doc.text(line.hsn ?? "",           (C as any).hsn,  rowY, { width: 58 });
      doc.text(line.qty.toFixed(2),      (C as any).qty,  rowY, { width: 34, align: "right" });
      doc.text(fmtMinor(unitTax, code),  (C as any).rate, rowY, { width: 46, align: "right" });

      if (input.interState) {
        doc.text(`${line.gstRatePercent}%`,  (C as any).taxPct, rowY, { width: 28, align: "right" });
        doc.text(fmtMinor(igstAmt, code),    (C as any).taxAmt, rowY, { width: 50, align: "right" });
      } else {
        doc.text(`${line.gstRatePercent/2}%`, (C as any).cgstPct, rowY, { width: 24, align: "right" });
        doc.text(fmtMinor(cgstAmt, code),     (C as any).cgstAmt, rowY, { width: 38, align: "right" });
        doc.text(`${line.gstRatePercent/2}%`, (C as any).sgstPct, rowY, { width: 24, align: "right" });
        doc.text(fmtMinor(sgstAmt, code),     (C as any).sgstAmt, rowY, { width: 38, align: "right" });
      }
      doc.text(fmtMinor(line.taxableMinor, code), (C as any).amt, rowY, { width: 58, align: "right" });

      doc.y = rowY + rowH;
      doc.moveTo(left, doc.y - 1).lineTo(left + pageWidth, doc.y - 1)
         .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
    });

    doc.y += 8;

    // ── Summary ───────────────────────────────────────────────────────────────
    const sLabelX = left + pageWidth * 0.50;
    const sValX   = left + pageWidth * 0.80;
    const sLabelW = pageWidth * 0.28;
    const sValW   = pageWidth * 0.20;
    let sy = doc.y;

    // "Items in Total" shown left-aligned, same row as Sub Total
    doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED)
       .text(`Items in Total  ${qtySum.toFixed(2)}`, left, sy, { width: pageWidth * 0.40 });

    const addRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        doc.rect(left + pageWidth * 0.47, sy - 3, pageWidth * 0.53 + 2, 18).fill(BRAND_DARK);
        doc.fillColor(INV_WHITE).fontSize(9).font("Helvetica-Bold");
      } else {
        doc.fillColor(bold ? TEXT_BODY : TEXT_MUTED)
           .fontSize(bold ? 8 : 7.5)
           .font(bold ? "Helvetica-Bold" : "Helvetica");
      }
      doc.text(label, sLabelX, sy, { width: sLabelW, align: "right" });
      doc.text(value, sValX,   sy, { width: sValW,   align: "right" });
      if (!highlight) {
        doc.moveTo(sLabelX, sy + 13).lineTo(left + pageWidth, sy + 13)
           .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
      }
      sy += 16;
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
        if (b.cgst > 0) addRow(`CGST${rate/2} (${rate/2}%)`, fmtMinor(b.cgst, code));
        if (b.sgst > 0) addRow(`SGST${rate/2} (${rate/2}%)`, fmtMinor(b.sgst, code));
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
    sy += 2;
    addRow("Total", fmtTotal(input.grandTotalInPaise, code), true, true);

    doc.y = Math.max(doc.y, sy + 8);
    renderInvoiceFooter(doc, input, input.grandTotalInPaise);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// buildCommercialInvoicePdf  (international — unchanged logic, updated style)
// ─────────────────────────────────────────────────────────────────────────────
function buildCommercialInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const code      = currencyCode(input);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left      = doc.page.margins.left;

    renderInvoiceHeader(doc, input, "Invoice", { showGstin: false, showPlaceOfSupply: false });

    const cols = { num: left, item: left+18, qty: left+300, rate: left+340, amt: left+410 };

    const thY = doc.y;
    doc.rect(left - 2, thY - 3, pageWidth + 4, 17).fill(BRAND_DARK);
    doc.fontSize(6.5).font("Helvetica-Bold").fillColor(INV_WHITE);
    doc.text("#",      cols.num,  thY, { width: 14 });
    doc.text("Item",   cols.item, thY, { width: 260 });
    doc.text("Qty",    cols.qty,  thY, { width: 36, align: "right" });
    doc.text("Rate",   cols.rate, thY, { width: 56, align: "right" });
    doc.text("Amount", cols.amt,  thY, { width: 60, align: "right" });
    doc.y = thY + 17 + 2;
    doc.fillColor(TEXT_BODY);

    let merchandiseSum = 0, qtySum = 0;
    input.items.forEach((line, idx) => {
      const rowY   = doc.y;
      const rowH   = Math.max(18, Math.ceil(line.name.length / 36) * 10 + 6);
      const unitMn = line.qty > 0 ? Math.round(line.lineTotalInPaise / line.qty) : line.lineTotalInPaise;
      merchandiseSum += line.lineTotalInPaise;
      qtySum         += line.qty;

      if (idx % 2 === 1) doc.rect(left - 2, rowY - 2, pageWidth + 4, rowH).fill(ROW_ALT);

      doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_BODY);
      doc.text(String(idx + 1),                      cols.num,  rowY, { width: 14 });
      doc.text(line.name,                            cols.item, rowY, { width: 260 });
      doc.text(line.qty.toFixed(2),                  cols.qty,  rowY, { width: 36, align: "right" });
      doc.text(fmtMinor(unitMn, code),               cols.rate, rowY, { width: 56, align: "right" });
      doc.text(fmtMinor(line.lineTotalInPaise, code), cols.amt, rowY, { width: 60, align: "right" });
      doc.y = rowY + rowH;
      doc.moveTo(left, doc.y - 1).lineTo(left + pageWidth, doc.y - 1)
         .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
    });

    doc.y += 8;
    const sLabelX = left + pageWidth * 0.50;
    const sValX   = left + pageWidth * 0.80;
    const sLabelW = pageWidth * 0.28;
    const sValW   = pageWidth * 0.20;
    let sy = doc.y;

    doc.fontSize(7.5).font("Helvetica").fillColor(TEXT_MUTED)
       .text(`Items in Total  ${qtySum.toFixed(2)}`, left, sy, { width: pageWidth * 0.40 });

    const addRow = (label: string, value: string, bold = false, highlight = false) => {
      if (highlight) {
        doc.rect(left + pageWidth * 0.47, sy - 3, pageWidth * 0.53 + 2, 18).fill(BRAND_DARK);
        doc.fillColor(INV_WHITE).fontSize(9).font("Helvetica-Bold");
      } else {
        doc.fillColor(bold ? TEXT_BODY : TEXT_MUTED).fontSize(bold ? 8 : 7.5)
           .font(bold ? "Helvetica-Bold" : "Helvetica");
      }
      doc.text(label, sLabelX, sy, { width: sLabelW, align: "right" });
      doc.text(value, sValX,   sy, { width: sValW,   align: "right" });
      if (!highlight) {
        doc.moveTo(sLabelX, sy + 13).lineTo(left + pageWidth, sy + 13)
           .strokeColor(RULE_LIGHT).lineWidth(0.3).stroke();
      }
      sy += 16;
      doc.fillColor(TEXT_BODY);
    };

    addRow("Sub Total", fmtMinor(merchandiseSum, code));
    if (input.discountInPaise > 0) addRow("Discount", `-${fmtMinor(input.discountInPaise, code)}`);
    if (input.shippingInPaise > 0) addRow("Shipping charge", fmtMinor(input.shippingInPaise, code));
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
