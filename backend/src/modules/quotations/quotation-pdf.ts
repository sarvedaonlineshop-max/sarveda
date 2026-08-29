import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

type Addr = {
  fullName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type QuotationPdfLine = {
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPriceInPaise: number;
  discountInPaise: number;
  lineTotalInPaise: number;
  taxRatePercent: number;
};

export type QuotationPdfInput = {
  documentKind: "QUOTATION" | "PROFORMA";
  quoteNumber: string;
  issuedAt: Date;
  validUntil: Date | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  buyerGstin: string | null;
  billingAddress: Addr;
  shippingAddress: Addr;
  currency: string;
  items: QuotationPdfLine[];
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  taxPreviewMode: string | null;
  grandTotalInPaise: number;
  terms: string | null;
  notes: string | null;
};

const TEXT_BODY = "#1A1A18";
const TEXT_MUTED = "#7A7870";
const BRAND_OLIVE = "#4A5E3A";

function sellerBlock() {
  const address =
    process.env.SELLER_ADDRESS?.trim() ||
    "Plot No. B, Part 2, RASUDHI WAREHOUSE\nKIADB Industrial Housing Layout, Hebbal 2nd stage\nMysore Karnataka 570016\nIndia";
  return {
    name: process.env.SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited",
    gstin: process.env.SELLER_GSTIN?.trim() || "29ABFCS0538N1ZV",
    addressLines: address.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  };
}

function resolveLogoPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../assets/labels/sarveda-logo-with-name.png"),
    path.join(process.cwd(), "assets/labels/sarveda-logo-with-name.png"),
    path.join(process.cwd(), "backend/assets/labels/sarveda-logo-with-name.png")
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return file;
    } catch {
      /* next */
    }
  }
  return null;
}

