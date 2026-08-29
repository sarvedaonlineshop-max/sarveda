import type {
  EWayBill,
  EWayBillItem,
  EWayBillSourceDocumentType,
  EWayBillTransportMode
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { isPlausibleGstin } from "../accounting/vendor-bill-journal.builder";
import {
  buildInvoiceInputFromOrder,
  loadOrderForInvoice
} from "../invoices/invoice.service";
import { formatDisplayInvoiceNo } from "../../utils/invoice";
import { isInterState } from "../../utils/gst";
import { resolveSellerGstIdentity } from "../../utils/gst-state";
import type {
  EwayPrepareBody,
  EwayRecordEbnBody,
  EwayUpdateTransportBody
} from "./eway-bill.schemas";

export type EWayBillWithItems = EWayBill & { items: EWayBillItem[] };

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
  const cleaned = String(raw).replace(/[<>]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function sellerDispatch() {
  const address =
    process.env.SELLER_ADDRESS?.trim() ||
    "Plot No. B, Part 2, RASUDHI WAREHOUSE\nKIADB Industrial Housing Layout, Hebbal 2nd stage\nMysore Karnataka 570016\nIndia";
  const seller = resolveSellerGstIdentity();
  return {
    legalName: process.env.SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited",
    gstin: process.env.SELLER_GSTIN?.trim() || "29ABFCS0538N1ZV",
    addressLines: address.split(/\n+/).map((l) => l.trim()).filter(Boolean),
    state: seller.ok ? seller.sellerStateRaw : process.env.SELLER_STATE?.trim() || "Karnataka",
    postalCode: process.env.SELLER_PINCODE?.trim() || null
  };
}

type LineSnap = {
  orderItemId: string | null;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unitOfMeasure: string;
  taxableValueInPaise: number;
  gstRatePercent: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  cessInPaise: number;
  lineTotalInPaise: number;
  sortOrder: number;
};

export type EwayReviewPack = {
  sourceDocumentType: EWayBillSourceDocumentType;
  sourceInvoiceId: string | null;
  sourceDeliveryChallanId: string | null;
  sourceDocumentNumber: string;
  sourceDocumentDate: string;
  documentValueInPaise: number;
  taxableValueInPaise: number;
  currency: string;
  interState: boolean;
  supplier: ReturnType<typeof sellerDispatch> & {
    dispatchFromPickup: boolean;
    pickupLabel: string | null;
  };
  recipient: {
    name: string;
    gstin: string | null;
    gstinStatus: "PROVIDED" | "URP" | "INVALID";
    phone: string | null;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<
    LineSnap & {
      fields: {
        unitOfMeasure: "AUTO_FILLED" | "NEEDS_CONFIRMATION";
        hsnCode: "AUTO_FILLED" | "MISSING";
      };
    }
  >;
  transport: {
    shipmentId: string | null;
    transporterName: string | null;
    transporterId: string | null;
    transportDocNo: string | null;
    transportDocDate: string | null;
    transportMode: EWayBillTransportMode | null;
    vehicleNumber: string | null;
    vehicleType: string | null;
    approxDistanceKm: number | null;
    fieldStatus: Record<string, "AUTO_FILLED" | "NEEDS_CONFIRMATION" | "MISSING">;
  };
  hints: {
    eligibilityCopy: string;
    likelyNotRequired: boolean;
    missingCritical: string[];
  };
};

async function loadOrderBundle(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      invoice: true,
      deliveryChallan: { include: { items: { orderBy: { sortOrder: "asc" } } } },
      addresses: true,
      shipments: {
        orderBy: { createdAt: "desc" },
        include: { pickupLocation: true }
      },
      items: {
        include: {
          variant: { include: { productRel: { select: { taxClass: true, hsnCode: true } } } },
          pickupLocation: true
        }
      },
      ewayBills: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "desc" }
      },
      customer: { select: { name: true } }
    }
  });
}

function pickShipment(order: NonNullable<Awaited<ReturnType<typeof loadOrderBundle>>>) {
  return order.shipments.find((s) => s.awb?.trim()) ?? order.shipments[0] ?? null;
}

