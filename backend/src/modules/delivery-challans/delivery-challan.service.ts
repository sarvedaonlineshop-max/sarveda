import type {
  DeliveryChallan,
  DeliveryChallanItem,
  DeliveryChallanReason,
  Prisma
} from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { downloadPdfFromS3, s3KeyFromStoredUrl, uploadPdf } from "../../config/s3";
import { gstFromInclusiveLine, gstRatePercent } from "../../utils/gst";
import { resolveSellerGstIdentity } from "../../utils/gst-state";
import {
  generateChallanNumber,
  isChallanNumberUniqueViolation
} from "./challan-number";
import type { GenerateDeliveryChallanBody } from "./challan.schemas";
import {
  buildDeliveryChallanPdf,
  type DeliveryChallanPdfInput
} from "./delivery-challan-pdf";

export type DeliveryChallanWithItems = DeliveryChallan & { items: DeliveryChallanItem[] };

type AddrJson = {
  fullName: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const REASON_LABELS: Record<DeliveryChallanReason, string> = {
  SUPPLY_DELIVERY: "Supply / delivery",
  JOB_WORK: "Job work",
  SAMPLE: "Sample",
  REPLACEMENT: "Replacement",
  RETURN: "Return",
  OTHER: "Other"
};

function serviceError(message: string, statusCode: number, code: string): Error & {
  statusCode: number;
  code: string;
} {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function sanitizeText(raw: string | null | undefined, max: number): string | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[<>]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function addrToJson(a: {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): AddrJson {
  return {
    fullName: sanitizeText(a.fullName, 200) ?? "",
    phone: sanitizeText(a.phone, 20),
    line1: sanitizeText(a.line1, 300) ?? "",
    line2: sanitizeText(a.line2, 300),
    city: sanitizeText(a.city, 120) ?? "",
    state: sanitizeText(a.state, 120) ?? "",
    postalCode: sanitizeText(a.postalCode, 20) ?? "",
    country: (a.country || "IN").toUpperCase().slice(0, 2)
  };
}

function parseAddr(raw: unknown): AddrJson {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<AddrJson>;
  return {
    fullName: o.fullName ?? "",
    phone: o.phone ?? null,
    line1: o.line1 ?? "",
    line2: o.line2 ?? null,
    city: o.city ?? "",
    state: o.state ?? "",
    postalCode: o.postalCode ?? "",
    country: o.country ?? "IN"
  };
}

function reasonLabel(reason: DeliveryChallanReason, reasonOther: string | null): string {
  if (reason === "OTHER" && reasonOther?.trim()) {
    return `Other — ${reasonOther.trim()}`;
  }
  return REASON_LABELS[reason];
}

async function loadOrderForChallan(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            include: {
              productRel: { select: { taxClass: true, hsnCode: true } }
            }
          },
          digitalOffer: { select: { taxClass: true } }
        }
      },
      addresses: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      shipments: { orderBy: { createdAt: "desc" } },
      deliveryChallan: { include: { items: { orderBy: { sortOrder: "asc" } } } },
      customer: { select: { name: true } }
    }
  });
}

function assertChallanEligible(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForChallan>>>
): void {
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    throw serviceError("Cannot create delivery challan for cancelled/refunded order", 400, "ORDER_NOT_ELIGIBLE");
  }
  if (order.status === "PENDING_PAYMENT" && order.paymentStatus === "PENDING") {
    const isCod = order.payments?.some((p) => p.provider === "COD") ?? false;
    if (!isCod) {
      throw serviceError(
        "Order must be paid (or COD) before generating a delivery challan",
        400,
        "ORDER_NOT_ELIGIBLE"
      );
    }
  }
  const shipping = order.addresses.find((a) => a.type === "SHIPPING");
  if (!shipping) {
    throw serviceError("Order is missing a shipping address", 400, "MISSING_SHIPPING_ADDRESS");
  }
  if (!order.items.length) {
    throw serviceError("Order has no line items", 400, "NO_ITEMS");
  }
}

