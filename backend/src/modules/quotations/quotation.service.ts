import type { Quotation, QuotationItem, QuotationStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { uploadPdf } from "../../config/s3";
import { generateQuoteNumber, isQuoteNumberUniqueViolation } from "./quotation-number";
import { buildQuotationPdf, type QuotationPdfInput } from "./quotation-pdf";
import type { QuotationUpsertBody } from "./quotation.schemas";
import { computeQuotationTotals, sanitizeQuoteText } from "./quotation-totals";

export type QuotationWithItems = Quotation & { items: QuotationItem[] };

const EDITABLE: QuotationStatus[] = ["DRAFT"];
const SENT_EDITABLE_RETURN: QuotationStatus[] = ["SENT"];

function parseValidUntil(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addressFromBody(
  body: QuotationUpsertBody,
  which: "billing" | "shipping"
): Prisma.InputJsonValue {
  const src =
    which === "shipping" && body.shippingSameAsBilling ? body.billingAddress : body[`${which}Address`];
  return {
    fullName: sanitizeQuoteText(src.fullName, 200) ?? "",
    phone: sanitizeQuoteText(src.phone, 20),
    line1: sanitizeQuoteText(src.line1, 300) ?? "",
    line2: sanitizeQuoteText(src.line2, 300),
    city: sanitizeQuoteText(src.city, 120) ?? "",
    state: sanitizeQuoteText(src.state, 120) ?? "",
    postalCode: sanitizeQuoteText(src.postalCode, 20) ?? "",
    country: (src.country ?? "IN").toUpperCase().slice(0, 2)
  };
}

function assertEditable(status: QuotationStatus, allowSentReturn = false): void {
  if (EDITABLE.includes(status)) return;
  if (allowSentReturn && SENT_EDITABLE_RETURN.includes(status)) return;
  const e = new Error(`Quotation is ${status} and cannot be edited`) as Error & {
    statusCode: number;
    code: string;
  };
  e.statusCode = 400;
  e.code = "QUOTE_LOCKED";
  throw e;
}

export function displayExpiryState(validUntil: Date | null | undefined, status: QuotationStatus): {
  label: "Valid" | "Expires soon" | "Expired" | null;
  derivedExpired: boolean;
} {
  if (!validUntil || status === "CANCELLED" || status === "CONVERTED") {
    return { label: null, derivedExpired: false };
  }
  const now = Date.now();
  const end = validUntil.getTime();
  if (end < now) return { label: "Expired", derivedExpired: status !== "EXPIRED" };
  const days = (end - now) / (24 * 60 * 60 * 1000);
  if (days <= 7) return { label: "Expires soon", derivedExpired: false };
  return { label: "Valid", derivedExpired: false };
}

export async function listQuotations(opts: {
  status: string;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const where: Prisma.QuotationWhereInput = {};
  if (opts.status && opts.status !== "ALL") {
    where.status = opts.status as QuotationStatus;
  }
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { quoteNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } }
    ];
  }
  const skip = (opts.page - 1) * opts.pageSize;
  const [total, items] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: opts.pageSize,
      include: { items: { orderBy: { sortOrder: "asc" }, take: 1 } }
    })
  ]);
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    items: items.map((row) => ({
      ...row,
      expiry: displayExpiryState(row.validUntil, row.status)
    }))
  };
}