function applyItemOverrides(
  lines: LineSnap[],
  overrides?: Array<{ sortOrder: number; unitOfMeasure?: string }>
): LineSnap[] {
  if (!overrides?.length) return lines;
  const map = new Map(overrides.map((o) => [o.sortOrder, o]));
  return lines.map((l) => {
    const o = map.get(l.sortOrder);
    if (!o?.unitOfMeasure?.trim()) return l;
    return { ...l, unitOfMeasure: sanitizeText(o.unitOfMeasure, 20) ?? "NOS" };
  });
}

function splitTax(taxMinor: number, interState: boolean): { cgst: number; sgst: number; igst: number } {
  if (interState) return { cgst: 0, sgst: 0, igst: taxMinor };
  const half = Math.floor(taxMinor / 2);
  return { cgst: half, sgst: taxMinor - half, igst: 0 };
}

async function buildLinesFromTaxInvoice(orderId: string) {
  const order = await loadOrderForInvoice(orderId);
  if (!order?.invoice) return null;
  const input = buildInvoiceInputFromOrder(order);
  if (!input) return null;

  const interState = input.interState;
  const lines: LineSnap[] = input.items.map((row, idx) => {
    const split = splitTax(row.taxMinor, interState);
    return {
      orderItemId: order.items[idx]?.id ?? null,
      productName: sanitizeText(row.name, 500) ?? "Item",
      sku: sanitizeText(row.sku, 120),
      hsnCode: sanitizeText(row.hsn, 20),
      quantity: row.qty,
      unitOfMeasure: "NOS",
      taxableValueInPaise: row.taxableMinor,
      gstRatePercent: row.gstRatePercent,
      cgstInPaise: split.cgst,
      sgstInPaise: split.sgst,
      igstInPaise: split.igst,
      cessInPaise: 0,
      lineTotalInPaise: row.lineTotalInPaise,
      sortOrder: idx
    };
  });

  return {
    lines,
    documentValueInPaise: order.grandTotalInPaise,
    taxableValueInPaise: lines.reduce((s, l) => s + l.taxableValueInPaise, 0),
    interState,
    currency: order.currency,
    invoiceId: order.invoice.id,
    documentNumber: formatDisplayInvoiceNo(order.orderNumber, order.invoice.issuedAt),
    documentDate: order.invoice.issuedAt
  };
}

function buildLinesFromChallan(order: NonNullable<Awaited<ReturnType<typeof loadOrderBundle>>>) {
  const dc = order.deliveryChallan;
  if (!dc) return null;
  const ship = order.addresses.find((a) => a.type === "SHIPPING");
  const interState = ship
    ? isInterState(ship.state, ship.country)
    : dc.destinationState
      ? isInterState(dc.destinationState, dc.destinationCountry || "IN")
      : true;

  const lines: LineSnap[] = dc.items.map((row, idx) => {
    const taxMinor = Math.max(0, row.lineTotalInPaise - row.taxableInPaise);
    const rate =
      row.taxableInPaise > 0 && taxMinor > 0
        ? Math.round((taxMinor * 100) / row.taxableInPaise)
        : 0;
    const split = splitTax(taxMinor, interState);
    return {
      orderItemId: row.orderItemId,
      productName: sanitizeText(row.productName, 500) ?? "Item",
      sku: sanitizeText(row.sku, 120),
      hsnCode: sanitizeText(row.hsnCode, 20),
      quantity: row.quantity,
      unitOfMeasure: "NOS",
      taxableValueInPaise: row.taxableInPaise,
      gstRatePercent: rate,
      cgstInPaise: split.cgst,
      sgstInPaise: split.sgst,
      igstInPaise: split.igst,
      cessInPaise: 0,
      lineTotalInPaise: row.lineTotalInPaise,
      sortOrder: idx
    };
  });

  return {
    lines,
    documentValueInPaise: dc.grandTotalInPaise,
    taxableValueInPaise:
      dc.taxableValueInPaise || lines.reduce((s, l) => s + l.taxableValueInPaise, 0),
    interState,
    currency: dc.currency,
    challanId: dc.id,
    documentNumber: dc.challanNumber,
    documentDate: dc.challanDate,
    buyerGstin: dc.buyerGstin
  };
}

