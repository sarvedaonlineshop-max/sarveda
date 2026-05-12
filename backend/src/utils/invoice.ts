import PDFDocument from "pdfkit";

type InvoiceLine = {
  name: string;
  sku: string;
  qty: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
};

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

export type GstInvoiceInput = {
  invoiceNo: string;
  orderNumber: string;
  issuedAt: Date;
  buyerEmail: string;
  shippingAddress: InvoiceAddress;
  items: InvoiceLine[];
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
};

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildGstInvoicePdf(input: GstInvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const sellerGstin = process.env.SELLER_GSTIN ?? "GSTIN on request";
    const sellerName = process.env.SELLER_LEGAL_NAME ?? "Sarveda";
    const sellerAddress = process.env.SELLER_ADDRESS ?? "India";

    doc.fontSize(18).text("Tax Invoice", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Invoice No: ${input.invoiceNo}`);
    doc.text(`Order No: ${input.orderNumber}`);
    doc.text(`Date: ${input.issuedAt.toLocaleDateString("en-IN")}`);
    doc.moveDown();

    doc.fontSize(11).text("Sold by", { underline: true });
    doc.fontSize(10).text(sellerName);
    doc.text(sellerAddress);
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

    doc.fontSize(11).text("Items", { underline: true });
    doc.moveDown(0.5);
    input.items.forEach((line) => {
      doc
        .fontSize(10)
        .text(
          `${line.name} (${line.sku}) x ${line.qty} — ${formatInr(line.lineTotalInPaise)}`,
          { width: 500 }
        );
    });
    doc.moveDown();

    const taxable = input.grandTotalInPaise;
    const gst = input.taxInPaise > 0 ? input.taxInPaise : Math.round((taxable * 18) / 118);
    const taxableValue = taxable - gst;
    const halfGst = Math.round(gst / 2);

    doc.fontSize(10).text(`Taxable value: ${formatInr(taxableValue)}`);
    doc.text(`CGST (9%): ${formatInr(halfGst)}`);
    doc.text(`SGST (9%): ${formatInr(halfGst)}`);
    if (input.discountInPaise > 0) {
      doc.text(`Discount: -${formatInr(input.discountInPaise)}`);
    }
    if (input.shippingInPaise > 0) {
      doc.text(`Shipping: ${formatInr(input.shippingInPaise)}`);
    }
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Grand total (GST inclusive): ${formatInr(input.grandTotalInPaise)}`, {
      underline: true
    });
    doc.moveDown();
    doc.fontSize(9).fillColor("#444444").text("Prices are inclusive of GST where applicable.");
    doc.end();
  });
}

export function invoiceNumberForOrder(orderNumber: string): string {
  return `INV-${orderNumber}`;
}
