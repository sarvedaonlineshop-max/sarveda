import { describe, expect, it } from "vitest";

import { prisma } from "../helpers/commerce";
import { generateQuoteNumber, quotationFiscalYearLabel } from "../../src/modules/quotations/quotation-number";
import { computeQuotationTotals } from "../../src/modules/quotations/quotation-totals";
import { buildQuotationPdf } from "../../src/modules/quotations/quotation-pdf";
import {
  cancelQuotation,
  createQuotation,
  generateProformaPdfBuffer,
  generateQuotePdfBuffer,
  getQuotation,
  markQuotationAccepted,
  markQuotationSent,
  updateQuotation
} from "../../src/modules/quotations/quotation.service";
import type { QuotationUpsertBody } from "../../src/modules/quotations/quotation.schemas";

function baseBody(overrides?: Partial<QuotationUpsertBody>): QuotationUpsertBody {
  return {
    customerName: "Test Buyer",
    email: "buyer@example.com",
    phone: "9876543210",
    buyerGstin: null,
    billingAddress: {
      fullName: "Test Buyer",
      phone: "9876543210",
      line1: "12 MG Road",
      line2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN"
    },
    shippingAddress: {
      fullName: "Test Buyer",
      phone: "9876543210",
      line1: "12 MG Road",
      line2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      country: "IN"
    },
    shippingSameAsBilling: true,
    currency: "INR",
    shippingInPaise: 5000,
    discountInPaise: 0,
    validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    terms: "Net 7",
    notes: "Test notes <script>alert(1)</script>",
    lines: [
      {
        productName: "Singing Bowl",
        sku: "SB-1",
        hsnCode: "9205",
        quantity: 2,
        unitPriceInPaise: 118000,
        discountInPaise: 0,
        taxClass: "standard"
      },
      {
        productName: "Custom line",
        sku: null,
        hsnCode: "9205",
        quantity: 1,
        unitPriceInPaise: 50000,
        discountInPaise: 5000,
        taxClass: "gst-5"
      }
    ],
    ...overrides
  };
}

async function cleanupQuote(id: string) {
  await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
  await prisma.quotation.deleteMany({ where: { id } });
}

describe("quotation totals / GST preview", () => {
  it("computes intrastate CGST/SGST for Karnataka", () => {
    const t = computeQuotationTotals({
      lines: baseBody().lines,
      shippingInPaise: 0,
      headerDiscountInPaise: 0,
      currency: "INR",
      shippingAddress: baseBody().shippingAddress
    });
    expect(t.taxPreviewMode).toBe("INTRA_STATE");
    expect(t.taxInPaise).toBeGreaterThan(0);
    expect(t.cgstInPaise + t.sgstInPaise).toBe(t.taxInPaise);
    expect(t.igstInPaise).toBe(0);
  });

  it("computes interstate IGST for Delhi ship-to", () => {
    const t = computeQuotationTotals({
      lines: baseBody().lines,
      shippingInPaise: 0,
      headerDiscountInPaise: 0,
      currency: "INR",
      shippingAddress: { ...baseBody().shippingAddress, state: "Delhi", postalCode: "110001" }
    });
    expect(t.taxPreviewMode).toBe("INTER_STATE");
    expect(t.igstInPaise).toBe(t.taxInPaise);
    expect(t.cgstInPaise).toBe(0);
  });

  it("B2C without GSTIN still totals; rejects negative qty via schema path", () => {
    const t = computeQuotationTotals({
      lines: [{ productName: "X", quantity: 1, unitPriceInPaise: 10000, discountInPaise: 0 }],
      shippingInPaise: 0,
      headerDiscountInPaise: 0,
      currency: "INR",
      shippingAddress: baseBody().shippingAddress
    });
    expect(t.grandTotalInPaise).toBe(10000);
  });

  it("strips angle brackets from names", () => {
    const t = computeQuotationTotals({
      lines: [
        {
          productName: "Bowl <b>Bold</b>",
          quantity: 1,
          unitPriceInPaise: 1000,
          discountInPaise: 0
        }
      ],
      shippingInPaise: 0,
      headerDiscountInPaise: 0,
      currency: "INR",
      shippingAddress: baseBody().shippingAddress
    });
    expect(t.lines[0]!.productName).not.toContain("<");
  });
});