export async function buildEwayReviewPack(
  orderId: string,
  sourceDocumentType: EWayBillSourceDocumentType
): Promise<EwayReviewPack> {
  const order = await loadOrderBundle(orderId);
  if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

  let lines: LineSnap[] = [];
  let documentValueInPaise = 0;
  let taxableValueInPaise = 0;
  let interState = false;
  let currency = order.currency;
  let sourceInvoiceId: string | null = null;
  let sourceDeliveryChallanId: string | null = null;
  let sourceDocumentNumber = "";
  let sourceDocumentDate = new Date();
  let prefillBuyerGstin: string | null = null;

  if (sourceDocumentType === "TAX_INVOICE") {
    const built = await buildLinesFromTaxInvoice(orderId);
    if (!built) {
      throw serviceError("Tax Invoice not available for this order", 400, "SOURCE_UNAVAILABLE");
    }
    lines = built.lines;
    documentValueInPaise = built.documentValueInPaise;
    taxableValueInPaise = built.taxableValueInPaise;
    interState = built.interState;
    currency = built.currency;
    sourceInvoiceId = built.invoiceId;
    sourceDocumentNumber = built.documentNumber;
    sourceDocumentDate = built.documentDate;
  } else if (sourceDocumentType === "DELIVERY_CHALLAN") {
    const built = buildLinesFromChallan(order);
    if (!built) {
      throw serviceError("Delivery Challan not available for this order", 400, "SOURCE_UNAVAILABLE");
    }
    lines = built.lines;
    documentValueInPaise = built.documentValueInPaise;
    taxableValueInPaise = built.taxableValueInPaise;
    interState = built.interState;
    currency = built.currency;
    sourceDeliveryChallanId = built.challanId;
    sourceDocumentNumber = built.documentNumber;
    sourceDocumentDate = built.documentDate;
    prefillBuyerGstin = built.buyerGstin;
  } else {
    throw serviceError("Invalid source document type", 400, "INVALID_SOURCE");
  }

  const shipAddr = order.addresses.find((a) => a.type === "SHIPPING");
  const consignee =
    sourceDocumentType === "DELIVERY_CHALLAN" && order.deliveryChallan
      ? (order.deliveryChallan.consigneeAddress as Record<string, string>)
      : null;

  const recipientName =
    consignee?.fullName || shipAddr?.fullName || order.customer?.name || order.email;
  const recipientState = consignee?.state || shipAddr?.state || "";
  const recipientCountry = (consignee?.country || shipAddr?.country || "IN").toUpperCase();
  const recipientPin = consignee?.postalCode || shipAddr?.postalCode || "";

  const shipment = pickShipment(order);
  const pickup =
    shipment?.pickupLocation ??
    order.items.find((i) => i.pickupLocation)?.pickupLocation ??
    null;
  const supplierBase = sellerDispatch();
  const supplier = {
    ...supplierBase,
    state: pickup?.state?.trim() || supplierBase.state,
    postalCode: pickup?.postalCode?.trim() || supplierBase.postalCode,
    addressLines: pickup?.line1
      ? [
          pickup.line1,
          pickup.line2,
          [pickup.city, pickup.state, pickup.postalCode].filter(Boolean).join(", "),
          pickup.country
        ].filter((x): x is string => Boolean(x?.trim()))
      : supplierBase.addressLines,
    dispatchFromPickup: Boolean(pickup?.line1),
    pickupLabel: pickup?.label ?? null
  };

  const transporterName = shipment?.courier ?? order.deliveryChallan?.carrierSnapshot ?? null;
  const transportDocNo = shipment?.awb?.trim() || order.deliveryChallan?.awbSnapshot || null;
  const transportDocDate = shipment?.createdAt?.toISOString() ?? null;
  const transportMode: EWayBillTransportMode | null = transporterName ? "ROAD" : null;

  const likelyNotRequired =
    recipientCountry !== "IN" || order.currency.toUpperCase() !== "INR";

  const gstinStatus: EwayReviewPack["recipient"]["gstinStatus"] = !prefillBuyerGstin
    ? "URP"
    : isPlausibleGstin(prefillBuyerGstin)
      ? "PROVIDED"
      : "INVALID";

  return {
    sourceDocumentType,
    sourceInvoiceId,
    sourceDeliveryChallanId,
    sourceDocumentNumber,
    sourceDocumentDate: sourceDocumentDate.toISOString(),
    documentValueInPaise,
    taxableValueInPaise,
    currency,
    interState,
    supplier,
    recipient: {
      name: recipientName,
      gstin: prefillBuyerGstin,
      gstinStatus,
      phone: consignee?.phone || shipAddr?.phone || order.phone,
      line1: consignee?.line1 || shipAddr?.line1 || "",
      line2: consignee?.line2 || shipAddr?.line2 || null,
      city: consignee?.city || shipAddr?.city || "",
      state: recipientState,
      postalCode: recipientPin,
      country: recipientCountry
    },
    items: lines.map((l) => ({
      ...l,
      fields: {
        unitOfMeasure: "NEEDS_CONFIRMATION" as const,
        hsnCode: l.hsnCode ? ("AUTO_FILLED" as const) : ("MISSING" as const)
      }
    })),
    transport: {
      shipmentId: shipment?.id ?? null,
      transporterName,
      transporterId: null,
      transportDocNo,
      transportDocDate,
      transportMode,
      vehicleNumber: null,
      vehicleType: null,
      approxDistanceKm: null,
      fieldStatus: {
        transporterName: transporterName ? "AUTO_FILLED" : "MISSING",
        transporterId: "MISSING",
        transportDocNo: transportDocNo ? "AUTO_FILLED" : "MISSING",
        transportDocDate: transportDocDate ? "AUTO_FILLED" : "NEEDS_CONFIRMATION",
        transportMode: transportMode ? "AUTO_FILLED" : "NEEDS_CONFIRMATION",
        vehicleNumber: "MISSING",
        approxDistanceKm: "MISSING"
      }
    },
    hints: {
      eligibilityCopy: likelyNotRequired
        ? "Likely not required for this shipment — confirm and override if needed. Not statutory advice."
        : "E-Way Bill may be required — review.",
      likelyNotRequired,
      missingCritical: [
        ...(!transportDocNo ? ["AWB / transport document"] : []),
        "Approx distance",
        "Vehicle number (Part B)"
      ]
    }
  };
}

