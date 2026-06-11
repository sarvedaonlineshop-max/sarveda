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

function renderInvoiceHeader(
  doc: PdfDoc,
  input: GstInvoiceInput,
  title: string,
  opts: { showGstin: boolean; showPlaceOfSupply: boolean }
): void {
  const seller = sellerBlock();
  const displayInvoiceNo = formatDisplayInvoiceNo(input.orderNumber, input.issuedAt);
  const addr = input.shippingAddress;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  const colGap = 16;
  const leftColWidth = pageWidth * 0.52;
  const rightColX = left + leftColWidth + colGap;
  const rightColWidth = pageWidth - leftColWidth - colGap;

  let sellerY = top;
  doc.fontSize(11).font("Helvetica-Bold").text(seller.name, left, sellerY, { width: leftColWidth });
  sellerY = doc.y + 2;
  doc.font("Helvetica").fontSize(8);
  const sellerLines: string[] = [];
  if (seller.companyId) sellerLines.push(`Company ID : ${seller.companyId}`);
  sellerLines.push(...seller.addressLines);
  if (opts.showGstin) {
    if (seller.gstin) sellerLines.push(`GSTIN ${seller.gstin}`);
    else sellerLines.push("GSTIN — available on request");
  }
  if (seller.phone) sellerLines.push(seller.phone);
  sellerLines.push(seller.email);
  sellerLines.push(seller.website);
  for (const line of sellerLines) {
    doc.text(line, left, sellerY, { width: leftColWidth });
    sellerY = doc.y + 1;
  }

  doc.fontSize(16).font("Helvetica-Bold").text(title, rightColX, top, {
    width: rightColWidth,
    align: "right"
  });
  doc.fontSize(9).font("Helvetica").text(`Invoice# ${displayInvoiceNo}`, rightColX, doc.y + 4, {
    width: rightColWidth,
    align: "right"
  });

  doc.y = Math.max(sellerY, doc.y) + 14;
  doc.x = left;
  doc.fontSize(9).font("Helvetica-Bold").text("Bill To");
  doc.font("Helvetica");
  const billLines = [
    addr.fullName,
    addr.line1,
    addr.line2,
    `${addr.city}, ${addr.state} ${addr.postalCode}`,
    addr.country,
    input.buyerEmail
  ].filter((line): line is string => Boolean(line && String(line).trim()));
  for (const line of billLines) {
    doc.text(line, { width: leftColWidth });
  }
  if (opts.showPlaceOfSupply) {
    doc.text(`Place Of Supply: ${placeOfSupply(addr.state)}`, { width: leftColWidth });
  }
  doc.moveDown(0.6);

  const invoiceDate = input.issuedAt.toLocaleDateString("en-GB");
  const metaY = doc.y;
  doc.fontSize(8);
  doc.text("Invoice Date", left, metaY);
  doc.text("Terms", left + pageWidth * 0.35, metaY);
  doc.text("Due Date", left + pageWidth * 0.65, metaY);
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text(invoiceDate, left, metaY + 12);
  doc.text("Due on Receipt", left + pageWidth * 0.35, metaY + 12);
  doc.text(invoiceDate, left + pageWidth * 0.65, metaY + 12);
  doc.moveDown(2);
}

