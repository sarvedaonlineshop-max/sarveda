import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { isFirebaseConfigured, sendPushNotification } from "../../config/firebase";
import { toWhatsAppE164 } from "../notifications/whatsapp";
import { sendWhatsAppSessionText } from "../whatsapp/whatsapp-inbox.service";
import { productSearchOrClause, tokenizeProductQuery } from "../products/productSearch";
import { replyToEnquiryThread } from "../enquiries/enquiries.service";
import { WA_SESSION_WINDOW_MS } from "../whatsapp/whatsapp-inbox.service";
import { markChatPipelineQuotationSent } from "./chat-pipeline.service";
import {
  createQuotation,
  generateQuotePdfBuffer,
  getQuotation,
  markQuotationSent,
  updateQuotation
} from "../quotations/quotation.service";
import { suggestQuoteCharges } from "./quote-charges";
import {
  QUOTE_APPROVER_EMAILS,
  canApproveQuote,
  canSeeAllQuotes,
  currencyForDeliveryCountry,
  priceMinorForCurrency
} from "./quote-pricing";
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
  shippingInPaise?: number;
  packingInPaise?: number;
  threadId?: string | null;
};

type QuoteActor = { id: string; email: string; name?: string | null };

function httpError(message: string, statusCode: number) {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

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
  const shippingAddress = addressFor(input, "shipping");
  return {
    customerName: input.customerName,
    email: input.email || null,
    phone: input.phone ?? null,
    billingAddress: addressFor(input, "billing"),
    shippingAddress,
    shippingSameAsBilling: input.shippingSameAsBilling !== false,
    currency: currencyForDeliveryCountry(shippingAddress.country),
    shippingInPaise: Math.max(0, Math.floor(input.shippingInPaise ?? 0)),
    packingInPaise: Math.max(0, Math.floor(input.packingInPaise ?? 0)),
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
  subtotalInPaise?: number;
  discountInPaise?: number;
  shippingInPaise?: number;
  packingInPaise?: number;
  taxInPaise?: number;
  currency?: string;
  approvalStatus?: string;
  approvalNote?: string | null;
  submittedAt?: Date | null;
  decidedAt?: Date | null;
  decidedByEmail?: string | null;
  enquiryThreadId?: string | null;
  customerName?: string;
  billingAddress?: unknown;
  shippingAddress?: unknown;
  revisions?: Array<{
    id: string;
    revision: number;
    action: string;
    note: string | null;
    actorEmail: string | null;
    actorName: string | null;
    createdAt: Date;
  }>;
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
  convertedOrder?: { orderNumber: string } | null;
}) {
  return {
    id: quotation.id,
    quoteNumber: quotation.quoteNumber,
    status: quotation.status,
    grandTotalInPaise: quotation.grandTotalInPaise,
    subtotalInPaise: quotation.subtotalInPaise ?? 0,
    discountInPaise: quotation.discountInPaise ?? 0,
    shippingInPaise: quotation.shippingInPaise ?? 0,
    packingInPaise: quotation.packingInPaise ?? 0,
    taxInPaise: quotation.taxInPaise ?? 0,
    currency: quotation.currency ?? "INR",
    approvalStatus: quotation.approvalStatus ?? "NONE",
    approvalNote: quotation.approvalNote ?? null,
    submittedAt: quotation.submittedAt ?? null,
    decidedAt: quotation.decidedAt ?? null,
    decidedByEmail: quotation.decidedByEmail ?? null,
    enquiryThreadId: quotation.enquiryThreadId ?? null,
    revisions: (quotation.revisions ?? []).map((row) => ({
      id: row.id,
      revision: row.revision,
      action: row.action,
      note: row.note,
      actorEmail: row.actorEmail,
      actorName: row.actorName,
      createdAt: row.createdAt
    })),
    customerName: quotation.customerName ?? "",
    convertedOrderNumber: quotation.convertedOrder?.orderNumber ?? null,
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

export async function createSalesQuote(input: QuoteInput, actor: QuoteActor) {
  const created = await createQuotation(quoteBody(input));
  const linked = input.threadId
    ? await prisma.quotation.update({
        where: { id: created.id },
        data: { enquiryThreadId: input.threadId },
        include: { items: { orderBy: { sortOrder: "asc" } } }
      })
    : created;
  if (input.dealId) {
    await linkQuotation(input.dealId, created.id, actor);
  }
  await writeRevision(linked.id, "CREATED", actor, null);
  return present(linked);
}

export async function getSalesQuote(id: string, actor?: QuoteActor) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      revisions: { orderBy: { revision: "desc" } },
      convertedOrder: { select: { orderNumber: true } }
    }
  });
  if (!quotation) return null;
  if (actor && !(await actorCanViewQuote(actor, quotation))) {
    throw httpError("This quotation belongs to another owner", 403);
  }
  return present(quotation);
}