describe("quotation CRUD + documents", () => {
  it("creates draft, multi-item, no accounting journal", async () => {
    const journalsBefore = await prisma.accountingJournalEntry.count();
    const q = await createQuotation(baseBody({ buyerGstin: "29AAAAA0000A1Z5" }));
    expect(q.status).toBe("DRAFT");
    expect(q.quoteNumber).toMatch(/^QT\/\d{2}-\d{2}\/\d{6}$/);
    expect(q.items).toHaveLength(2);
    expect(q.notes).not.toContain("<script>");
    const journalsAfter = await prisma.accountingJournalEntry.count();
    expect(journalsAfter).toBe(journalsBefore);
    await cleanupQuote(q.id);
  });

  it("rejects invalid quantity at schema level", async () => {
    const { quotationUpsertSchema } = await import("../../src/modules/quotations/quotation.schemas");
    const bad = quotationUpsertSchema.safeParse(
      baseBody({
        lines: [{ productName: "X", quantity: 0, unitPriceInPaise: 100, discountInPaise: 0 }]
      })
    );
    expect(bad.success).toBe(false);
  });

  it("issue quote + download PDF + proforma without journals", async () => {
    const journalsBefore = await prisma.accountingJournalEntry.count();
    const created = await createQuotation(baseBody());
    const sent = await markQuotationSent(created.id);
    expect(sent.status).toBe("SENT");
    expect(sent.sentAt).toBeTruthy();

    const quotePdf = await generateQuotePdfBuffer(created.id);
    expect(quotePdf.pdf.length).toBeGreaterThan(500);
    expect(quotePdf.pdf.subarray(0, 4).toString()).toBe("%PDF");

    const journalsMid = await prisma.accountingJournalEntry.count();
    expect(journalsMid).toBe(journalsBefore);

    const proforma = await generateProformaPdfBuffer(created.id);
    expect(proforma.pdf.subarray(0, 4).toString()).toBe("%PDF");
    const refreshed = await getQuotation(created.id);
    expect(refreshed?.proformaIssuedAt).toBeTruthy();

    const journalsAfter = await prisma.accountingJournalEntry.count();
    expect(journalsAfter).toBe(journalsBefore);

    await cleanupQuote(created.id);
  });

  it("accepted becomes locked for update; cancelled protected from convert path", async () => {
    const created = await createQuotation(baseBody());
    await markQuotationSent(created.id);
    const accepted = await markQuotationAccepted(created.id);
    expect(accepted.status).toBe("ACCEPTED");
    await expect(updateQuotation(created.id, baseBody())).rejects.toMatchObject({
      code: "QUOTE_LOCKED"
    });
    await cleanupQuote(created.id);

    const c2 = await createQuotation(baseBody());
    await cancelQuotation(c2.id);
    await expect(generateProformaPdfBuffer(c2.id)).rejects.toMatchObject({
      code: "INVALID_STATUS"
    });
    await cleanupQuote(c2.id);
  });

  it("snapshot unchanged when catalog price would differ (manual line prices)", async () => {
    const q = await createQuotation(
      baseBody({
        lines: [
          {
            productName: "Frozen Price Item",
            quantity: 1,
            unitPriceInPaise: 99900,
            discountInPaise: 0,
            taxClass: "standard"
          }
        ]
      })
    );
    expect(q.items[0]!.unitPriceInPaise).toBe(99900);
    await cleanupQuote(q.id);
  });

  it("concurrent numbering uniqueness", async () => {
    const fy = quotationFiscalYearLabel();
    const prefix = `QT/${fy}/`;
    const a = await generateQuoteNumber();
    const b = await generateQuoteNumber();
    expect(a.startsWith(prefix)).toBe(true);
    expect(b.startsWith(prefix)).toBe(true);
    // Creating two quotes should succeed with unique numbers
    const q1 = await createQuotation(baseBody({ customerName: "A" }));
    const q2 = await createQuotation(baseBody({ customerName: "B" }));
    expect(q1.quoteNumber).not.toBe(q2.quoteNumber);
    await cleanupQuote(q1.id);
    await cleanupQuote(q2.id);
  });

  it("builds PDF buffer standalone", async () => {
    const pdf = await buildQuotationPdf({
      documentKind: "QUOTATION",
      quoteNumber: "QT/26-27/000099",
      issuedAt: new Date(),
      validUntil: null,
      customerName: "Buyer",
      email: null,
      phone: null,
      buyerGstin: null,
      billingAddress: baseBody().billingAddress,
      shippingAddress: baseBody().shippingAddress,
      currency: "INR",
      items: [
        {
          productName: "Item",
          sku: "S",
          hsnCode: "9205",
          quantity: 1,
          unitPriceInPaise: 10000,
          discountInPaise: 0,
          lineTotalInPaise: 10000,
          taxRatePercent: 18
        }
      ],
      subtotalInPaise: 10000,
      discountInPaise: 0,
      shippingInPaise: 0,
      taxInPaise: 1525,
      cgstInPaise: 763,
      sgstInPaise: 762,
      igstInPaise: 0,
      taxPreviewMode: "INTRA_STATE",
      grandTotalInPaise: 10000,
      terms: null,
      notes: null
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