export function serializeEwayBill(row: EWayBillWithItems) {
  const validityEnded = Boolean(row.validUntil && row.validUntil.getTime() < Date.now());
  return {
    id: row.id,
    orderId: row.orderId,
    shipmentId: row.shipmentId,
    sourceDocumentType: row.sourceDocumentType,
    sourceInvoiceId: row.sourceInvoiceId,
    sourceDeliveryChallanId: row.sourceDeliveryChallanId,
    sourceDocumentNumber: row.sourceDocumentNumber,
    sourceDocumentDate: row.sourceDocumentDate.toISOString(),
    ebn: row.ebn,
    ewbDate: row.ewbDate?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    status: row.status,
    displayExpiry: validityEnded && row.status === "GENERATED" ? "EXPIRED" : null,
    transactionType: row.transactionType,
    subSupplyType: row.subSupplyType,
    subSupplyDesc: row.subSupplyDesc,
    buyerGstin: row.buyerGstin,
    transporterName: row.transporterName,
    transporterId: row.transporterId,
    transportDocNo: row.transportDocNo,
    transportDocDate: row.transportDocDate?.toISOString() ?? null,
    transportMode: row.transportMode,
    vehicleNumber: row.vehicleNumber,
    vehicleType: row.vehicleType,
    approxDistanceKm: row.approxDistanceKm,
    notes: row.notes,
    generationMethod: row.generationMethod,
    provider: row.provider,
    documentValueInPaise: row.documentValueInPaise,
    taxableValueInPaise: row.taxableValueInPaise,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      sku: i.sku,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitOfMeasure: i.unitOfMeasure,
      taxableValueInPaise: i.taxableValueInPaise,
      gstRatePercent: i.gstRatePercent,
      cgstInPaise: i.cgstInPaise,
      sgstInPaise: i.sgstInPaise,
      igstInPaise: i.igstInPaise,
      cessInPaise: i.cessInPaise,
      lineTotalInPaise: i.lineTotalInPaise,
      sortOrder: i.sortOrder
    }))
  };
}

function pickPrimary(rows: EWayBillWithItems[]) {
  return (
    rows.find((r) => r.status === "GENERATED") ||
    rows.find((r) => r.status === "PENDING") ||
    rows.find((r) => r.status === "NOT_REQUIRED") ||
    rows[0] ||
    null
  );
}

