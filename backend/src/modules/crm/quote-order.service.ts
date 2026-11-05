import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { variantFulfillmentInputFromVariant, assertFulfillmentAllowed } from "../inventory/variant-fulfillment-availability";
import { confirmStockTx, reserveStockTx } from "../orders/orders.service";
import { generateOrderNumber, isOrderNumberUniqueViolation } from "../../utils/orderNumber";
import { CrmError, crmNotFound } from "./crm-errors";
import { receivedMinor } from "./lead-payment";
import { quoteOrderDecision, type QuoteOrderMode } from "./quote-order";

type Actor = { id: string; email: string; name: string | null };

type AddressJson = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addressFrom(raw: unknown, fallbackName: string, fallbackPhone: string): AddressJson {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const country = (text(row.country) || "IN").toUpperCase();
  return {
    fullName: text(row.fullName) || fallbackName || "Customer",
    phone: text(row.phone) || fallbackPhone,
    line1: text(row.line1),
    line2: text(row.line2) || null,
    city: text(row.city),
    state: text(row.state),
    postalCode: text(row.postalCode),
    country
  };
}

function zoneFor(country: string): string {
  if (country === "IN" || country === "IND" || country === "INDIA") return "IN";
  if (country === "US" || country === "USA") return "US";
  if (country === "GB" || country === "UK") return "GB";
  return "OTHER";
}

function money(minor: number, currency: string): string {
  const major = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === "USD") return `$${major}`;
  if (currency === "AED") return `AED ${major}`;
  return `₹${major}`;
}