export async function updateSalesQuote(id: string, input: QuoteInput, actor: QuoteActor) {
  const existing = await getQuotation(id);
  if (!existing) return null;
  if (existing.convertedOrderId) {
    throw httpError("This quotation was converted to an order and cannot be edited", 400);
  }
  const updated = await updateQuotation(id, quoteBody(input), {
    returnToDraft: existing.status === "SENT"
  });
  await prisma.quotation.update({
    where: { id },
    data: {
      approvalStatus: "NONE",
      approvalNote: null,
      submittedAt: null,
      decidedAt: null,
      decidedByEmail: null,
      ...(input.threadId ? { enquiryThreadId: input.threadId } : {})
    }
  });
  await writeRevision(id, "UPDATED", actor, "Edited. Approval is required again before it can be shared.");
  return present({ ...updated, approvalStatus: "NONE", approvalNote: null });
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

export async function shareSalesQuote(id: string, threadId: string, actor: QuoteActor) {
  const existing = await prisma.quotation.findUnique({
    where: { id },
    select: { approvalStatus: true, status: true, convertedOrderId: true }
  });
  if (!existing) throw httpError("Quotation not found", 404);
  if (existing.convertedOrderId) {
    throw httpError("This quotation was converted to an order and cannot be shared", 400);
  }
  if (existing.approvalStatus !== "APPROVED") {
    throw httpError("Deepak, Arjun, or Partha must approve this quotation before it can be shared", 400);
  }
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
  await markQuotationSent(id);
  await markChatPipelineQuotationSent(threadId);
  await prisma.quotation.update({ where: { id }, data: { enquiryThreadId: threadId } });
  await writeRevision(id, "SENT", actor, null);
  return { shared: true, quoteNumber, delivery: closedWhatsApp ? "whatsapp_link" : "file" };
}

export async function listSalesQuotes(q: string, threadId?: string | null) {
  const needle = q.trim();
  const threadRaw = threadId?.trim() || "";
  const thread = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadRaw) ? threadRaw : "";
  if (needle.length < 3 && !thread) return [];
  const or: Prisma.QuotationWhereInput[] = [];
  if (thread) or.push({ enquiryThreadId: thread });
  if (needle.length >= 3) {
    or.push(
      { email: { contains: needle, mode: "insensitive" } },
      { phone: { contains: needle, mode: "insensitive" } },
      { customerName: { contains: needle, mode: "insensitive" } },
      { quoteNumber: { contains: needle, mode: "insensitive" } }
    );
  }
  const rows = await prisma.quotation.findMany({
    where: { OR: or },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { items: { orderBy: { sortOrder: "asc" } }, convertedOrder: { select: { orderNumber: true } } }
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
      rateInPaise: variant.saleInPaise || variant.mrpInPaise || 0,
      prices: {
        INR: priceMinorForCurrency(variant, "INR"),
        USD: priceMinorForCurrency(variant, "USD"),
        AED: priceMinorForCurrency(variant, "AED")
      }
    };
  });
}

export async function suggestSalesQuoteCharges(
  country: string,
  lines: Array<{ variantId: string; quantity: number }>
) {
  return suggestQuoteCharges(prisma, lines, country);
}

export async function submitSalesQuote(id: string, actor: QuoteActor) {
  const existing = await getQuotation(id);
  if (!existing) return null;
  if (existing.convertedOrderId) throw httpError("This quotation was converted to an order", 400);
  if (existing.status === "SENT") throw httpError("This quotation was already sent", 400);
  if (existing.approvalStatus === "PENDING") throw httpError("This quotation is already waiting for approval", 400);
  if (existing.approvalStatus === "APPROVED") {
    throw httpError("This quotation is already approved. Send it, or edit it to ask for approval again.", 400);
  }
  await prisma.quotation.update({
    where: { id },
    data: { approvalStatus: "PENDING", submittedAt: new Date(), approvalNote: null, decidedAt: null, decidedByEmail: null }
  });
  await writeRevision(id, "SUBMITTED", actor, null);
  const saved = await getSalesQuote(id);
  if (saved) void notifyQuoteApprovers(saved).catch((err) => logger.error("quote_approval_notify_failed", { id, err }));
  return saved;
}