export async function listOrderEwayBills(orderId: string) {
  const order = await loadOrderBundle(orderId);
  if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

  const ship = order.addresses.find((a) => a.type === "SHIPPING");
  const likelyNotRequired =
    (ship?.country ?? "IN").toUpperCase() !== "IN" || order.currency.toUpperCase() !== "INR";

  return {
    eligibilityCopy: likelyNotRequired
      ? "Likely not required for this shipment — confirm and override if needed. Not statutory advice."
      : "E-Way Bill may be required — review.",
    likelyNotRequired,
    sources: {
      taxInvoice: order.invoice
        ? {
            id: order.invoice.id,
            documentNumber: formatDisplayInvoiceNo(order.orderNumber, order.invoice.issuedAt),
            documentDate: order.invoice.issuedAt.toISOString()
          }
        : null,
      deliveryChallan: order.deliveryChallan
        ? {
            id: order.deliveryChallan.id,
            documentNumber: order.deliveryChallan.challanNumber,
            documentDate: order.deliveryChallan.challanDate.toISOString()
          }
        : null
    },
    primary: (() => {
      const p = pickPrimary(order.ewayBills);
      return p ? serializeEwayBill(p) : null;
    })(),
    history: order.ewayBills.map(serializeEwayBill)
  };
}

function transportFromBody(body: EwayPrepareBody | EwayRecordEbnBody | EwayUpdateTransportBody) {
  return {
    buyerGstin: body.buyerGstin ?? null,
    transporterName: sanitizeText(body.transporterName, 200),
    transporterId: sanitizeText(body.transporterId, 20),
    transportDocNo: sanitizeText(body.transportDocNo, 80),
    transportDocDate: parseDate(
      typeof body.transportDocDate === "string" ? body.transportDocDate : null
    ),
    transportMode: (body.transportMode ?? null) as EWayBillTransportMode | null,
    vehicleNumber: sanitizeText(body.vehicleNumber, 40),
    vehicleType: sanitizeText(body.vehicleType, 40),
    approxDistanceKm: body.approxDistanceKm ?? null,
    transactionType: sanitizeText(body.transactionType, 40) ?? "Outward",
    subSupplyType: sanitizeText(body.subSupplyType, 80),
    subSupplyDesc: sanitizeText(body.subSupplyDesc, 200),
    notes: sanitizeText(body.notes, 4000),
    shipmentId: body.shipmentId ?? null
  };
}

async function createFromReview(
  orderId: string,
  sourceDocumentType: EWayBillSourceDocumentType,
  body: EwayPrepareBody | EwayRecordEbnBody,
  opts: {
    status: "PENDING" | "GENERATED";
    ebn?: string | null;
    ewbDate?: Date | null;
    validUntil?: Date | null;
    recordedByUserId?: string | null;
  }
): Promise<EWayBillWithItems> {
  const pack = await buildEwayReviewPack(orderId, sourceDocumentType);
  const lines = applyItemOverrides(
    pack.items.map(({ fields: _f, ...rest }) => rest),
    body.itemOverrides
  );
  const t = transportFromBody(body);

  if (t.shipmentId) {
    const ship = await prisma.shipment.findFirst({
      where: { id: t.shipmentId, orderId },
      select: { id: true }
    });
    if (!ship) throw serviceError("Shipment does not belong to this order", 400, "INVALID_SHIPMENT");
  }

  try {
    const created = await prisma.eWayBill.create({
      data: {
        orderId,
        shipmentId: t.shipmentId ?? pack.transport.shipmentId,
        sourceDocumentType,
        sourceInvoiceId: sourceDocumentType === "TAX_INVOICE" ? pack.sourceInvoiceId : null,
        sourceDeliveryChallanId:
          sourceDocumentType === "DELIVERY_CHALLAN" ? pack.sourceDeliveryChallanId : null,
        sourceDocumentNumber: pack.sourceDocumentNumber,
        sourceDocumentDate: new Date(pack.sourceDocumentDate),
        ebn: opts.ebn ?? null,
        ewbDate: opts.ewbDate ?? null,
        validUntil: opts.validUntil ?? null,
        status: opts.status,
        transactionType: t.transactionType,
        subSupplyType: t.subSupplyType,
        subSupplyDesc: t.subSupplyDesc,
        buyerGstin: t.buyerGstin ?? pack.recipient.gstin,
        transporterName: t.transporterName ?? pack.transport.transporterName,
        transporterId: t.transporterId,
        transportDocNo: t.transportDocNo ?? pack.transport.transportDocNo,
        transportDocDate: t.transportDocDate ?? parseDate(pack.transport.transportDocDate),
        transportMode: t.transportMode ?? pack.transport.transportMode,
        vehicleNumber: t.vehicleNumber,
        vehicleType: t.vehicleType,
        approxDistanceKm: t.approxDistanceKm,
        notes: t.notes,
        generationMethod: "MANUAL",
        provider: opts.status === "GENERATED" ? "PORTAL" : null,
        recordedByUserId: opts.recordedByUserId ?? null,
        documentValueInPaise: pack.documentValueInPaise,
        taxableValueInPaise: pack.taxableValueInPaise,
        items: {
          create: lines.map((l) => ({
            orderItemId: l.orderItemId,
            productName: l.productName,
            sku: l.sku,
            hsnCode: l.hsnCode,
            quantity: l.quantity,
            unitOfMeasure: l.unitOfMeasure,
            taxableValueInPaise: l.taxableValueInPaise,
            gstRatePercent: l.gstRatePercent,
            cgstInPaise: l.cgstInPaise,
            sgstInPaise: l.sgstInPaise,
            igstInPaise: l.igstInPaise,
            cessInPaise: l.cessInPaise,
            lineTotalInPaise: l.lineTotalInPaise,
            sortOrder: l.sortOrder
          }))
        }
      },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });

    logger.info("eway_bill_created", {
      orderId,
      ewayBillId: created.id,
      status: created.status,
      ebn: created.ebn,
      sourceDocumentType,
      generationMethod: "MANUAL"
    });
    return created;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw serviceError("This EBN is already recorded", 409, "EBN_DUPLICATE");
    }
    throw err;
  }
}