function pickShipment(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForChallan>>>
): { id: string; courier: string; awb: string | null; trackingUrl: string | null } | null {
  const withAwb = order.shipments.find((s) => s.awb?.trim());
  const first = withAwb ?? order.shipments[0] ?? null;
  if (!first) return null;
  return {
    id: first.id,
    courier: first.courier,
    awb: first.awb?.trim() || null,
    trackingUrl: first.trackingUrl?.trim() || null
  };
}

function buildLineSnapshots(
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForChallan>>>
) {
  const defaultHsn = process.env.DEFAULT_HSN_CODE?.trim() || "9205";
  const shipCountry =
    order.addresses.find((a) => a.type === "SHIPPING")?.country.trim().toUpperCase() ?? "IN";
  const isInrDomestic = shipCountry === "IN" && order.currency.toUpperCase() === "INR";

  let taxableSum = 0;
  const lines = order.items.map((row, idx) => {
    const taxClass = row.variant?.productRel.taxClass ?? row.digitalOffer?.taxClass ?? "gst-5";
    const rate = isInrDomestic ? gstRatePercent(taxClass) : 0;
    const { taxableMinor } = isInrDomestic
      ? gstFromInclusiveLine(row.lineTotalInPaise, rate)
      : { taxableMinor: row.lineTotalInPaise };
    taxableSum += taxableMinor;
    return {
      orderItemId: row.id,
      productName: sanitizeText(row.nameSnapshot, 500) ?? "Item",
      sku: sanitizeText(row.skuSnapshot, 120),
      hsnCode: sanitizeText(row.variant?.productRel.hsnCode, 20) ?? defaultHsn,
      quantity: row.qtyOrdered,
      unitPriceInPaise: row.unitPriceInPaise,
      lineTotalInPaise: row.lineTotalInPaise,
      taxableInPaise: taxableMinor,
      sortOrder: idx
    };
  });

  return {
    lines,
    taxableValueInPaise: taxableSum,
    grandTotalInPaise: order.grandTotalInPaise,
    showValueColumns: true
  };
}

function toPdfInput(challan: DeliveryChallanWithItems): DeliveryChallanPdfInput {
  return {
    challanNumber: challan.challanNumber,
    challanDate: challan.challanDate,
    orderNumber: challan.orderNumberSnapshot,
    reasonLabel: reasonLabel(challan.reason, challan.reasonOther),
    notes: challan.notes,
    buyerName: challan.buyerName,
    buyerEmail: challan.buyerEmail,
    buyerPhone: challan.buyerPhone,
    buyerGstin: challan.buyerGstin,
    consigneeAddress: parseAddr(challan.consigneeAddress),
    billToAddress: challan.billToAddress ? parseAddr(challan.billToAddress) : null,
    originState: challan.originState,
    originCountry: challan.originCountry,
    destinationState: challan.destinationState,
    destinationCountry: challan.destinationCountry,
    currency: challan.currency,
    items: challan.items.map((i) => ({
      productName: i.productName,
      sku: i.sku,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPriceInPaise: i.unitPriceInPaise,
      lineTotalInPaise: i.lineTotalInPaise
    })),
    taxableValueInPaise: challan.taxableValueInPaise,
    grandTotalInPaise: challan.grandTotalInPaise,
    carrier: challan.carrierSnapshot,
    awb: challan.awbSnapshot,
    trackingUrl: challan.trackingUrlSnapshot,
    showValueColumns: true
  };
}

