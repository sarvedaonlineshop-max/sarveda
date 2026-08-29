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

export type DeliveryChallanPdfLine = {
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
};

export type DeliveryChallanPdfInput = {
  challanNumber: string;
  challanDate: Date;
  orderNumber: string;
  reasonLabel: string;
  notes: string | null;
  buyerName: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerGstin: string | null;
  consigneeAddress: Addr;
  billToAddress: Addr | null;
  originState: string | null;
  originCountry: string | null;
  destinationState: string | null;
  destinationCountry: string | null;
  currency: string;
  items: DeliveryChallanPdfLine[];
  taxableValueInPaise: number;
  grandTotalInPaise: number;
  carrier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  showValueColumns: boolean;
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

function dateIn(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildDeliveryChallanPdf(input: DeliveryChallanPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const seller = sellerBlock();
    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const title = "DELIVERY CHALLAN";
    const disclaimer = "This is a delivery challan and not a tax invoice.";

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

    doc.fontSize(18).font("Helvetica-Bold").fillColor(TEXT_BODY).text(title, left, y, {
      width: pageWidth,
      align: "right"
    });
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor(TEXT_MUTED)
      .text(disclaimer, left, y + 24, { width: pageWidth, align: "right" });

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
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Challan #", rightX, ry);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(TEXT_BODY).text(input.challanNumber, rightX, ry + 12);
    ry += 32;
    doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED).text("Date", rightX, ry);
    doc.fontSize(9).fillColor(TEXT_BODY).text(dateIn(input.challanDate), rightX, ry + 12);
    ry += 32;
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Order #", rightX, ry);
    doc.fontSize(9).fillColor(TEXT_BODY).text(input.orderNumber, rightX, ry + 12);
    ry += 32;
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Reason for movement", rightX, ry);
    doc.fontSize(9).fillColor(TEXT_BODY).text(input.reasonLabel, rightX, ry + 12, {
      width: pageWidth * 0.48
    });

    doc.y = Math.max(doc.y, ry + 40) + 10;
    doc.rect(left, doc.y, pageWidth, 0.75).fill(BRAND_OLIVE);
    doc.y += 14;

    const colW = pageWidth * 0.48;
    const shipY = doc.y;
    doc.fontSize(8).fillColor(TEXT_MUTED).text("Consignee / Ship to", left, shipY);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(TEXT_BODY);
    let sy = shipY + 14;
    for (const line of formatAddr(input.consigneeAddress)) {
      doc.font(line === input.consigneeAddress.fullName ? "Helvetica-Bold" : "Helvetica");
      doc.text(line, left, sy, { width: colW });
      sy = doc.y + 1;
    }
    if (input.buyerGstin) {
      doc.font("Helvetica").fontSize(8).fillColor(TEXT_MUTED).text(`GSTIN: ${input.buyerGstin}`, left, sy);
      sy = doc.y + 1;
    }
    if (input.buyerEmail) {
      doc.fontSize(8).fillColor(TEXT_MUTED).text(input.buyerEmail, left, sy, { width: colW });
      sy = doc.y + 1;
    }

    if (input.billToAddress) {
      const bx = left + colW + 12;
      doc.fontSize(8).fillColor(TEXT_MUTED).text("Bill to", bx, shipY);
      let by = shipY + 14;
      doc.fontSize(9).fillColor(TEXT_BODY);
      for (const line of formatAddr(input.billToAddress)) {
        doc.font(line === input.billToAddress.fullName ? "Helvetica-Bold" : "Helvetica");
        doc.text(line, bx, by, { width: colW - 12 });
        by = doc.y + 1;
      }
      doc.y = Math.max(sy, by) + 10;
    } else {
      doc.y = sy + 10;
    }

    doc.fontSize(8).font("Helvetica").fillColor(TEXT_MUTED);
    const movementBits = [
      input.originState ? `Origin: ${input.originState}${input.originCountry ? `, ${input.originCountry}` : ""}` : null,
      input.destinationState
        ? `Destination: ${input.destinationState}${input.destinationCountry ? `, ${input.destinationCountry}` : ""}`
        : null
    ].filter(Boolean);
    if (movementBits.length) {
      doc.text(movementBits.join("  ·  "), left, doc.y, { width: pageWidth });
      doc.y += 8;
    }

    if (input.carrier || input.awb) {
      const shipBits = [
        input.carrier ? `Carrier: ${input.carrier}` : null,
        input.awb ? `AWB: ${input.awb}` : null
      ].filter(Boolean);
      doc.fillColor(TEXT_BODY).fontSize(9).text(shipBits.join("  ·  "), left, doc.y, { width: pageWidth });
      doc.y += 6;
      // Intentionally no E-Way Bill / EBN field — never fabricate government document numbers.
    }

    doc.y += 6;
    doc.rect(left, doc.y, pageWidth, 0.5).fill("#D4D0C8");
    doc.y += 10;

    const showVal = input.showValueColumns;
    const cols = showVal
      ? [
          { label: "Item", w: pageWidth * 0.34 },
          { label: "SKU", w: pageWidth * 0.14 },
          { label: "HSN", w: pageWidth * 0.1 },
          { label: "Qty", w: pageWidth * 0.08 },
          { label: "Rate", w: pageWidth * 0.16 },
          { label: "Amount", w: pageWidth * 0.18 }
        ]
      : [
          { label: "Item", w: pageWidth * 0.48 },
          { label: "SKU", w: pageWidth * 0.2 },
          { label: "HSN", w: pageWidth * 0.16 },
          { label: "Qty", w: pageWidth * 0.16 }
        ];

    const headerY = doc.y;
    let cx = left;
    doc.fontSize(7).font("Helvetica-Bold").fillColor(TEXT_MUTED);
    for (const c of cols) {
      doc.text(c.label, cx, headerY, {
        width: c.w,
        align: c.label === "Qty" || c.label === "Rate" || c.label === "Amount" ? "right" : "left"
      });
      cx += c.w;
    }
    doc.y = headerY + 14;
    doc.rect(left, doc.y, pageWidth, 0.5).fill("#D4D0C8");
    doc.y += 8;

    for (const line of input.items) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }
      const rowY = doc.y;
      cx = left;
      const cells = showVal
        ? [
            line.productName,
            line.sku || "—",
            line.hsnCode || "—",
            String(line.quantity),
            fmt(line.unitPriceInPaise, input.currency),
            fmt(line.lineTotalInPaise, input.currency)
          ]
        : [line.productName, line.sku || "—", line.hsnCode || "—", String(line.quantity)];

      doc.fontSize(8).font("Helvetica").fillColor(TEXT_BODY);
      let maxH = 0;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i]!;
        const align = i >= (showVal ? 3 : 3) ? "right" : "left";
        const h = doc.heightOfString(cells[i]!, { width: c.w - 4 });
        maxH = Math.max(maxH, h);
        doc.text(cells[i]!, cx, rowY, { width: c.w - 4, align });
        cx += c.w;
      }
      doc.y = rowY + maxH + 6;
    }

    doc.y += 6;
    doc.rect(left, doc.y, pageWidth, 0.5).fill(BRAND_OLIVE);
    doc.y += 12;

    if (showVal) {
      const labelX = left + pageWidth * 0.55;
      const valX = left + pageWidth * 0.75;
      doc.fontSize(8).fillColor(TEXT_MUTED).text("Taxable value (est.)", labelX, doc.y);
      doc.fillColor(TEXT_BODY).text(fmt(input.taxableValueInPaise, input.currency), valX, doc.y, {
        width: pageWidth * 0.25,
        align: "right"
      });
      doc.y += 14;
      doc.font("Helvetica-Bold").text("Grand total", labelX, doc.y);
      doc.text(fmt(input.grandTotalInPaise, input.currency), valX, doc.y, {
        width: pageWidth * 0.25,
        align: "right"
      });
      doc.y += 18;
      doc.font("Helvetica").fontSize(7).fillColor(TEXT_MUTED).text(
        "Values are informational for goods movement only and do not create GST output liability.",
        left,
        doc.y,
        { width: pageWidth }
      );
      doc.y += 14;
    }

    if (input.notes?.trim()) {
      doc.fontSize(8).font("Helvetica-Bold").fillColor(TEXT_MUTED).text("Notes", left, doc.y);
      doc.y += 12;
      doc.font("Helvetica").fontSize(8).fillColor(TEXT_BODY).text(input.notes, left, doc.y, {
        width: pageWidth
      });
    }

    doc.end();
  });
}