export async function prepareEwayBill(
  orderId: string,
  body: EwayPrepareBody,
  recordedByUserId?: string | null
) {
  return createFromReview(orderId, body.sourceDocumentType, body, {
    status: "PENDING",
    recordedByUserId
  });
}

export async function recordEwayBillEbn(
  orderId: string,
  ewayBillId: string | null,
  body: EwayRecordEbnBody & { sourceDocumentType?: EWayBillSourceDocumentType },
  recordedByUserId?: string | null
) {
  const ewbDate = parseDate(body.ewbDate);
  if (!ewbDate) throw serviceError("Invalid E-Way Bill date", 400, "INVALID_DATE");
  const validUntil = parseDate(typeof body.validUntil === "string" ? body.validUntil : null);

  if (ewayBillId) {
    const existing = await prisma.eWayBill.findFirst({
      where: { id: ewayBillId, orderId },
      include: { items: true }
    });
    if (!existing) throw serviceError("E-Way Bill not found", 404, "NOT_FOUND");
    if (existing.status === "CANCELLED" || existing.status === "NOT_REQUIRED") {
      throw serviceError("Cannot record EBN on this status", 400, "INVALID_STATUS");
    }

    const t = transportFromBody(body);
    try {
      const updated = await prisma.eWayBill.update({
        where: { id: existing.id },
        data: {
          ebn: body.ebn,
          ewbDate,
          validUntil,
          status: "GENERATED",
          generationMethod: "MANUAL",
          provider: "PORTAL",
          recordedByUserId: recordedByUserId ?? existing.recordedByUserId,
          buyerGstin: t.buyerGstin ?? existing.buyerGstin,
          transporterName: t.transporterName ?? existing.transporterName,
          transporterId: t.transporterId ?? existing.transporterId,
          transportDocNo: t.transportDocNo ?? existing.transportDocNo,
          transportDocDate: t.transportDocDate ?? existing.transportDocDate,
          transportMode: t.transportMode ?? existing.transportMode,
          vehicleNumber: t.vehicleNumber ?? existing.vehicleNumber,
          vehicleType: t.vehicleType ?? existing.vehicleType,
          approxDistanceKm: t.approxDistanceKm ?? existing.approxDistanceKm,
          notes: t.notes ?? existing.notes,
          shipmentId: t.shipmentId ?? existing.shipmentId
        },
        include: { items: { orderBy: { sortOrder: "asc" } } }
      });
      logger.info("eway_bill_ebn_recorded", {
        orderId,
        ewayBillId: updated.id,
        ebn: updated.ebn,
        generationMethod: "MANUAL",
        provider: "PORTAL"
      });
      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw serviceError("This EBN is already recorded", 409, "EBN_DUPLICATE");
      }
      throw err;
    }
  }

  if (!body.sourceDocumentType) {
    throw serviceError(
      "sourceDocumentType required when creating a new record",
      400,
      "SOURCE_REQUIRED"
    );
  }
  return createFromReview(orderId, body.sourceDocumentType, body as EwayPrepareBody, {
    status: "GENERATED",
    ebn: body.ebn,
    ewbDate,
    validUntil,
    recordedByUserId
  });
}