async function persistPdf(challan: DeliveryChallanWithItems, orderNumber: string): Promise<Buffer> {
  const pdf = await buildDeliveryChallanPdf(toPdfInput(challan));
  const safeNo = challan.challanNumber.replace(/\//g, "-");
  const key = `delivery-challans/${orderNumber}/${safeNo}.pdf`;
  const uploaded = await uploadPdf(key, pdf);
  await prisma.deliveryChallan.update({
    where: { id: challan.id },
    data: { pdfUrl: uploaded ?? `local://${key}` }
  });
  return pdf;
}

export function serializeChallan(challan: DeliveryChallanWithItems) {
  return {
    id: challan.id,
    challanNumber: challan.challanNumber,
    orderId: challan.orderId,
    challanDate: challan.challanDate.toISOString(),
    reason: challan.reason,
    reasonOther: challan.reasonOther,
    reasonLabel: reasonLabel(challan.reason, challan.reasonOther),
    status: challan.status,
    notes: challan.notes,
    orderNumber: challan.orderNumberSnapshot,
    currency: challan.currency,
    buyerName: challan.buyerName,
    buyerEmail: challan.buyerEmail,
    buyerPhone: challan.buyerPhone,
    buyerGstin: challan.buyerGstin,
    consigneeAddress: parseAddr(challan.consigneeAddress),
    billToAddress: challan.billToAddress ? parseAddr(challan.billToAddress) : null,
    originState: challan.originState,
    destinationState: challan.destinationState,
    destinationCountry: challan.destinationCountry,
    destinationPincode: challan.destinationPincode,
    carrier: challan.carrierSnapshot,
    awb: challan.awbSnapshot,
    trackingUrl: challan.trackingUrlSnapshot,
    taxableValueInPaise: challan.taxableValueInPaise,
    grandTotalInPaise: challan.grandTotalInPaise,
    pdfUrl: challan.pdfUrl,
    issuedAt: challan.issuedAt.toISOString(),
    downloadUrl: `/api/admin/orders/${challan.orderId}/delivery-challan/download`,
    items: challan.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      sku: i.sku,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPriceInPaise: i.unitPriceInPaise,
      lineTotalInPaise: i.lineTotalInPaise,
      taxableInPaise: i.taxableInPaise
    }))
  };
}

export async function getDeliveryChallanForOrder(orderId: string) {
  const row = await prisma.deliveryChallan.findUnique({
    where: { orderId },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  return row;
}

/**
 * Create delivery challan for an order (idempotent: returns existing unless refreshShipment).
 * Never posts accounting / GST / payment / stock.
 */
export async function generateDeliveryChallan(
  orderId: string,
  body: GenerateDeliveryChallanBody
): Promise<{ challan: DeliveryChallanWithItems; created: boolean; pdf: Buffer }> {
  const order = await loadOrderForChallan(orderId);
  if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");
  assertChallanEligible(order);

  if (order.deliveryChallan && !body.refreshShipment) {
    const existing = order.deliveryChallan;
    let pdf: Buffer | null = null;
    if (existing.pdfUrl?.startsWith("http")) {
      const key = s3KeyFromStoredUrl(existing.pdfUrl);
      if (key) pdf = await downloadPdfFromS3(key);
    }
    if (!pdf) {
      pdf = await persistPdf(existing, order.orderNumber);
    }
    return { challan: existing, created: false, pdf };
  }

  if (order.deliveryChallan && body.refreshShipment) {
    return refreshShipmentAndPdf(order.deliveryChallan, order, body);
  }

  const shipping = order.addresses.find((a) => a.type === "SHIPPING")!;
  const billing = order.addresses.find((a) => a.type === "BILLING") ?? null;
  const consignee = addrToJson(shipping);
  const billTo = billing ? addrToJson(billing) : null;
  const shipment = pickShipment(order);
  const { lines, taxableValueInPaise, grandTotalInPaise } = buildLineSnapshots(order);

  const seller = resolveSellerGstIdentity();
  const originState = seller.ok
    ? seller.sellerStateRaw
    : (process.env.SELLER_STATE?.trim() || "Karnataka");

  const buyerName =
    sanitizeText(order.customer?.name, 200) ||
    sanitizeText(consignee.fullName, 200) ||
    sanitizeText(order.email, 200) ||
    "Customer";

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const challanNumber = await generateChallanNumber();
      const created = await prisma.deliveryChallan.create({
        data: {
          challanNumber,
          orderId: order.id,
          challanDate: new Date(),
          reason: body.reason,
          reasonOther: body.reason === "OTHER" ? sanitizeText(body.reasonOther, 200) : null,
          notes: sanitizeText(body.notes, 4000),
          orderNumberSnapshot: order.orderNumber,
          currency: order.currency,
          buyerName,
          buyerEmail: sanitizeText(order.email, 200),
          buyerPhone: sanitizeText(order.phone, 20) || sanitizeText(consignee.phone, 20),
          buyerGstin: body.buyerGstin,
          consigneeAddress: consignee as Prisma.InputJsonValue,
          billToAddress: (billTo as Prisma.InputJsonValue) ?? undefined,
          originState,
          originCountry: "IN",
          destinationState: consignee.state,
          destinationCountry: consignee.country,
          destinationPincode: consignee.postalCode,
          shipmentId: shipment?.id ?? null,
          carrierSnapshot: shipment?.courier ?? null,
          awbSnapshot: shipment?.awb ?? null,
          trackingUrlSnapshot: shipment?.trackingUrl ?? null,
          taxableValueInPaise,
          grandTotalInPaise,
          items: {
            create: lines.map((l) => ({
              orderItemId: l.orderItemId,
              productName: l.productName,
              sku: l.sku,
              hsnCode: l.hsnCode,
              quantity: l.quantity,
              unitPriceInPaise: l.unitPriceInPaise,
              lineTotalInPaise: l.lineTotalInPaise,
              taxableInPaise: l.taxableInPaise,
              sortOrder: l.sortOrder
            }))
          }
        },
        include: { items: { orderBy: { sortOrder: "asc" } } }
      });

      const pdf = await persistPdf(created, order.orderNumber);
      logger.info("delivery_challan_generated", {
        orderId: order.id,
        orderNumber: order.orderNumber,
        challanNumber: created.challanNumber,
        awb: created.awbSnapshot
      });
      return { challan: created, created: true, pdf };
    } catch (err) {
      if (isChallanNumberUniqueViolation(err) || (err as { code?: string }).code === "P2002") {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
        continue;
      }
      throw err;
    }
  }
  throw serviceError("Failed to create delivery challan", 500, "CHALLAN_CREATE_FAILED");
}