export async function decideSalesQuote(
  id: string,
  decision: "APPROVED" | "REJECTED",
  note: string | null,
  actor: QuoteActor
) {
  if (!canApproveQuote(actor.email)) {
    throw httpError("Only Deepak or Arjun can approve quotations", 403);
  }
  const existing = await prisma.quotation.findUnique({ where: { id }, select: { approvalStatus: true } });
  if (!existing) return null;
  if (existing.approvalStatus !== "PENDING") {
    throw httpError("Only a quotation waiting for approval can be approved or rejected", 400);
  }
  const trimmed = note?.trim() || null;
  if (decision === "REJECTED" && !trimmed) {
    throw httpError("Add a note so the team knows what to change", 400);
  }
  await prisma.quotation.update({
    where: { id },
    data: {
      approvalStatus: decision,
      approvalNote: trimmed,
      decidedAt: new Date(),
      decidedByEmail: actor.email
    }
  });
  await writeRevision(id, decision, actor, trimmed);
  return getSalesQuote(id);
}

type QuoteOwnerRow = {
  id: string;
  enquiryThreadId: string | null;
  decidedByEmail?: string | null;
};

type ResolvedQuotePeople = {
  ownerEmail: string | null;
  ownerName: string | null;
  approvedByName: string | null;
};

function displayName(name: string | null | undefined, email: string | null | undefined): string | null {
  const named = name?.trim();
  if (named) return named;
  const local = email?.split("@")[0]?.trim();
  return local || null;
}

async function peopleForQuotes(rows: QuoteOwnerRow[]): Promise<Map<string, ResolvedQuotePeople>> {
  const threadIds = [...new Set(rows.map((row) => row.enquiryThreadId).filter((id): id is string => Boolean(id)))];
  const threads = threadIds.length
    ? await prisma.enquiryThread.findMany({
        where: { id: { in: threadIds } },
        select: { id: true, crmOwner: { select: { name: true, email: true } } }
      })
    : [];
  const ownerByThread = new Map(threads.map((thread) => [thread.id, thread.crmOwner]));
  const needsCreator = rows
    .filter((row) => {
      const owner = row.enquiryThreadId ? ownerByThread.get(row.enquiryThreadId) : null;
      return !owner?.email;
    })
    .map((row) => row.id);
  const created = needsCreator.length
    ? await prisma.quotationRevision.findMany({
        where: { quotationId: { in: needsCreator }, action: "CREATED" },
        orderBy: { revision: "asc" },
        select: { quotationId: true, actorEmail: true, actorName: true }
      })
    : [];
  const creatorByQuote = new Map<string, { actorEmail: string | null; actorName: string | null }>();
  for (const row of created) {
    if (!creatorByQuote.has(row.quotationId)) creatorByQuote.set(row.quotationId, row);
  }
  const decidedEmails = [
    ...new Set(rows.map((row) => row.decidedByEmail?.trim().toLowerCase()).filter((email): email is string => Boolean(email)))
  ];
  const deciders = decidedEmails.length
    ? await prisma.user.findMany({
        where: { email: { in: decidedEmails } },
        select: { email: true, name: true }
      })
    : [];
  const deciderByEmail = new Map(deciders.map((user) => [user.email.toLowerCase(), user.name]));
  const people = new Map<string, ResolvedQuotePeople>();
  for (const row of rows) {
    const threadOwner = row.enquiryThreadId ? ownerByThread.get(row.enquiryThreadId) : null;
    const creator = creatorByQuote.get(row.id);
    const ownerEmail = threadOwner?.email ?? creator?.actorEmail ?? null;
    const ownerName = displayName(threadOwner?.name ?? creator?.actorName, ownerEmail);
    const decided = row.decidedByEmail?.trim().toLowerCase() || null;
    people.set(row.id, {
      ownerEmail,
      ownerName,
      approvedByName: decided ? displayName(deciderByEmail.get(decided), decided) : null
    });
  }
  return people;
}

function actorOwnsQuote(actor: QuoteActor, people: ResolvedQuotePeople | undefined): boolean {
  const owner = people?.ownerEmail?.trim().toLowerCase() || "";
  return owner.length > 0 && owner === actor.email.trim().toLowerCase();
}

async function actorCanViewQuote(
  actor: QuoteActor,
  quote: { id: string; enquiryThreadId: string | null }
): Promise<boolean> {
  if (canSeeAllQuotes(actor.email)) return true;
  const people = await peopleForQuotes([quote]);
  return actorOwnsQuote(actor, people.get(quote.id));
}

async function visibleQuoteRows<T extends QuoteOwnerRow>(rows: T[], actor: QuoteActor): Promise<T[]> {
  if (canSeeAllQuotes(actor.email)) return rows;
  const people = await peopleForQuotes(rows);
  return rows.filter((row) => actorOwnsQuote(actor, people.get(row.id)));
}