export async function getQuotation(id: string): Promise<QuotationWithItems | null> {
  return prisma.quotation.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

async function resolveCatalogSnapshots(
  lines: QuotationUpsertBody["lines"]
): Promise<QuotationUpsertBody["lines"]> {
  const variantIds = lines.map((l) => l.variantId).filter((id): id is string => Boolean(id));
  if (!variantIds.length) return lines;
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { productRel: { select: { id: true, name: true, hsnCode: true, taxClass: true } } }
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return lines.map((line) => {
    if (!line.variantId) return line;
    const v = byId.get(line.variantId);
    if (!v) return line;
    return {
      ...line,
      productId: v.productId,
      productName: line.productName.trim() || v.productRel.name,
      sku: line.sku?.trim() || v.sku,
      hsnCode: line.hsnCode?.trim() || v.productRel.hsnCode || null,
      taxClass: line.taxClass?.trim() || v.productRel.taxClass || null,
      unitPriceInPaise:
        line.unitPriceInPaise > 0 ? line.unitPriceInPaise : v.saleInPaise || v.mrpInPaise || 0
    };
  });
}

function buildPersistPayload(body: QuotationUpsertBody) {
  const shippingAddress =
    body.shippingSameAsBilling ? body.billingAddress : body.shippingAddress;
  const lines = body.lines;
  const computed = computeQuotationTotals({
    lines,
    shippingInPaise: body.shippingInPaise ?? 0,
    headerDiscountInPaise: body.discountInPaise ?? 0,
    currency: body.currency ?? "INR",
    shippingAddress
  });
  return {
    computed,
    billingAddress: addressFromBody(body, "billing"),
    shippingAddress: addressFromBody(body, "shipping"),
    customerName: sanitizeQuoteText(body.customerName, 200) ?? "Customer",
    email: sanitizeQuoteText(body.email || null, 200),
    phone: sanitizeQuoteText(body.phone, 20),
    buyerGstin: sanitizeQuoteText(body.buyerGstin, 20)?.toUpperCase() ?? null,
    terms: sanitizeQuoteText(body.terms, 8000),
    notes: sanitizeQuoteText(body.notes, 8000),
    validUntil: parseValidUntil(body.validUntil ?? null),
    currency: (body.currency ?? "INR").toUpperCase(),
    customerId: body.customerId ?? null
  };
}

export async function createQuotation(body: QuotationUpsertBody): Promise<QuotationWithItems> {
  const resolvedLines = await resolveCatalogSnapshots(body.lines);
  const payload = buildPersistPayload({ ...body, lines: resolvedLines });

  for (let attempt = 0; attempt < 5; attempt++) {
    const quoteNumber = await generateQuoteNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        const q = await tx.quotation.create({
          data: {
            quoteNumber,
            status: "DRAFT",
            customerId: payload.customerId,
            customerName: payload.customerName,
            email: payload.email,
            phone: payload.phone,
            buyerGstin: payload.buyerGstin,
            billingAddress: payload.billingAddress,
            shippingAddress: payload.shippingAddress,
            currency: payload.currency,
            subtotalInPaise: payload.computed.subtotalInPaise,
            discountInPaise: payload.computed.discountInPaise,
            shippingInPaise: payload.computed.shippingInPaise,
            taxInPaise: payload.computed.taxInPaise,
            grandTotalInPaise: payload.computed.grandTotalInPaise,
            taxPreviewMode: payload.computed.taxPreviewMode,
            cgstInPaise: payload.computed.cgstInPaise,
            sgstInPaise: payload.computed.sgstInPaise,
            igstInPaise: payload.computed.igstInPaise,
            validUntil: payload.validUntil,
            terms: payload.terms,
            notes: payload.notes,
            items: {
              create: payload.computed.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                productName: l.productName,
                sku: l.sku,
                hsnCode: l.hsnCode,
                quantity: l.quantity,
                unitPriceInPaise: l.unitPriceInPaise,
                discountInPaise: l.discountInPaise,
                taxClass: l.taxClass,
                taxRatePercent: l.taxRatePercent,
                taxableInPaise: l.taxableInPaise,
                taxInPaise: l.taxInPaise,
                lineTotalInPaise: l.lineTotalInPaise,
                sortOrder: l.sortOrder
              }))
            }
          },
          include: { items: { orderBy: { sortOrder: "asc" } } }
        });
        logger.info("quotation_created", { id: q.id, quoteNumber: q.quoteNumber });
        return q;
      });
    } catch (err) {
      if (!isQuoteNumberUniqueViolation(err) || attempt === 4) throw err;
    }
  }
  throw new Error("Failed to create quotation");
}