export async function updateEwayTransport(
  orderId: string,
  ewayBillId: string,
  body: EwayUpdateTransportBody
) {
  const existing = await prisma.eWayBill.findFirst({ where: { id: ewayBillId, orderId } });
  if (!existing) throw serviceError("E-Way Bill not found", 404, "NOT_FOUND");
  if (existing.status === "CANCELLED" || existing.status === "NOT_REQUIRED") {
    throw serviceError("Cannot edit transport on this status", 400, "INVALID_STATUS");
  }

  const t = transportFromBody(body);
  if (t.shipmentId) {
    const ship = await prisma.shipment.findFirst({
      where: { id: t.shipmentId, orderId },
      select: { id: true }
    });
    if (!ship) throw serviceError("Shipment does not belong to this order", 400, "INVALID_SHIPMENT");
  }

  return prisma.eWayBill.update({
    where: { id: existing.id },
    data: {
      buyerGstin: t.buyerGstin ?? existing.buyerGstin,
      transporterName: t.transporterName ?? existing.transporterName,
      transporterId: t.transporterId ?? existing.transporterId,
      transportDocNo: t.transportDocNo ?? existing.transportDocNo,
      transportDocDate: t.transportDocDate ?? existing.transportDocDate,
      transportMode: t.transportMode ?? existing.transportMode,
      vehicleNumber: t.vehicleNumber ?? existing.vehicleNumber,
      vehicleType: t.vehicleType ?? existing.vehicleType,
      approxDistanceKm: t.approxDistanceKm ?? existing.approxDistanceKm,
      notes: t.notes ?? existing.notes,
      shipmentId: t.shipmentId ?? existing.shipmentId
    },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
}

export async function markEwayCancelled(orderId: string, ewayBillId: string, notes?: string | null) {
  const existing = await prisma.eWayBill.findFirst({ where: { id: ewayBillId, orderId } });
  if (!existing) throw serviceError("E-Way Bill not found", 404, "NOT_FOUND");
  if (existing.status === "CANCELLED") {
    return prisma.eWayBill.findFirstOrThrow({
      where: { id: ewayBillId },
      include: { items: { orderBy: { sortOrder: "asc" } } }
    });
  }
  if (existing.status !== "GENERATED" && existing.status !== "PENDING") {
    throw serviceError(
      "Only pending or generated records can be cancelled locally",
      400,
      "INVALID_STATUS"
    );
  }

  const updated = await prisma.eWayBill.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      notes: sanitizeText(notes, 4000) ?? existing.notes
    },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  logger.info("eway_bill_local_cancelled", {
    orderId,
    ewayBillId: updated.id,
    ebn: updated.ebn,
    note: "Local record only — government portal cancel is external"
  });
  return updated;
}

export async function markEwayNotRequired(
  orderId: string,
  notes?: string | null,
  recordedByUserId?: string | null
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, orderNumber: true, createdAt: true }
  });
  if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

  const created = await prisma.eWayBill.create({
    data: {
      orderId,
      sourceDocumentType: "TAX_INVOICE",
      sourceDocumentNumber: order.orderNumber,
      sourceDocumentDate: order.createdAt,
      status: "NOT_REQUIRED",
      generationMethod: "MANUAL",
      notes: sanitizeText(notes, 4000) ?? "Marked not required by admin",
      recordedByUserId: recordedByUserId ?? null,
      transactionType: "N/A"
    },
    include: { items: true }
  });
  logger.info("eway_bill_not_required", { orderId, ewayBillId: created.id });
  return created;
}

export async function getEwayBill(orderId: string, ewayBillId: string) {
  const row = await prisma.eWayBill.findFirst({
    where: { id: ewayBillId, orderId },
    include: { items: { orderBy: { sortOrder: "asc" } } }
  });
  if (!row) throw serviceError("E-Way Bill not found", 404, "NOT_FOUND");
  return row;
}