export async function convertQuoteToOrder(quoteId: string, threadId: string, actor: Actor) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quoteId },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  if (!quotation) throw crmNotFound("Quotation");
  if (quotation.approvalStatus !== "APPROVED") {
    throw new CrmError("Approve the quotation before creating an order", "NOT_APPROVED", 400);
  }
  if (quotation.convertedOrderId) {
    throw new CrmError("This quotation already has an order", "ALREADY_CONVERTED", 400);
  }
  if (quotation.enquiryThreadId && quotation.enquiryThreadId !== threadId) {
    throw new CrmError("This quotation belongs to another chat", "WRONG_CHAT", 400);
  }
  if (quotation.items.length === 0) {
    throw new CrmError("Add items before creating an order", "NO_ITEMS", 400);
  }

  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true, orderNumber: true, customerEmail: true, customerPhone: true, waPhone: true }
  });
  if (!thread) throw crmNotFound("Chat");
  if (thread.orderNumber) {
    throw new CrmError(`This chat is already linked to ${thread.orderNumber}`, "ORDER_EXISTS", 400);
  }

  const payment = await prisma.crmLeadPayment.findUnique({
    where: { enquiryThreadId: threadId },
    include: { receipts: true }
  });
  if (payment?.quotationId && payment.quotationId !== quotation.id) {
    throw new CrmError("The payment on this chat belongs to another quotation", "PAYMENT_MISMATCH", 400);
  }
  const received = payment ? receivedMinor(payment.receipts) : 0;
  const total = payment?.totalInPaise ?? quotation.grandTotalInPaise;
  const decision = quoteOrderDecision({
    method: payment?.method ?? "PREPAID",
    received,
    total,
    dueAt: payment?.dueAt ?? null
  });
  if (!decision.ok) throw new CrmError(decision.message, "PAYMENT_REQUIRED", 400);

  const ship = addressFrom(quotation.shippingAddress, quotation.customerName, quotation.phone || thread.customerPhone || thread.waPhone || "");
  const bill = addressFrom(quotation.billingAddress, ship.fullName, ship.phone);
  if (!ship.line1 || !ship.city || !ship.country) {
    throw new CrmError("Add a shipping address on the quotation before creating the order", "ADDRESS_REQUIRED", 400);
  }
  const email = (quotation.email || thread.customerEmail || "").trim().toLowerCase();
  const phone = ship.phone || quotation.phone || thread.customerPhone || thread.waPhone || "";
  if (!email || !phone) {
    throw new CrmError("The quotation needs an email and a phone before it can become an order", "CONTACT_REQUIRED", 400);
  }

  const variantIds = quotation.items.map((item) => item.variantId).filter((id): id is string => Boolean(id));
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, dropShipEnabled: true, inventory: { select: { onHand: true, reserved: true } } }
  });
  const variantById = new Map(variants.map((row) => [row.id, row]));
  const short: string[] = [];
  for (const item of quotation.items) {
    if (!item.variantId) continue;
    const variant = variantById.get(item.variantId);
    if (!variant?.inventory) continue;
    const available = Math.max(0, variant.inventory.onHand - variant.inventory.reserved);
    if (available < item.quantity) short.push(item.sku || item.productName);
  }

  let created: { id: string; orderNumber: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = await generateOrderNumber();
    try {
      created = await prisma.$transaction(async (tx) => {
        const order = await insertOrder(tx, {
          orderNumber,
          quotation,
          email,
          phone,
          ship,
          bill,
          mode: decision.mode,
          balance: Math.max(0, total - received),
          short
        });
        if (short.length === 0) {
          if (decision.mode === "HOLD") await reserveStockTx(tx, order.id);
          else await confirmStockTx(tx, order.id);
        }
        await tx.quotation.update({
          where: { id: quotation.id },
          data: {
            status: "CONVERTED",
            convertedOrderId: order.id,
            convertedAt: new Date(),
            enquiryThreadId: threadId
          }
        });
        await tx.enquiryThread.update({
          where: { id: threadId },
          data: { orderNumber: order.orderNumber }
        });
        if (payment) {
          await tx.crmLeadPayment.update({
            where: { id: payment.id },
            data: { orderId: order.id, quotationId: quotation.id }
          });
        }
        return order;
      });
      break;
    } catch (err) {
      if (!isOrderNumberUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  if (!created) throw new CrmError("Could not create the order", "ORDER_FAILED", 500);

  logger.info("quote_converted_to_order", {
    quoteNumber: quotation.quoteNumber,
    orderNumber: created.orderNumber,
    mode: decision.mode,
    stockReduced: short.length === 0,
    actor: actor.email
  });
  return {
    orderId: created.id,
    orderNumber: created.orderNumber,
    mode: decision.mode,
    stockReduced: short.length === 0
  };
}

async function insertOrder(
  tx: Prisma.TransactionClient,
  input: {
    orderNumber: string;
    quotation: {
      id: string;
      quoteNumber: string;
      customerId: string | null;
      currency: string;
      subtotalInPaise: number;
      discountInPaise: number;
      shippingInPaise: number;
      packingInPaise: number;
      grandTotalInPaise: number;
      items: Array<{
        variantId: string | null;
        productName: string;
        sku: string | null;
        quantity: number;
        unitPriceInPaise: number;
        discountInPaise: number;
        taxInPaise: number;
        lineTotalInPaise: number;
      }>;
    };
    email: string;
    phone: string;
    ship: AddressJson;
    bill: AddressJson;
    mode: QuoteOrderMode;
    balance: number;
    short: string[];
  }
) {
  const packingNote =
    input.quotation.packingInPaise > 0
      ? ` Packing ${money(input.quotation.packingInPaise, input.quotation.currency)} is included in shipping.`
      : "";
  const stockNote =
    input.short.length > 0 ? ` Stock was not reduced because ${input.short.join(", ")} had too little on hand.` : "";
  const order = await tx.order.create({
    data: {
      orderNumber: input.orderNumber,
      customerId: input.quotation.customerId,
      email: input.email,
      phone: input.phone,
      status: input.mode === "HOLD" ? "PENDING_PAYMENT" : "PAID",
      paymentStatus: input.mode === "PAID" ? "CAPTURED" : "PENDING",
      currency: input.quotation.currency,
      subtotalInPaise: input.quotation.subtotalInPaise,
      discountInPaise: input.quotation.discountInPaise,
      shippingInPaise: input.quotation.shippingInPaise + input.quotation.packingInPaise,
      taxInPaise: 0,
      grandTotalInPaise: input.quotation.grandTotalInPaise,
      shippingZone: zoneFor(input.ship.country),
      placedAt: input.mode === "HOLD" ? null : new Date(),
      notes: `Quotation ${input.quotation.quoteNumber}.${packingNote}${stockNote}`.trim()
    }
  });

  for (const item of input.quotation.items) {
    let warehouseFulfillmentQty = item.variantId ? item.quantity : 0;
    let dropShipFulfillmentQty = 0;
    if (item.variantId && input.short.length > 0) {
      warehouseFulfillmentQty = 0;
      dropShipFulfillmentQty = item.quantity;
    } else if (item.variantId) {
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        select: { dropShipEnabled: true, inventory: { select: { onHand: true, reserved: true } } }
      });
      if (variant) {
        const allocation = assertFulfillmentAllowed(variantFulfillmentInputFromVariant(variant), item.quantity);
        warehouseFulfillmentQty = allocation.warehouseFulfillmentQty;
        dropShipFulfillmentQty = allocation.dropShipFulfillmentQty;
      }
    }
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        variantId: item.variantId,
        skuSnapshot: item.sku || "QUOTE",
        nameSnapshot: item.productName,
        qtyOrdered: item.quantity,
        warehouseFulfillmentQty,
        dropShipFulfillmentQty,
        unitPriceInPaise: item.unitPriceInPaise,
        discountInPaise: item.discountInPaise,
        taxInPaise: item.taxInPaise,
        lineTotalInPaise: item.lineTotalInPaise
      }
    });
  }

  for (const [type, address] of [
    ["SHIPPING", input.ship],
    ["BILLING", input.bill]
  ] as const) {
    await tx.orderAddress.create({
      data: {
        orderId: order.id,
        type,
        fullName: address.fullName,
        phone: address.phone,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state || "—",
        postalCode: address.postalCode || "000000",
        country: address.country
      }
    });
  }

  if (input.mode === "COD" && input.balance > 0) {
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "COD",
        amountInPaise: input.balance,
        currency: input.quotation.currency,
        status: "PENDING",
        rawPayload: { source: "quotation", quoteNumber: input.quotation.quoteNumber }
      }
    });
  }

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: input.mode === "HOLD" ? "PENDING_PAYMENT" : "PAID",
      reason: `Created from quotation ${input.quotation.quoteNumber}`
    }
  });

  return { id: order.id, orderNumber: order.orderNumber };
}
