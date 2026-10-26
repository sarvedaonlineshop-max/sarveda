import { prisma } from "../../config/db";
import { productSearchOrClause, tokenizeProductQuery } from "../products/productSearch";
import { replyToEnquiryThread } from "../enquiries/enquiries.service";
import { WA_SESSION_WINDOW_MS } from "../whatsapp/whatsapp-inbox.service";
import {
  createQuotation,
  generateQuotePdfBuffer,
  getQuotation,
  markQuotationSent,
  updateQuotation
} from "../quotations/quotation.service";
import { linkQuotation } from "./deal.service";

type QuoteLine = {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  sku?: string | null;
  hsnCode?: string | null;
  quantity: number;
  unitPriceInPaise: number;
  discountPercent?: number | null;
  taxClass?: string | null;
};

type QuoteAddress = {
  fullName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
};

type QuoteInput = {
  customerName: string;
  email?: string | null;
  phone?: string | null;
  itemName?: string;
  amountInPaise?: number;
  dealId?: string | null;
  lines?: QuoteLine[];
  billingAddress?: QuoteAddress;
  shippingAddress?: QuoteAddress;
  shippingSameAsBilling?: boolean;
};

function blankAddress(input: QuoteInput) {
  return {
    fullName: input.customerName,
    phone: input.phone ?? null,
    line1: "Address to be confirmed",
    line2: null,
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN"
  };
}

function addressFor(input: QuoteInput, which: "billing" | "shipping") {
  const same = input.shippingSameAsBilling !== false;
  const src =
    which === "shipping" && same ? input.billingAddress : which === "shipping" ? input.shippingAddress : input.billingAddress;
  if (!src?.line1?.trim()) return blankAddress(input);
  return {
    fullName: src.fullName?.trim() || input.customerName,
    phone: src.phone ?? input.phone ?? null,
    line1: src.line1.trim(),
    line2: src.line2?.trim() || null,
    city: src.city.trim(),
    state: src.state.trim(),
    postalCode: src.postalCode.trim(),
    country: (src.country || "IN").slice(0, 2).toUpperCase()
  };
}

function linesFor(input: QuoteInput): QuoteLine[] {
  if (input.lines && input.lines.length > 0) return input.lines;
  return [
    {
      productName: input.itemName || "Item",
      quantity: 1,
      unitPriceInPaise: input.amountInPaise ?? 0
    }
  ];
}

function quoteBody(input: QuoteInput) {
  return {
    customerName: input.customerName,
    email: input.email || null,
    phone: input.phone ?? null,
    billingAddress: addressFor(input, "billing"),
    shippingAddress: addressFor(input, "shipping"),
    shippingSameAsBilling: input.shippingSameAsBilling !== false,
    currency: "INR" as const,
    shippingInPaise: 0,
    discountInPaise: 0,
    lines: linesFor(input).map((line) => ({
      productId: line.productId ?? null,
      variantId: line.variantId ?? null,
      productName: line.productName,
      sku: line.sku ?? null,
      hsnCode: line.hsnCode ?? null,
      quantity: line.quantity,
      unitPriceInPaise: line.unitPriceInPaise,
      discountInPaise: Math.round(
        (line.quantity * line.unitPriceInPaise * Math.min(100, Math.max(0, line.discountPercent ?? 0))) / 100
      ),
      taxClass: line.taxClass ?? null
    }))
  };
}

function present(quotation: {
  id: string;
  quoteNumber: string;
  status: string;
  grandTotalInPaise: number;
  currency?: string;
  customerName?: string;
  billingAddress?: unknown;
  shippingAddress?: unknown;
  items?: Array<{
    id: string;
    productName: string;
    sku: string | null;
    quantity: number;
    unitPriceInPaise: number;
    discountInPaise?: number;
    productId: string | null;
    variantId: string | null;
  }>;
}) {
  return {
    id: quotation.id,
    quoteNumber: quotation.quoteNumber,
    status: quotation.status,
    grandTotalInPaise: quotation.grandTotalInPaise,
    currency: quotation.currency ?? "INR",
    customerName: quotation.customerName ?? "",
    billingAddress: quotation.billingAddress ?? null,
    shippingAddress: quotation.shippingAddress ?? null,
    items: (quotation.items ?? []).map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      discountPercent:
        item.quantity * item.unitPriceInPaise > 0
          ? Math.round(((item.discountInPaise ?? 0) * 100) / (item.quantity * item.unitPriceInPaise))
          : 0,
      productId: item.productId,
      variantId: item.variantId
    }))
  };
}

export async function createSalesQuote(
  input: QuoteInput,
  actor: { id: string; email: string; name?: string | null }
) {
  const created = await createQuotation(quoteBody(input));
  const quotation = await markQuotationSent(created.id);
  if (input.dealId) {
    await linkQuotation(input.dealId, quotation.id, actor);
  }
  return present(quotation);
}