function renderInvoiceFooter(
  doc: PdfDoc,
  input: GstInvoiceInput,
  totalMinor: number
): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const code = currencyCode(input);

  doc.moveDown(1);
  doc.fontSize(8).font("Helvetica-Bold").text("Total In Words:");
  doc.font("Helvetica").text(amountInCurrencyWords(totalMinor, code), { width: pageWidth });
  doc.moveDown(0.8);

  doc.fontSize(8).font("Helvetica-Bold").text("Notes");
  doc.font("Helvetica").text(
    input.isGstApplicable ? "Thank you for your business." : "Export sale — prices are tax-inclusive for your region. Thank you for your business."
  );

  const bankName = process.env.SELLER_BANK_NAME?.trim();
  const bankAccount = process.env.SELLER_BANK_ACCOUNT?.trim();
  if (bankName && bankAccount) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").text("Bank Details:");
    doc.font("Helvetica");
    if (process.env.SELLER_BANK_ACCOUNT_NAME?.trim()) {
      doc.text(`Account Name: ${process.env.SELLER_BANK_ACCOUNT_NAME.trim()}`);
    }
    doc.text(`Account Number: ${bankAccount}`);
    doc.text(`Bank: ${bankName}`);
    if (process.env.SELLER_BANK_IFSC?.trim()) doc.text(`IFSC Code: ${process.env.SELLER_BANK_IFSC.trim()}`);
    if (process.env.SELLER_BANK_ACCOUNT_TYPE?.trim()) {
      doc.text(`Account Type: ${process.env.SELLER_BANK_ACCOUNT_TYPE.trim()}`);
    }
  }

  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").text("Terms & Conditions");
  doc.font("Helvetica").text("Due upon receipt");
  doc.moveDown(1.2);
  doc.text("Authorized Signature", { align: "right", width: pageWidth });

  doc
    .fontSize(7)
    .fillColor("#666666")
    .text(
      `Order ${input.orderNumber} · ${input.buyerEmail} · Computer-generated invoice.`,
      left,
      doc.page.height - doc.page.margins.bottom - 14,
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
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const code = "INR";
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    renderInvoiceHeader(doc, input, "Tax Invoice", { showGstin: true, showPlaceOfSupply: true });

    const cols = input.interState
      ? { num: left, item: left + 18, qty: left + 248, rate: left + 278, tax: left + 338, taxAmt: left + 378, amt: left + 438 }
      : { num: left, item: left + 18, qty: left + 228, rate: left + 258, cgst: left + 308, sgst: left + 358, cgstAmt: left + 388, sgstAmt: left + 418, amt: left + 458 };

    doc.fontSize(7).font("Helvetica-Bold");
    const headY = doc.y;
    doc.text("#", cols.num, headY);
    doc.text("Item", cols.item, headY);
    doc.text("Qty", cols.qty, headY);
    doc.text("Rate", cols.rate, headY);
    if (input.interState) {
      doc.text("IGST", cols.tax, headY);
      doc.text("", cols.taxAmt, headY);
    } else {
      doc.text("CGST", cols.cgst, headY);
      doc.text("SGST", cols.sgst, headY);
    }
    doc.text("Amount", cols.amt ?? left + 438, headY);
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);

    const buckets = new Map<number, TaxBucket>();
    let taxableSum = 0;
    let taxSum = 0;
    let qtySum = 0;

    input.items.forEach((line, index) => {
      const y = doc.y;
      const halfTax = Math.round(line.taxMinor / 2);
      const cgstAmt = input.interState ? 0 : halfTax;
      const sgstAmt = input.interState ? 0 : line.taxMinor - halfTax;
      const igstAmt = input.interState ? line.taxMinor : 0;

      const bucket = buckets.get(line.gstRatePercent) ?? { rate: line.gstRatePercent, cgst: 0, sgst: 0, igst: 0 };
      bucket.cgst += cgstAmt;
      bucket.sgst += sgstAmt;
      bucket.igst += igstAmt;
      buckets.set(line.gstRatePercent, bucket);

      taxableSum += line.taxableMinor;
      taxSum += line.taxMinor;
      qtySum += line.qty;

      doc.fontSize(7).font("Helvetica");
      const unitTaxableMinor =
        line.qty > 0 ? Math.round(line.taxableMinor / line.qty) : line.taxableMinor;

      doc.text(String(index + 1), cols.num, y);
      doc.text(line.name, cols.item, y, { width: 200 });
      doc.text(line.qty.toFixed(2), cols.qty, y);
      doc.text(fmtMinor(unitTaxableMinor, code), cols.rate, y);
      if (input.interState) {
        doc.text(`${line.gstRatePercent}%`, cols.tax, y);
        doc.text(fmtMinor(igstAmt, code), cols.taxAmt, y);
      } else {
        doc.text(`${line.gstRatePercent}%`, cols.cgst, y);
        doc.text(fmtMinor(cgstAmt, code), cols.cgstAmt, y);
        doc.text(`${line.gstRatePercent}%`, cols.sgst, y);
        doc.text(fmtMinor(sgstAmt, code), cols.sgstAmt, y);
      }
      doc.text(fmtMinor(line.taxableMinor, code), cols.amt ?? left + 438, y);
      doc.moveDown(1.1);
    });

    doc.moveDown(0.5);
    const summaryX = left + pageWidth * 0.52;
    const summaryValX = left + pageWidth * 0.82;
    let sy = doc.y;

    const addSummaryRow = (label: string, value: string, bold = false) => {
      doc.fontSize(8).font(bold ? "Helvetica-Bold" : "Helvetica");
      doc.text(label, summaryX, sy, { width: pageWidth * 0.28, align: "right" });
      doc.text(value, summaryValX, sy, { width: pageWidth * 0.18, align: "right" });
      sy += 14;
    };

    addSummaryRow("Sub Total", fmtMinor(taxableSum, code));
    addSummaryRow("Total Taxable Amount", fmtMinor(taxableSum, code));

    const sortedRates = [...buckets.keys()].sort((a, b) => a - b);
    for (const rate of sortedRates) {
      const b = buckets.get(rate)!;
      if (input.interState) {
        if (b.igst > 0) addSummaryRow(`IGST (${rate}%)`, fmtMinor(b.igst, code));
      } else {
        if (b.cgst > 0) addSummaryRow(`CGST (${rate}%)`, fmtMinor(b.cgst, code));
        if (b.sgst > 0) addSummaryRow(`SGST (${rate}%)`, fmtMinor(b.sgst, code));
      }
    }

    if (input.shippingInPaise > 0) {
      addSummaryRow("Shipping charge", fmtMinor(input.shippingInPaise, code));
    }

    const computedTotal = taxableSum + taxSum + input.shippingInPaise - input.discountInPaise;
    const roundOff = input.grandTotalInPaise - computedTotal;
    if (Math.abs(roundOff) >= 1) {
      const sign = roundOff < 0 ? "(-)" : "(+)";
      addSummaryRow(`Round Off ${sign}`, fmtMinor(Math.abs(roundOff), code));
    }

    addSummaryRow("Items in Total", qtySum.toFixed(2));
    doc.moveDown(0.3);
    sy += 4;
    addSummaryRow("Total", fmtTotal(input.grandTotalInPaise, code), true);

    doc.y = Math.max(doc.y, sy + 10);
    renderInvoiceFooter(doc, input, input.grandTotalInPaise);
    doc.end();
  });
}

export function invoiceNumberForOrder(orderNumber: string): string {
  return `INV-${orderNumber}`;
}