export async function updateQuotation(
  id: string,
  body: QuotationUpsertBody,
  opts?: { returnToDraft?: boolean }
): Promise<QuotationWithItems> {
  const existing = await getQuotation(id);
  if (!existing) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  assertEditable(existing.status, Boolean(opts?.returnToDraft));

  const resolvedLines = await resolveCatalogSnapshots(body.lines);
  const payload = buildPersistPayload({ ...body, lines: resolvedLines });

  return prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    return tx.quotation.update({
      where: { id },
      data: {
        status: opts?.returnToDraft && existing.status === "SENT" ? "DRAFT" : existing.status,
        customerId: payload.customerId,
        customerName: payload.customerName,
        email: payload.email,
        phone: payload.phone,
        buyerGstin: payload.buyerGstin,
        billingAddress: payload.billingAddress,
        shippingAddress: payload.shippingAddress,
        currency: payload.currency,
        subtotalInPaise: payload.computed.subtotalInPaise,
        discountInPaise: payload.computed.discountInPaise,
        shippingInPaise: payload.computed.shippingInPaise,
        taxInPaise: payload.computed.taxInPaise,
        grandTotalInPaise: payload.computed.grandTotalInPaise,
        taxPreviewMode: payload.computed.taxPreviewMode,
        cgstInPaise: payload.computed.cgstInPaise,
        sgstInPaise: payload.computed.sgstInPaise,
        igstInPaise: payload.computed.igstInPaise,
        validUntil: payload.validUntil,
        terms: payload.terms,
        notes: payload.notes,
        quotePdfUrl: null,
        items: {
          create: payload.computed.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            productName: l.productName,
            sku: l.sku,
            hsnCode: l.hsnCode,
            quantity: l.quantity,
            unitPriceInPaise: l.unitPriceInPaise,
            discountInPaise: l.discountInPaise,
            taxClass: l.taxClass,
            taxRatePercent: l.taxRatePercent,
            taxableInPaise: l.taxableInPaise,
            taxInPaise: l.taxInPaise,
            lineTotalInPaise: l.lineTotalInPaise,
            sortOrder: l.sortOrder
          }))
        }
      },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
  });
}

