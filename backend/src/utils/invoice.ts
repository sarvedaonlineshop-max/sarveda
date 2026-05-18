import PDFDocument from "pdfkit";

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
};

function formatMoney(minor: number, currency: string): string {
  const c = currency.toUpperCase();
  const major = minor / 100;
  if (c === "INR") {
    return `₹${major.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(major);
  } catch {
    return `${c} ${major.toFixed(2)}`;
  }
}

export function buildGstInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const sellerGstin = process.env.SELLER_GSTIN?.trim() || "GSTIN on request";
    const sellerName = process.env.SELLER_LEGAL_NAME?.trim() || "Sarveda";
    const sellerAddress = process.env.SELLER_ADDRESS?.trim() || "India";
    const sellerState = process.env.SELLER_STATE?.trim() || "Karnataka";
    const fmt = (n: number) => formatMoney(n, input.currency);

    doc.fontSize(18).text("Tax Invoice", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Invoice No: ${input.invoiceNo}`);
    doc.text(`Order No: ${input.orderNumber}`);
    doc.text(`Date: ${input.issuedAt.toLocaleDateString("en-IN")}`);
    doc.text(`Currency: ${input.currency}`);
    doc.moveDown();

    doc.fontSize(11).text("Sold by", { underline: true });
    doc.fontSize(10).text(sellerName);
    doc.text(sellerAddress);
    doc.text(`State: ${sellerState}`);
    doc.text(`GSTIN: ${sellerGstin}`);
    doc.moveDown();

    doc.fontSize(11).text("Bill to / Ship to", { underline: true });
    doc.fontSize(10).text(input.shippingAddress.fullName);
    doc.text(input.shippingAddress.line1);
    if (input.shippingAddress.line2) doc.text(input.shippingAddress.line2);
    doc.text(
      `${input.shippingAddress.city}, ${input.shippingAddress.state} ${input.shippingAddress.postalCode}`
    );
    doc.text(input.shippingAddress.country);
    doc.text(`Phone: ${input.shippingAddress.phone}`);
    doc.text(`Email: ${input.buyerEmail}`);
    doc.moveDown();

    doc.fontSize(9);
    doc.text("Item", 48, doc.y, { continued: false, width: 200 });
    const tableTop = doc.y + 4;
    doc.text("HSN", 250, tableTop - 14, { width: 40 });
    doc.text("Qty", 295, tableTop - 14, { width: 30 });
    doc.text("Rate", 330, tableTop - 14, { width: 55 });
    doc.text("Taxable", 390, tableTop - 14, { width: 55 });
    doc.text("GST", 450, tableTop - 14, { width: 45 });
    doc.text("Total", 500, tableTop - 14, { width: 55 });
    doc.moveDown(0.5);

    let taxableSum = 0;
    let taxSum = 0;

    input.items.forEach((line) => {
      const y = doc.y;
      doc.fontSize(9).text(`${line.name} (${line.sku})`, 48, y, { width: 195 });
      doc.text(line.hsn, 250, y, { width: 40 });
      doc.text(String(line.qty), 295, y, { width: 30 });
      doc.text(fmt(line.unitPriceInPaise), 330, y, { width: 55 });
      doc.text(fmt(line.taxableMinor), 390, y, { width: 55 });
      doc.text(`${line.gstRatePercent}%`, 450, y, { width: 45 });
      doc.text(fmt(line.lineTotalInPaise), 500, y, { width: 55 });
      taxableSum += line.taxableMinor;
      taxSum += line.taxMinor;
      doc.moveDown(0.8);
    });

    doc.moveDown();
    if (input.shippingInPaise > 0) {
      doc.fontSize(10).text(`Shipping: ${fmt(input.shippingInPaise)}`);
    }
    if (input.discountInPaise > 0) {
      doc.text(`Discount: -${fmt(input.discountInPaise)}`);
    }

    doc.moveDown(0.5);
    doc.fontSize(10).text(`Taxable value: ${fmt(taxableSum)}`);

    const totalGst = input.taxInPaise > 0 ? input.taxInPaise : taxSum;
    if (input.interState) {
      doc.text(`IGST: ${fmt(totalGst)}`);
    } else {
      const half = Math.round(totalGst / 2);
      doc.text(`CGST: ${fmt(half)}`);
      doc.text(`SGST: ${fmt(half)}`);
    }

    doc.moveDown(0.5);
    doc.fontSize(12).text(`Grand total (tax inclusive): ${fmt(input.grandTotalInPaise)}`, {
      underline: true
    });
    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor("#444444")
      .text(
        "Prices are inclusive of GST where applicable. This is a computer-generated invoice and does not require a physical signature."
      );
    doc.end();
  });
}

export function invoiceNumberForOrder(orderNumber: string): string {
  return `INV-${orderNumber}`;
}