function moneyLabel(minor: number, currency: string): string {
  const amount = (minor || 0) / 100;
  if (currency === "USD") return `USD ${amount.toFixed(2)}`;
  if (currency === "AED") return `AED ${amount.toFixed(2)}`;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

async function notifyQuoteApprovers(quote: {
  id: string;
  quoteNumber: string;
  customerName?: string;
  grandTotalInPaise: number;
  currency?: string;
}): Promise<void> {
  const approvers = await prisma.user.findMany({
    where: {
      email: { in: [...QUOTE_APPROVER_EMAILS] },
      deletedAt: null,
      adminQuoteNotificationsEnabled: true
    },
    select: { email: true, name: true, phone: true, fcmWebToken: true, pushNotificationsEnabled: true }
  });
  const who = quote.customerName?.trim() || "a customer";
  const body = `${quote.quoteNumber} for ${who} needs approval. Total ${moneyLabel(quote.grandTotalInPaise, quote.currency || "INR")}.`;
  await Promise.all(
    approvers.map(async (approver) => {
      const phone = toWhatsAppE164(approver.phone);
      if (phone) {
        try {
          await sendWhatsAppSessionText(phone, `Quotation approval\n${body}`);
        } catch (err) {
          logger.error("quote_approval_whatsapp_failed", { email: approver.email, err });
        }
      } else {
        logger.warn("quote_approval_whatsapp_skipped", { email: approver.email, reason: "no_phone" });
      }
      const token = approver.fcmWebToken?.trim();
      if (approver.pushNotificationsEnabled && token && isFirebaseConfigured()) {
        await sendPushNotification(token, "Quotation approval", body, {
          type: "quote",
          quoteId: quote.id,
          link: `/admin/quotations/${quote.id}`
        }, { platform: "web" }).catch((err) => logger.error("quote_approval_push_failed", { email: approver.email, err }));
      }
    })
  );
}

export async function listQuoteApprovals(
  status: "PENDING" | "APPROVED" | "REJECTED" | "ALL",
  actor: QuoteActor
) {
  const rows = await prisma.quotation.findMany({
    where: status === "ALL" ? { approvalStatus: { not: "NONE" } } : { approvalStatus: status },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  const seeAll = canSeeAllQuotes(actor.email);
  const visible = await visibleQuoteRows(rows, actor);
  const people = await peopleForQuotes(visible);
  const pendingRows = await prisma.quotation.findMany({
    where: { approvalStatus: "PENDING" },
    select: { id: true, enquiryThreadId: true }
  });
  const pendingVisible = await visibleQuoteRows(pendingRows, actor);
  return {
    pending: pendingVisible.length,
    seeAll,
    items: visible.map((row) => {
      const person = people.get(row.id);
      return {
        ...present(row),
        ...(seeAll ? { ownerName: person?.ownerName ?? null } : {}),
        approvedByName: person?.approvedByName ?? null
      };
    })
  };
}

export async function countPendingQuoteApprovals(actor: QuoteActor) {
  const pendingRows = await prisma.quotation.findMany({
    where: { approvalStatus: "PENDING" },
    select: { id: true, enquiryThreadId: true }
  });
  const pendingVisible = await visibleQuoteRows(pendingRows, actor);
  return { pending: pendingVisible.length };
}

async function writeRevision(quotationId: string, action: string, actor: QuoteActor, note: string | null) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  if (!quotation) return;
  const last = await prisma.quotationRevision.aggregate({
    where: { quotationId },
    _max: { revision: true }
  });
  const address = quotation.shippingAddress as { country?: string } | null;
  await prisma.quotationRevision.create({
    data: {
      quotationId,
      revision: (last._max.revision ?? 0) + 1,
      action,
      note,
      actorEmail: actor.email,
      actorName: actor.name ?? null,
      snapshot: {
        status: quotation.status,
        approvalStatus: quotation.approvalStatus,
        currency: quotation.currency,
        subtotalInPaise: quotation.subtotalInPaise,
        discountInPaise: quotation.discountInPaise,
        shippingInPaise: quotation.shippingInPaise,
        packingInPaise: quotation.packingInPaise,
        taxInPaise: quotation.taxInPaise,
        grandTotalInPaise: quotation.grandTotalInPaise,
        shippingCountry: address?.country ?? null,
        lines: quotation.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPriceInPaise: item.unitPriceInPaise,
          discountInPaise: item.discountInPaise
        }))
      } satisfies Prisma.InputJsonObject
    }
  });
}