function fmt(paise: number, currency: string): string {
  const code = currency.toUpperCase() || "INR";
  const n = paise / 100;
  const locale = code === "INR" ? "en-IN" : "en-US";
  const sym = code === "INR" ? "₹" : code === "GBP" ? "£" : code === "USD" ? "$" : `${code} `;
  return `${sym}${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAddr(a: Addr): string[] {
  return [
    a.fullName,
    a.line1,
    a.line2,
    [a.city, a.state, a.postalCode].filter(Boolean).join(", "),
    a.country,
    a.phone
  ].filter((x): x is string => Boolean(x?.trim()));
}

export function buildQuotationPdf(input: QuotationPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const seller = sellerBlock();
    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const title = input.documentKind === "PROFORMA" ? "PROFORMA INVOICE" : "QUOTATION";
    const disclaimer =
      input.documentKind === "PROFORMA"
        ? "This is a proforma invoice and not a tax invoice."
        : "This is a quotation and not a tax invoice.";

    const logo = resolveLogoPath();
    let y = doc.page.margins.top;
    if (logo) {
      try {
        doc.image(logo, left, y, { width: 120, height: 40 });
      } catch {
        doc.fontSize(12).fillColor(TEXT_BODY).text(seller.name, left, y);
      }
    } else {
      doc.fontSize(12).fillColor(TEXT_BODY).text(seller.name, left, y);
    }

    doc.fontSize(20).font("Helvetica-Bold").fillColor(TEXT_BODY).text(title, left, y, {
      width: pageWidth,
      align: "right"
    });
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor(TEXT_MUTED)
      .text(disclaimer, left, y + 26, { width: pageWidth, align: "right" });

    y = Math.max(doc.y, y + 48) + 8;
    doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED);
    doc.text(seller.name, left, y);
    y = doc.y + 2;
    for (const line of seller.addressLines) {
      doc.text(line, left, y, { width: pageWidth * 0.48 });
      y = doc.y + 1;
    }
    doc.text(`GSTIN: ${seller.gstin}`, left, y);

    const rightX = left + pageWidth * 0.52;
    let ry = Math.max(doc.page.margins.top + 48, y - 40);
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Document #", rightX, ry);
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(TEXT_BODY)
      .text(input.quoteNumber, rightX, ry + 12);
    ry += 32;
    doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED).text("Date", rightX, ry);
    doc
      .fontSize(9)
      .fillColor(TEXT_BODY)
      .text(
        input.issuedAt.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }),
        rightX,
        ry + 12
      );
    if (input.validUntil) {
      ry += 32;
      doc.fontSize(8).fillColor(TEXT_MUTED).text("Valid until", rightX, ry);
      doc
        .fontSize(9)
        .fillColor(TEXT_BODY)
        .text(
          input.validUntil.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
          }),
          rightX,
          ry + 12
        );
    }

    doc.y = Math.max(doc.y, ry + 40) + 10;
    doc.rect(left, doc.y, pageWidth, 0.75).fill(BRAND_OLIVE);
    doc.y += 14;

    const colW = pageWidth * 0.48;
    const billY = doc.y;
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Bill to", left, billY);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_BODY);
    let by = billY + 14;
    for (const line of formatAddr(input.billingAddress)) {
      doc.font(line === input.billingAddress.fullName ? "Helvetica-Bold" : "Helvetica");
      doc.text(line, left, by, { width: colW });
      by = doc.y + 1;
    }
    if (input.buyerGstin) {
      doc.font("Helvetica").fillColor(TEXT_MUTED).text(`GSTIN: ${input.buyerGstin}`, left, by, {
        width: colW
      });
      by = doc.y + 1;
    }
    if (input.email) {
      doc.text(input.email, left, by, { width: colW });
      by = doc.y + 1;
    }

    doc.fontSize(8).fillColor(TEXT_MUTED).text("Ship to", rightX, billY);
    let sy = billY + 14;
    doc.fillColor(TEXT_BODY);
    for (const line of formatAddr(input.shippingAddress)) {
      doc
        .font(line === input.shippingAddress.fullName ? "Helvetica-Bold" : "Helvetica")
        .text(line, rightX, sy, { width: colW });
      sy = doc.y + 1;
    }

    doc.y = Math.max(by, sy) + 16;

    // Table header
    const cols = {
      item: left,
      hsn: left + pageWidth * 0.38,
      qty: left + pageWidth * 0.5,
      rate: left + pageWidth * 0.58,
      disc: left + pageWidth * 0.72,
      total: left + pageWidth * 0.84
    };
    doc.rect(left, doc.y - 2, pageWidth, 18).fill("#EEECE6");
    doc.fontSize(7).font("Helvetica-Bold").fillColor(TEXT_MUTED);
    const hy = doc.y + 2;
    doc.text("Item", cols.item + 4, hy);
    doc.text("HSN", cols.hsn, hy);
    doc.text("Qty", cols.qty, hy);
    doc.text("Rate", cols.rate, hy);
    doc.text("Disc", cols.disc, hy);
    doc.text("Amount", cols.total, hy);
    doc.y = hy + 18;

    doc.font("Helvetica").fillColor(TEXT_BODY).fontSize(8);
    for (const item of input.items) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      const rowY = doc.y;
      const name = item.sku ? `${item.productName}\nSKU: ${item.sku}` : item.productName;
      doc.text(name, cols.item + 4, rowY, { width: pageWidth * 0.34 });
      const afterName = doc.y;
      doc.text(item.hsnCode || "—", cols.hsn, rowY, { width: 40 });
      doc.text(String(item.quantity), cols.qty, rowY, { width: 28 });
      doc.text(fmt(item.unitPriceInPaise, input.currency), cols.rate, rowY, { width: 55 });
      doc.text(fmt(item.discountInPaise, input.currency), cols.disc, rowY, { width: 50 });
      doc.text(fmt(item.lineTotalInPaise, input.currency), cols.total, rowY, { width: 60 });
      doc.y = Math.max(afterName, rowY + 14) + 6;
    }

    doc.moveDown(0.5);
    doc.rect(left, doc.y, pageWidth, 0.5).fill("#D8D6D0");
    doc.y += 10;

    const sumX = left + pageWidth * 0.55;
    const addSum = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(TEXT_MUTED).text(label, sumX, doc.y, {
        width: 90
      });
      doc.fillColor(TEXT_BODY).text(value, sumX + 95, doc.y - 10, { width: 80, align: "right" });
      doc.moveDown(0.35);
    };
    addSum("Subtotal", fmt(input.subtotalInPaise, input.currency));
    if (input.discountInPaise > 0) addSum("Discount", `−${fmt(input.discountInPaise, input.currency)}`);
    if (input.shippingInPaise > 0) addSum("Shipping", fmt(input.shippingInPaise, input.currency));
    if (input.taxPreviewMode === "INTRA_STATE") {
      addSum("Estimated CGST", fmt(input.cgstInPaise, input.currency));
      addSum("Estimated SGST", fmt(input.sgstInPaise, input.currency));
    } else if (input.taxPreviewMode === "INTER_STATE") {
      addSum("Estimated IGST", fmt(input.igstInPaise, input.currency));
    } else if (input.taxInPaise > 0) {
      addSum("Estimated GST", fmt(input.taxInPaise, input.currency));
    }
    addSum("Grand total", fmt(input.grandTotalInPaise, input.currency), true);

    if (input.terms) {
      doc.moveDown(1);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MUTED).text("Terms");
      doc.font("Helvetica").fillColor(TEXT_BODY).text(input.terms, { width: pageWidth });
    }
    if (input.notes) {
      doc.moveDown(0.6);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MUTED).text("Notes");
      doc.font("Helvetica").fillColor(TEXT_BODY).text(input.notes, { width: pageWidth });
    }

    doc
      .fontSize(7)
      .fillColor(TEXT_MUTED)
      .text(
        "Computer-generated commercial document. Not a GST tax invoice / not an accounting entry.",
        left,
        doc.page.height - 48,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}