async function refreshShipmentAndPdf(
  existing: DeliveryChallanWithItems,
  order: NonNullable<Awaited<ReturnType<typeof loadOrderForChallan>>>,
  body: GenerateDeliveryChallanBody
): Promise<{ challan: DeliveryChallanWithItems; created: boolean; pdf: Buffer }> {
  if (existing.status === "CANCELLED") {
    throw serviceError("Delivery challan is cancelled", 400, "CHALLAN_CANCELLED");
  }
  const shipment = pickShipment(order);
  const updated = await prisma.deliveryChallan.update({
    where: { id: existing.id },
    data: {
      reason: body.reason ?? existing.reason,
      reasonOther:
        (body.reason ?? existing.reason) === "OTHER"
          ? sanitizeText(body.reasonOther ?? existing.reasonOther, 200)
          : null,
      notes: body.notes !== undefined ? sanitizeText(body.notes, 4000) : existing.notes,
      buyerGstin: body.buyerGstin !== undefined ? body.buyerGstin : existing.buyerGstin,
      shipmentId: shipment?.id ?? null,
      carrierSnapshot: shipment?.courier ?? null,
      awbSnapshot: shipment?.awb ?? null,
      trackingUrlSnapshot: shipment?.trackingUrl ?? null
    },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  const pdf = await persistPdf(updated, order.orderNumber);
  logger.info("delivery_challan_shipment_refreshed", {
    orderId: order.id,
    challanNumber: updated.challanNumber,
    awb: updated.awbSnapshot
  });
  return { challan: updated, created: false, pdf };
}

export async function downloadDeliveryChallanPdf(
  orderId: string
): Promise<{ pdf: Buffer; challanNumber: string } | null> {
  const challan = await getDeliveryChallanForOrder(orderId);
  if (!challan) return null;

  let pdf: Buffer | null = null;
  if (challan.pdfUrl?.startsWith("http")) {
    const key = s3KeyFromStoredUrl(challan.pdfUrl);
    if (key) pdf = await downloadPdfFromS3(key);
  }
  if (!pdf) {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      select: { orderNumber: true }
    });
    if (!order) return null;
    pdf = await persistPdf(challan, order.orderNumber);
  }
  return { pdf, challanNumber: challan.challanNumber };
}