export async function markQuotationSent(id: string): Promise<QuotationWithItems> {
  const existing = await getQuotation(id);
  if (!existing) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  if (existing.status !== "DRAFT" && existing.status !== "SENT") {
    const e = new Error("Only draft quotations can be marked sent") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_STATUS";
    throw e;
  }
  return prisma.quotation.update({
    where: { id },
    data: { status: "SENT", sentAt: existing.sentAt ?? new Date() },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

export async function markQuotationAccepted(id: string): Promise<QuotationWithItems> {
  const existing = await getQuotation(id);
  if (!existing) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  if (!["SENT", "ACCEPTED", "DRAFT"].includes(existing.status)) {
    const e = new Error("Quotation cannot be accepted from current status") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_STATUS";
    throw e;
  }
  return prisma.quotation.update({
    where: { id },
    data: {
      status: "ACCEPTED",
      acceptedAt: existing.acceptedAt ?? new Date(),
      sentAt: existing.sentAt ?? new Date()
    },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

export async function cancelQuotation(id: string): Promise<QuotationWithItems> {
  const existing = await getQuotation(id);
  if (!existing) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  if (existing.status === "CONVERTED") {
    const e = new Error("Converted quotations cannot be cancelled") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_STATUS";
    throw e;
  }
  if (existing.status === "CANCELLED") return existing;
  return prisma.quotation.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

function asAddr(json: Prisma.JsonValue): QuotationPdfInput["billingAddress"] {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return {
    fullName: String(o.fullName ?? ""),
    phone: o.phone != null ? String(o.phone) : null,
    line1: String(o.line1 ?? ""),
    line2: o.line2 != null ? String(o.line2) : null,
    city: String(o.city ?? ""),
    state: String(o.state ?? ""),
    postalCode: String(o.postalCode ?? ""),
    country: String(o.country ?? "IN")
  };
}

function toPdfInput(
  q: QuotationWithItems,
  kind: "QUOTATION" | "PROFORMA"
): QuotationPdfInput {
  return {
    documentKind: kind,
    quoteNumber: q.quoteNumber,
    issuedAt: kind === "PROFORMA" ? q.proformaIssuedAt ?? new Date() : q.sentAt ?? q.createdAt,
    validUntil: q.validUntil,
    customerName: q.customerName,
    email: q.email,
    phone: q.phone,
    buyerGstin: q.buyerGstin,
    billingAddress: asAddr(q.billingAddress),
    shippingAddress: asAddr(q.shippingAddress),
    currency: q.currency,
    items: q.items.map((it) => ({
      productName: it.productName,
      sku: it.sku,
      hsnCode: it.hsnCode,
      quantity: it.quantity,
      unitPriceInPaise: it.unitPriceInPaise,
      discountInPaise: it.discountInPaise,
      lineTotalInPaise: it.lineTotalInPaise,
      taxRatePercent: it.taxRatePercent
    })),
    subtotalInPaise: q.subtotalInPaise,
    discountInPaise: q.discountInPaise,
    shippingInPaise: q.shippingInPaise,
    taxInPaise: q.taxInPaise,
    cgstInPaise: q.cgstInPaise,
    sgstInPaise: q.sgstInPaise,
    igstInPaise: q.igstInPaise,
    taxPreviewMode: q.taxPreviewMode,
    grandTotalInPaise: q.grandTotalInPaise,
    terms: q.terms,
    notes: q.notes
  };
}

export async function generateQuotePdfBuffer(
  id: string
): Promise<{ pdf: Buffer; quoteNumber: string; quotation: QuotationWithItems }> {
  const q = await getQuotation(id);
  if (!q) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  const pdf = await buildQuotationPdf(toPdfInput(q, "QUOTATION"));
  const key = `quotations/${q.quoteNumber.replace(/\//g, "-")}/quote.pdf`;
  const uploaded = await uploadPdf(key, pdf);
  if (uploaded) {
    await prisma.quotation.update({ where: { id }, data: { quotePdfUrl: uploaded } });
  }
  return { pdf, quoteNumber: q.quoteNumber, quotation: q };
}

/**
 * Proforma numbering decision (Option A):
 * Same quoteNumber; document type = Proforma Invoice. Track proformaIssuedAt.
 */
export async function generateProformaPdfBuffer(
  id: string
): Promise<{ pdf: Buffer; quoteNumber: string; quotation: QuotationWithItems }> {
  let q = await getQuotation(id);
  if (!q) {
    const e = new Error("Quotation not found") as Error & { statusCode: number; code: string };
    e.statusCode = 404;
    e.code = "NOT_FOUND";
    throw e;
  }
  if (q.status === "CANCELLED" || q.status === "DRAFT") {
    const e = new Error("Issue the quotation (Mark Sent) before creating a proforma") as Error & {
      statusCode: number;
      code: string;
    };
    e.statusCode = 400;
    e.code = "INVALID_STATUS";
    throw e;
  }
  if (!q.proformaIssuedAt) {
    q = await prisma.quotation.update({
      where: { id },
      data: { proformaIssuedAt: new Date() },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
  }
  const pdf = await buildQuotationPdf(toPdfInput(q, "PROFORMA"));
  const key = `quotations/${q.quoteNumber.replace(/\//g, "-")}/proforma.pdf`;
  const uploaded = await uploadPdf(key, pdf);
  if (uploaded) {
    await prisma.quotation.update({ where: { id }, data: { proformaPdfUrl: uploaded } });
  }
  return { pdf, quoteNumber: q.quoteNumber, quotation: q };
}

/** Catalog search for quote lines — read-only. */
export async function searchQuoteCatalog(q: string) {
  const term = q.trim();
  if (term.length < 2) return { items: [] as Array<Record<string, unknown>> };
  const variants = await prisma.productVariant.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { sku: { contains: term, mode: "insensitive" } },
        { productRel: { name: { contains: term, mode: "insensitive" } } }
      ],
      productRel: { deletedAt: null, status: "ACTIVE" }
    },
    take: 20,
    include: {
      productRel: { select: { id: true, name: true, hsnCode: true, taxClass: true } }
    },
    orderBy: { sku: "asc" }
  });
  return {
    items: variants.map((v) => ({
      variantId: v.id,
      productId: v.productId,
      itemName: v.productRel.name,
      sku: v.sku,
      hsnCode: v.productRel.hsnCode,
      taxClass: v.productRel.taxClass,
      rateInPaise: v.saleInPaise || v.mrpInPaise || 0
    }))
  };
}

export async function searchQuoteCustomers(q: string) {
  const term = q.trim();
  if (term.length < 2) return { items: [] as Array<Record<string, unknown>> };
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { email: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } }
      ]
    },
    take: 15,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      addresses: {
        where: { isDefault: true },
        take: 1
      }
    }
  });
  return {
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      defaultAddress: u.addresses[0] ?? null
    }))
  };
}