export async function getSalesQuote(id: string) {
  const quotation = await getQuotation(id);
  if (!quotation) return null;
  return present(quotation);
}

export async function updateSalesQuote(id: string, input: QuoteInput) {
  const existing = await getQuotation(id);
  if (!existing) return null;
  if (existing.convertedOrderId) {
    const err = new Error("This quotation was converted to an order and cannot be edited") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  const updated = await updateQuotation(id, quoteBody(input), {
    returnToDraft: existing.status === "SENT"
  });
  const quotation = updated.status === "DRAFT" ? await markQuotationSent(updated.id) : updated;
  return present(quotation);
}

export async function deleteSalesQuote(id: string) {
  const existing = await prisma.quotation.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.convertedOrderId) {
    const err = new Error("This quotation was converted to an order and cannot be deleted") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  await prisma.quotation.delete({ where: { id } });
  return { deleted: true, id };
}

export async function shareSalesQuote(
  id: string,
  threadId: string,
  actor: { id: string; email: string; name?: string | null }
) {
  const { pdf, quoteNumber, quotation } = await generateQuotePdfBuffer(id);
  const stored = await prisma.quotation.findUnique({
    where: { id },
    select: { quotePdfUrl: true }
  });
  const rupees = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: quotation.currency || "INR",
    maximumFractionDigits: 0
  }).format(quotation.grandTotalInPaise / 100);
  const lines = quotation.items
    .map((item) => `${item.productName}${item.sku ? ` (${item.sku})` : ""} × ${item.quantity}`)
    .join("\n");
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { source: true, lastCustomerMessageAt: true }
  });
  const windowOpen =
    thread?.source === "WHATSAPP" &&
    Boolean(thread.lastCustomerMessageAt) &&
    Date.now() - thread.lastCustomerMessageAt!.getTime() <= WA_SESSION_WINDOW_MS;
  const pdfLink = stored?.quotePdfUrl?.trim() || "";
  const closedWhatsApp = thread?.source === "WHATSAPP" && !windowOpen;
  if (closedWhatsApp && !pdfLink) {
    const err = new Error(
      "WhatsApp will not take a file until the customer messages again. The quotation file could not be prepared as a link."
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const message = closedWhatsApp
    ? `Quotation ${quoteNumber}\n${lines}\nTotal ${rupees}\nDownload: ${pdfLink}`
    : `Quotation ${quoteNumber}\n${lines}\nTotal ${rupees}\nThe PDF is attached.`;
  const sent = await replyToEnquiryThread(
    threadId,
    { id: actor.id, email: actor.email, name: actor.name ?? null },
    message,
    closedWhatsApp
      ? []
      : [
          {
            buffer: pdf,
            mimeType: "application/pdf",
            fileName: `${quoteNumber.replace(/\//g, "-")}.pdf`,
            sizeBytes: pdf.length
          }
        ]
  );
  if (!sent) {
    const err = new Error("Chat not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  return { shared: true, quoteNumber, delivery: closedWhatsApp ? "whatsapp_link" : "file" };
}

export async function listSalesQuotes(q: string) {
  const needle = q.trim();
  if (needle.length < 3) return [];
  const rows = await prisma.quotation.findMany({
    where: {
      OR: [
        { email: { contains: needle, mode: "insensitive" } },
        { phone: { contains: needle, mode: "insensitive" } },
        { customerName: { contains: needle, mode: "insensitive" } },
        { quoteNumber: { contains: needle, mode: "insensitive" } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  return rows.map((row) => present(row));
}

export async function searchSalesCatalog(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const tokens = tokenizeProductQuery(term);
  const productWhere = tokens.length ? productSearchOrClause(tokens) : undefined;
  const variants = await prisma.productVariant.findMany({
    where: {
      status: "ACTIVE",
      productRel: {
        deletedAt: null,
        status: "ACTIVE",
        ...(productWhere ?? {})
      }
    },
    take: 40,
    include: {
      productRel: { select: { id: true, name: true, hsnCode: true, taxClass: true } },
      attributeValues: {
        include: { attributeValue: { select: { value: true, attribute: { select: { name: true } } } } }
      }
    },
    orderBy: { sku: "asc" }
  });
  return variants.map((variant) => {
    const combination = variant.attributeValues
      .map((row) => row.attributeValue.value)
      .filter(Boolean)
      .join(" · ");
    return {
      variantId: variant.id,
      productId: variant.productId,
      itemName: variant.productRel.name,
      combination: combination || "Standard",
      sku: variant.sku,
      hsnCode: variant.productRel.hsnCode,
      taxClass: variant.productRel.taxClass,
      rateInPaise: variant.saleInPaise || variant.mrpInPaise || 0
    };
  });
}
