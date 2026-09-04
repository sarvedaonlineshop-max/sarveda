"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { AdminSkeleton, AdminSkeletonLines } from "@/components/admin/AdminSkeleton";
import { AdminToast } from "@/components/admin/AdminToast";
import {
  AdminOrderAttributionCard,
  type AdminOrderAttribution
} from "@/components/admin/AdminOrderAttributionCard";
import { AdminOrderEwayBillCard } from "@/components/admin/AdminOrderEwayBillCard";
import { AdminOrderLineRefund } from "@/components/admin/AdminOrderLineRefund";
import { AdminOrderRefundPreview } from "@/components/admin/AdminOrderRefundPreview";
import { AdminOrderRtoWorkflow } from "@/components/admin/AdminOrderRtoWorkflow";
import {
  AdminOrderServiceRequests,
  type AdminServiceRequestRow
} from "@/components/admin/AdminOrderServiceRequests";
import {
  adminCancelWaybill,
  adminCreateReverseShipment,
  adminCreateShipmentForOrder,
  adminEstimateDelhiveryCharge,
  adminSaveManualAwb,
  adminSyncOrderShipments,
  adminTrackShipmentByWaybill,
  delhiveryLabelUrl,
  fetchAdminOrderDetail,
  fetchAdminOrderInvoice,
  adminOrderInvoiceDownloadUrl,
  fetchAdminOrderDeliveryChallan,
  generateAdminOrderDeliveryChallan,
  adminOrderDeliveryChallanDownloadUrl,
  fetchAdminPickupLocations,
  patchAdminOrderAddress,
  patchAdminOrderItemWarehouses,
  patchAdminOrderPreferredCourier,
  patchAdminOrderStatus,
  reconcileAdminOrderRazorpay,
  type AdminPickupLocationRow,
  type DelhiveryShipBox
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import {
  formatAdminOrderStatusLabel,
  isUnpaidCheckoutAttempt
} from "@/lib/order-status-display";
import {
  digitsOnly,
  breakdownChargeableWeight,
  totalChargeableWeightGrams,
  validateBoxDimensions
} from "@/lib/chargeable-weight";
import { DEFAULT_SHIP_BOX_PRESET, SHIP_BOX_PRESETS } from "@/lib/ship-box-presets";
import { allOrderAwbRows, paymentModeLabel, primaryForwardShipment, shippingModeLabel, type ShipmentCarrierMeta } from "@/lib/shipment-labels";

const MAX_SHIP_BOXES = 5;
/** Per-line warehouse/courier bulk UI — hidden until multi-carrier routing is re-enabled. */
const SHOW_LEGACY_PER_LINE_FULFILLMENT = false;
const DIM_MAX_CM = 200;

const AWB_PILL = {
  track:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-sky-700 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 no-underline transition-all duration-150 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100",
  sync:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-violet-700 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-900 transition-all duration-150 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100",
  label:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-emerald-700 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 no-underline transition-all duration-150 hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100",
  cancel:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-red-700 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800 transition-all duration-150 hover:bg-red-100 disabled:opacity-50 dark:border-red-600 dark:bg-red-950/40 dark:text-red-200",
  return:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-amber-700 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950 transition-all duration-150 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100",
  save:
    "inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs font-semibold text-amber-50 transition-all duration-150 hover:bg-stone-700 disabled:opacity-50 dark:border-stone-500 dark:bg-stone-200 dark:text-stone-900"
} as const;

function defaultShipBox(weightGrams = 0): DelhiveryShipBox {
  return {
    lengthCm: DEFAULT_SHIP_BOX_PRESET.lengthCm,
    breadthCm: DEFAULT_SHIP_BOX_PRESET.breadthCm,
    heightCm: DEFAULT_SHIP_BOX_PRESET.heightCm,
    weightGrams: Math.max(0, weightGrams),
    packageType: "CARDBOARD_BOX"
  };
}

function patchActiveBoxDim(
  boxes: DelhiveryShipBox[],
  activeIdx: number,
  field: "lengthCm" | "breadthCm" | "heightCm",
  raw: string
): DelhiveryShipBox[] {
  // Allow empty/partial input while typing; enforce min dims only on submit / estimate.
  const digits = digitsOnly(raw);
  const parsed =
    digits === "" ? 0 : Math.min(DIM_MAX_CM, Math.max(0, Number.parseInt(digits, 10)));
  return boxes.map((b, i) => (i === activeIdx ? { ...b, [field]: parsed } : b));
}

function patchActiveBoxWeight(boxes: DelhiveryShipBox[], activeIdx: number, raw: string): DelhiveryShipBox[] {
  const digits = digitsOnly(raw, 6);
  const parsed =
    digits === "" ? 0 : Math.min(500_000, Math.max(0, Number.parseInt(digits, 10)));
  return boxes.map((b, i) => (i === activeIdx ? { ...b, weightGrams: parsed } : b));
}

const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED"
] as const;

type OrderItemRow = {
  id?: string;
  nameSnapshot: string;
  skuSnapshot: string;
  qtyOrdered: number;
  warehouseFulfillmentQty?: number;
  dropShipFulfillmentQty?: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  pickupLocationId?: string | null;
  pickupLocation?: { id: string; label: string } | null;
};

type AddressRow = {
  id?: string;
  type: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type ShipmentRow = {
  id: string;
  courier: string;
  awb: string | null;
  trackingUrl: string | null;
  status: string;
  deliveredAt?: string | null;
  rtoAt?: string | null;
  updatedAt?: string;
  pickupLocation?: { id: string; label: string; shiprocketPickupName: string } | null;
  carrierMeta?: ShipmentCarrierMeta | null;
};

type RefundRow = {
  id: string;
  amountInPaise: number;
  reason?: string | null;
  providerRefundId?: string | null;
  status: string;
  createdAt: string;
};

type PaymentRow = {
  provider: string;
  status?: string;
  providerOrderId?: string | null;
  providerPaymentId?: string | null;
  amountInPaise?: number;
  refundedInPaise?: number;
  refunds?: RefundRow[];
};

type OrderInvoiceState = {
  pdfUrl: string | null;
  invoiceNo: string | null;
  downloadUrl: string | null;
};

type OrderDeliveryChallanState = {
  challanNumber: string;
  downloadUrl: string;
  awb: string | null;
  carrier: string | null;
  reasonLabel: string;
};

function parseOrderNotes(notes: string | null | undefined) {
  const raw = (notes ?? "").trim();
  if (!raw) return { giftWrap: false, customerNote: null as string | null, internalNotes: null as string | null };
  const giftWrap = raw.includes("[GIFT_WRAP]");
  const customerMatch = raw.match(/Customer note:\s*(.+?)(?:\n|$)/);
  const customerNote = customerMatch?.[1]?.trim() || null;
  const internalNotes =
    raw
      .replace(/\[GIFT_WRAP\][^\n]*/g, "")
      .replace(/Customer note:\s*.+/g, "")
      .trim() || null;
  return { giftWrap, customerNote, internalNotes };
}

type OrderAccountingEvent = {
  id: string;
  eventType: string;
  uniqueKey: string;
  processedAt?: string | null;
  createdAt: string;
  journalEntry?: {
    id: string;
    entryNumber: string;
    entryDate: string;
    status: string;
    memo?: string | null;
  } | null;
};

type OrderHistoryRow = {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  reason?: string | null;
  createdAt: string;
};

type OrderRestockRow = {
  id: string;
  reason: string;
  createdAt: string;
};

type OrderLoaded = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  customerName?: string | null;
  notes?: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  currency: string;
  grandTotalInPaise: number;
  subtotalInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  discountInPaise: number;
  createdAt: string;
  items: OrderItemRow[];
  addresses: AddressRow[];
  shipments: ShipmentRow[];
  payments?: PaymentRow[];
  shippingLastError: string | null;
  shippingLastErrorAt: string | null;
  preferredCourier?: string | null;
  shippingZone?: string | null;
  wooCommerceId?: number | null;
  wooImportNote?: string | null;
  serviceRequests?: AdminServiceRequestRow[];
  attribution?: AdminOrderAttribution | null;
  statusHistory: OrderHistoryRow[];
  inventoryRestocks: OrderRestockRow[];
  accountingEvents: OrderAccountingEvent[];
};

function RefundCancelPanel({
  orderId,
  status,
  paymentStatus,
  onDone,
  compact
}: {
  orderId: string;
  status: string;
  paymentStatus: string;
  onDone: () => void;
  compact?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "refund" | null>(null);

  const terminal = ["CANCELLED", "REFUNDED", "DELIVERED"].includes(status);
  const canRefund =
    !terminal &&
    (paymentStatus === "CAPTURED" || paymentStatus === "PARTIALLY_REFUNDED") &&
    ["PAID", "PROCESSING", "PACKED", "SHIPPED"].includes(status);
  const canCancel =
    !terminal &&
    !canRefund &&
    (status === "PENDING_PAYMENT" || paymentStatus === "PENDING" || paymentStatus === "FAILED");

  const paymentStateLabel =
    paymentStatus === "REFUNDED"
      ? "REFUNDED"
      : paymentStatus === "PARTIALLY_REFUNDED"
        ? "PARTIALLY_REFUNDED"
        : busy
          ? "PROCESSING"
          : paymentStatus;

  async function execute(action: "cancel" | "refund") {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setConfirm(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reason.trim() || undefined })
      });
      const data = (await res.json()) as {
        message?: string;
        error?: string;
        code?: string;
        refundId?: string;
        success?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error ?? (data.code ? `${data.code}` : "Failed"));
      }
      if (action === "refund") {
        // Gateway success returns refundId; COD manual path has success message without gateway id.
        const detail = data.refundId
          ? `${data.message ?? "Refund accepted by provider."} Refund ID: ${data.refundId}`
          : (data.message ?? "Done");
        setMsg({ text: detail, ok: true });
      } else {
        setMsg({ text: data.message ?? "Done", ok: true });
      }
      onDone();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "FAILED",
        ok: false
      });
    } finally {
      setBusy(false);
    }
  }

  if (!canCancel && !canRefund) return null;

  const shell = compact
    ? "min-w-0 flex-1 lg:max-w-md"
    : "mt-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900";

  return (
    <div className={shell}>
      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
        {canRefund ? "Refund" : "Cancel order"}
      </p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Payment state: {paymentStateLabel}
      </p>

      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("cancel")}
            className="inline-flex min-h-[34px] items-center rounded-full border border-stone-400 bg-white px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-500 dark:bg-stone-900 dark:text-stone-200"
          >
            Cancel order
          </button>
        ) : null}
        {canRefund ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("refund")}
            className="inline-flex min-h-[34px] items-center rounded-full border border-red-700 bg-red-50 px-4 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-600 dark:bg-red-950/40 dark:text-red-200"
          >
            {busy ? "Processing…" : "Refund to customer"}
          </button>
        ) : null}
      </div>

      {confirm ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-xs text-red-900 dark:text-red-200">
            {confirm === "refund"
              ? "Refund the full amount to the customer’s original payment method and restore stock?"
              : "Cancel this unpaid order and release reserved stock?"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void execute(confirm)}
              className="inline-flex min-h-[30px] items-center rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800"
            >
              Yes, confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="inline-flex min-h-[30px] items-center rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
            >
              No, go back
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            msg.ok
              ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

function asOrder(raw: Record<string, unknown>): OrderLoaded {
  const items = ((raw.items as Array<Record<string, unknown>>) ?? []).map((row) => ({
    id: row.id != null ? String(row.id) : undefined,
    nameSnapshot: String(row.nameSnapshot),
    skuSnapshot: String(row.skuSnapshot),
    qtyOrdered: Number(row.qtyOrdered),
    warehouseFulfillmentQty:
      row.warehouseFulfillmentQty != null ? Number(row.warehouseFulfillmentQty) : undefined,
    dropShipFulfillmentQty:
      row.dropShipFulfillmentQty != null ? Number(row.dropShipFulfillmentQty) : undefined,
    unitPriceInPaise: Number(row.unitPriceInPaise),
    lineTotalInPaise: Number(row.lineTotalInPaise),
    pickupLocationId: row.pickupLocationId != null ? String(row.pickupLocationId) : null,
    pickupLocation: row.pickupLocation as OrderItemRow["pickupLocation"]
  }));
  const addresses = (raw.addresses as AddressRow[]) ?? [];
  const shipments = ((raw.shipments as Array<Record<string, unknown>>) ?? []).map((s) => ({
    id: String(s.id),
    courier: String(s.courier),
    awb: s.awb != null ? String(s.awb) : null,
    trackingUrl: s.trackingUrl != null ? String(s.trackingUrl) : null,
    status: String(s.status),
    deliveredAt: s.deliveredAt != null ? String(s.deliveredAt) : null,
    rtoAt: s.rtoAt != null ? String(s.rtoAt) : null,
    updatedAt: s.updatedAt != null ? String(s.updatedAt) : undefined,
    pickupLocation: s.pickupLocation as ShipmentRow["pickupLocation"],
    carrierMeta: (s.carrierMeta as ShipmentRow["carrierMeta"]) ?? null
  }));
  const payments = ((raw.payments as Array<Record<string, unknown>>) ?? []).map((p) => ({
    provider: String(p.provider),
    status: p.status != null ? String(p.status) : undefined,
    providerOrderId: p.providerOrderId != null ? String(p.providerOrderId) : null,
    providerPaymentId: p.providerPaymentId != null ? String(p.providerPaymentId) : null,
    amountInPaise: p.amountInPaise != null ? Number(p.amountInPaise) : undefined,
    refundedInPaise: p.refundedInPaise != null ? Number(p.refundedInPaise) : undefined,
    refunds: ((p.refunds as Array<Record<string, unknown>>) ?? []).map((r) => ({
      id: String(r.id),
      amountInPaise: Number(r.amountInPaise),
      reason: r.reason != null ? String(r.reason) : null,
      providerRefundId: r.providerRefundId != null ? String(r.providerRefundId) : null,
      status: String(r.status),
      createdAt: String(r.createdAt)
    }))
  }));
  const legacy = raw.wooLegacyMeta as { lineItemsNote?: string } | null | undefined;
  const serviceRequests = ((raw.serviceRequests as Array<Record<string, unknown>>) ?? []).map((r) => ({
    id: String(r.id),
    type: String(r.type),
    status: String(r.status),
    reasonLabel: String(r.reasonLabel),
    otherMessage: r.otherMessage != null ? String(r.otherMessage) : null,
    message: r.message != null ? String(r.message) : null,
    customerEmail: String(r.customerEmail),
    createdAt: String(r.createdAt),
    reviewedAt: r.reviewedAt != null ? String(r.reviewedAt) : null,
    reviewedByEmail: r.reviewedByEmail != null ? String(r.reviewedByEmail) : null,
    adminNote: r.adminNote != null ? String(r.adminNote) : null,
    codRefundNote: r.codRefundNote != null ? String(r.codRefundNote) : null,
    refundTotalInPaise: r.refundTotalInPaise != null ? Number(r.refundTotalInPaise) : null,
    refundProcessedAt: r.refundProcessedAt != null ? String(r.refundProcessedAt) : null,
    photos: ((r.photos as Array<Record<string, unknown>>) ?? []).map((p) => ({
      id: String(p.id),
      s3Url: String(p.s3Url),
      fileName: p.fileName != null ? String(p.fileName) : null
    })),
    items: ((r.items as Array<Record<string, unknown>>) ?? []).map((item) => ({
      id: String(item.id),
      orderItemId: String(item.orderItemId),
      nameSnapshot: String(item.nameSnapshot),
      skuSnapshot: String(item.skuSnapshot),
      qtySelected: Number(item.qtySelected),
      reasonLabel: String(item.reasonLabel),
      message: item.message != null ? String(item.message) : null,
      otherMessage: item.otherMessage != null ? String(item.otherMessage) : null,
      refundAmountInPaise: item.refundAmountInPaise != null ? Number(item.refundAmountInPaise) : null,
      refundedAt: item.refundedAt != null ? String(item.refundedAt) : null,
      photos: ((item.photos as Array<Record<string, unknown>>) ?? []).map((p) => ({
        id: String(p.id),
        s3Url: String(p.s3Url),
        fileName: p.fileName != null ? String(p.fileName) : null
      }))
    }))
  }));
  return {
    id: String(raw.id),
    orderNumber: String(raw.orderNumber),
    email: String(raw.email),
    phone: String(raw.phone),
    customerName:
      (raw.customer as { name?: string | null } | null | undefined)?.name ?? null,
    status: String(raw.status),
    paymentStatus: String(raw.paymentStatus),
    fulfillmentStatus: String(raw.fulfillmentStatus ?? "UNFULFILLED"),
    currency: String(raw.currency ?? "INR"),
    grandTotalInPaise: Number(raw.grandTotalInPaise),
    subtotalInPaise: Number(raw.subtotalInPaise),
    shippingInPaise: Number(raw.shippingInPaise),
    taxInPaise: Number(raw.taxInPaise),
    discountInPaise: Number(raw.discountInPaise ?? 0),
    createdAt: String(raw.createdAt),
    items,
    addresses,
    shipments,
    payments,
    shippingLastError: raw.shippingLastError != null ? String(raw.shippingLastError) : null,
    shippingLastErrorAt: raw.shippingLastErrorAt != null ? String(raw.shippingLastErrorAt) : null,
    preferredCourier: raw.preferredCourier != null ? String(raw.preferredCourier) : null,
    shippingZone: raw.shippingZone != null ? String(raw.shippingZone) : null,
    wooCommerceId: raw.wooCommerceId != null ? Number(raw.wooCommerceId) : null,
    wooImportNote: legacy?.lineItemsNote ?? null,
    serviceRequests,
    attribution: (raw.attribution as AdminOrderAttribution | null | undefined) ?? null,
    statusHistory:
      (raw.statusHistory as OrderHistoryRow[] | null | undefined) ?? [],
    inventoryRestocks:
      (raw.inventoryRestocks as OrderRestockRow[] | null | undefined) ?? [],
    accountingEvents:
      (raw.accountingEvents as OrderAccountingEvent[] | null | undefined) ?? []
  };
}

function humanState(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sameAddress(a: AddressRow | undefined, b: AddressRow | undefined): boolean {
  if (!a || !b) return false;
  return ["fullName", "phone", "line1", "line2", "city", "state", "postalCode", "country"].every(
    (key) =>
      String(a[key as keyof AddressRow] ?? "").trim().toLowerCase() ===
      String(b[key as keyof AddressRow] ?? "").trim().toLowerCase()
  );
}

function AdminOrderProductionView({
  order,
  invoice,
  deliveryChallan,
  challanBusy,
  canGenerateChallan,
  shipBusy,
  shipUi,
  onCreateShipment,
  onGenerateChallan,
  onEditAddress,
  onStatusChange,
  statusSaving,
  dangerActions,
  refundContent,
  ewayBill,
  serviceRequests,
  shipmentSetup
}: {
  order: OrderLoaded;
  invoice: { invoiceNo: string | null; downloadUrl: string | null; pdfUrl: string | null } | null;
  deliveryChallan: {
    challanNumber: string;
    downloadUrl: string;
    awb: string | null;
    carrier: string | null;
    reasonLabel: string;
  } | null;
  challanBusy: boolean;
  canGenerateChallan: boolean;
  shipBusy: string | null;
  shipUi: boolean;
  onCreateShipment: () => void;
  onGenerateChallan: (refresh: boolean) => void;
  onEditAddress: (address: AddressRow) => void;
  onStatusChange: (status: string) => void;
  statusSaving: boolean;
  dangerActions: ReactNode;
  refundContent: ReactNode;
  ewayBill: ReactNode;
  serviceRequests: ReactNode;
  shipmentSetup: ReactNode;
}) {
  const payment = order.payments?.[0];
  const isCod = payment?.provider === "COD";
  const isCancelled = order.status === "CANCELLED";
  const isRefunded =
    order.status === "REFUNDED" ||
    order.paymentStatus === "REFUNDED" ||
    order.paymentStatus === "PARTIALLY_REFUNDED";
  const captured =
    order.paymentStatus === "CAPTURED" ||
    order.paymentStatus === "REFUNDED" ||
    order.paymentStatus === "PARTIALLY_REFUNDED";
  const collectedInPaise = captured ? payment?.amountInPaise ?? order.grandTotalInPaise : 0;
  const refundedInPaise = payment?.refundedInPaise ?? 0;
  const netCollectedInPaise = Math.max(0, collectedInPaise - refundedInPaise);
  const amountDueInPaise = isCod && !captured ? order.grandTotalInPaise : 0;
  const shipping = order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0];
  const billing = order.addresses.find((a) => a.type === "BILLING");
  const customerName = order.customerName ?? shipping?.fullName ?? billing?.fullName ?? "Customer";
  const awbRows = allOrderAwbRows(order.shipments);
  const paymentLabel = isCod
    ? isCancelled && !captured
      ? "COD — Not Collected"
      : captured
        ? "COD — Collected"
        : "COD — Pending Collection"
    : order.paymentStatus === "CAPTURED"
      ? `Paid via ${humanState(payment?.provider ?? "Online")}`
      : order.paymentStatus === "PARTIALLY_REFUNDED"
        ? "Partially Refunded"
        : order.paymentStatus === "REFUNDED"
          ? "Refunded"
          : order.paymentStatus === "FAILED"
            ? "Payment Failed"
            : "Payment Pending";
  const orderLabel = isCancelled
    ? "Cancelled"
    : isUnpaidCheckoutAttempt(order.status, order.paymentStatus, payment?.provider)
      ? "Abandoned"
      : formatAdminOrderStatusLabel(order.status, order.paymentStatus, payment?.provider);
  const fulfilmentLabel = isCancelled
    ? "Unfulfilled"
    : humanState(order.fulfillmentStatus);
  const nextStatuses: Record<string, string[]> = {
    PAID: ["PROCESSING"],
    PROCESSING: ["PACKED"],
    PACKED: ["SHIPPED"],
    SHIPPED: ["DELIVERED"]
  };
  const deliveryStateIncomplete =
    order.status === "DELIVERED" &&
    awbRows.some((row) => {
      const meta = order.shipments.find((s) => s.id === row.shipmentId);
      const isReverse = (meta?.carrierMeta as { direction?: string } | null | undefined)?.direction === "REVERSE";
      if (isReverse) return false;
      return row.status !== "DELIVERED";
    });
  const timeline = [
    {
      key: "placed",
      at: order.createdAt,
      title: `Order placed${isCod ? " — Cash on Delivery" : payment?.provider ? ` — ${humanState(payment.provider)}` : ""}`,
      detail: null as string | null
    },
    ...order.statusHistory.map((h) => ({
      key: `status-${h.id}`,
      at: h.createdAt,
      title: `Order ${humanState(h.toStatus).toLowerCase()}`,
      detail: h.reason ?? null
    })),
    ...order.inventoryRestocks.map((r) => ({
      key: `restock-${r.id}`,
      at: r.createdAt,
      title: "Inventory restored",
      detail: r.reason ? humanState(r.reason) : null
    })),
    ...order.accountingEvents.map((e) => ({
      key: `accounting-${e.id}`,
      at: e.processedAt ?? e.createdAt,
      title:
        e.eventType === "ORDER_CANCELLED"
          ? "Accounting reversal posted"
          : e.eventType === "ORDER_REFUNDED_FULL"
            ? "Refund accounting posted"
            : e.eventType === "ORDER_PAID"
              ? "Sale journal posted"
              : `${humanState(e.eventType)} posted`,
      detail: e.journalEntry?.entryNumber ?? null
    }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const card = "rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900";
  const sectionHeader = "border-b border-stone-100 px-5 py-4 dark:border-stone-700";

  return (
    <div className="space-y-6">
      <header className={`${card} overflow-hidden`}>
        <div className="h-1 bg-gradient-to-r from-[#1c352a] via-[#b98a3e] to-[#1c352a]" />
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a7060]">Order</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#1c352a] dark:text-stone-100">
              #{order.orderNumber}
            </h1>
            <div className="mt-3 space-y-0.5 text-sm text-stone-600 dark:text-stone-300">
              <p className="font-semibold text-stone-900 dark:text-stone-100">{customerName}</p>
              <p>{order.email}</p>
              <p>{order.phone}</p>
              <p className="pt-1 text-xs text-stone-500">
                Placed {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isCancelled ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
              Order: {orderLabel}
            </span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${order.paymentStatus === "FAILED" ? "bg-red-50 text-red-800" : isCod && !captured ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-800"}`}>
              Payment: {paymentLabel}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
              Fulfillment: {fulfilmentLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Order total", formatMinorFromPaise(order.grandTotalInPaise, order.currency), order.currency],
          ["Payment", isCod ? "Cash on Delivery" : humanState(payment?.provider ?? "Pending"), isCod && !captured ? (isCancelled ? "Not collected" : "Pending collection") : humanState(order.paymentStatus)],
          ["Fulfillment", fulfilmentLabel, awbRows.length ? `${awbRows.length} tracking reference${awbRows.length === 1 ? "" : "s"}` : "No shipment"],
          ["Delivery", shipping ? `${shipping.city}, ${shipping.state}` : "Address unavailable", shipping?.postalCode ?? "—"]
        ].map(([label, value, hint]) => (
          <div key={label} className={`${card} min-h-[104px] p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a7060]">{label}</p>
            <p className="mt-2 text-lg font-bold text-[#1c352a] dark:text-stone-100">{value}</p>
            <p className="mt-0.5 text-xs text-stone-500">{hint}</p>
          </div>
        ))}
      </div>

      <section className={`${card} p-4`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {shipUi && awbRows.length === 0 ? (
              <button type="button" disabled={!!shipBusy} onClick={onCreateShipment} className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {shipBusy === "create" ? "Creating shipment…" : "Create Shipment"}
              </button>
            ) : null}
            {awbRows
              .filter((row) => row.isDelhiveryIntegrated)
              .map((row) => (
                <a
                  key={`label-${row.shipmentId}-${row.awb}`}
                  href={delhiveryLabelUrl(row.awb)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[#b98a3e] bg-[#fff8e8] px-4 py-2 text-sm font-semibold text-[#1c352a]"
                >
                  {awbRows.filter((r) => r.isDelhiveryIntegrated).length > 1
                    ? `Download label · ${row.awb}`
                    : "Download label"}
                </a>
              ))}
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {(nextStatuses[order.status] ?? []).map((status) => (
                <button key={status} type="button" disabled={statusSaving} onClick={() => onStatusChange(status)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50">
                  Mark {humanState(status)}
                </button>
              ))}
              {deliveryStateIncomplete ? (
                <button
                  type="button"
                  disabled={statusSaving}
                  onClick={() => onStatusChange("DELIVERED")}
                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
                >
                  Confirm delivery state
                </button>
              ) : null}
              {invoice?.invoiceNo || invoice?.pdfUrl ? (
                <a href={invoice.downloadUrl ?? adminOrderInvoiceDownloadUrl(order.id)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#b98a3e] bg-[#fff8e8] px-4 py-2 text-sm font-semibold text-[#1c352a]">
                  Download Invoice
                </a>
              ) : null}
            </div>
            {dangerActions ? <div className="border-t border-red-100 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">{dangerActions}</div> : null}
          </div>
        </div>
      </section>

      <section className={card}>
        <div className={sectionHeader}>
          <h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Items &amp; Fulfillment</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#faf7f2] text-[11px] uppercase tracking-wide text-[#8a7060]">
              <tr>{["Product", "SKU", "Qty", "Fulfilled From", "Unit Price", "Total"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {order.items.map((item, idx) => {
                const warehouseQty = item.warehouseFulfillmentQty ?? item.qtyOrdered;
                const dropQty = item.dropShipFulfillmentQty ?? 0;
                const source = dropQty > 0 && warehouseQty > 0 ? `Warehouse (${warehouseQty}) · Drop ship (${dropQty})` : dropQty > 0 ? "Drop ship" : item.pickupLocation?.label ?? "Warehouse";
                return (
                  <tr key={item.id ?? idx}>
                    <td className="px-4 py-3 font-medium text-stone-900">{item.nameSnapshot}</td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-500">{item.skuSnapshot}</td>
                    <td className="px-4 py-3">{item.qtyOrdered}</td>
                    <td className="px-4 py-3 text-stone-600">{source}</td>
                    <td className="px-4 py-3">{formatMinorFromPaise(item.unitPriceInPaise, order.currency)}</td>
                    <td className="px-4 py-3 font-semibold">{formatMinorFromPaise(item.lineTotalInPaise, order.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-stone-100 p-5">
          {isCancelled && awbRows.length === 0 ? (
            <p className="text-sm text-stone-600">This order was cancelled before shipment.</p>
          ) : awbRows.length === 0 ? (
            <p className="text-sm text-stone-500">No shipment has been created yet.</p>
          ) : (
            <div className="space-y-3">
              {awbRows.map((row) => (
                <div key={`${row.shipmentId}-${row.awb}`} className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-stone-500">Status</dt><dd className="font-semibold">{humanState(row.status)}</dd></div>
                    <div><dt className="text-xs text-stone-500">Carrier</dt><dd>{humanState(row.courier)}</dd></div>
                    <div><dt className="text-xs text-stone-500">AWB / Tracking ID</dt><dd className="font-mono text-xs">{row.awb}</dd></div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {row.isDelhiveryIntegrated ? (
                      <a
                        href={delhiveryLabelUrl(row.awb)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={AWB_PILL.label}
                      >
                        Download label
                      </a>
                    ) : null}
                    {row.trackingUrl ? (
                      <a href={row.trackingUrl} target="_blank" rel="noopener noreferrer" className={AWB_PILL.track}>
                        Open tracking
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {shipmentSetup}
        </div>
      </section>

      <section className={card}>
        <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Customer &amp; Delivery</h2></div>
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Customer</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-xs text-stone-500">Name</dt><dd className="font-semibold">{customerName}</dd></div>
              <div><dt className="text-xs text-stone-500">Email</dt><dd>{order.email}</dd></div>
              <div><dt className="text-xs text-stone-500">Phone</dt><dd>{order.phone}</dd></div>
            </dl>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Shipping address</p>
              {shipping ? <button type="button" onClick={() => onEditAddress(shipping)} className="text-xs font-semibold text-[#8a6428] hover:underline">Edit</button> : null}
            </div>
            {shipping ? (
              <address className="mt-3 text-sm not-italic leading-6 text-stone-700">
                <span className="font-semibold text-stone-900">{shipping.fullName}</span><br />
                {shipping.line1}{shipping.line2 ? <><br />{shipping.line2}</> : null}<br />
                {shipping.city}, {shipping.state} {shipping.postalCode}<br />{shipping.country}
              </address>
            ) : <p className="mt-3 text-sm text-stone-500">No shipping address.</p>}
            <div className="mt-4 border-t border-stone-100 pt-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Billing address</p>
              <p className="mt-1 text-stone-600">{sameAddress(shipping, billing) ? "Same as shipping" : billing ? `${billing.line1}, ${billing.city}, ${billing.state} ${billing.postalCode}` : "Not provided"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={card}>
        <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Payment &amp; Order Total</h2></div>
        <div className="grid gap-8 p-5 lg:grid-cols-2">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Payment method</dt><dd className="font-semibold">{isCod ? "Cash on Delivery" : humanState(payment?.provider ?? "Not selected")}</dd></div>
            {isCod ? (
              <>
                <div className="flex justify-between"><dt className="text-stone-500">Amount due</dt><dd>{formatMinorFromPaise(amountDueInPaise, order.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Collected</dt><dd>{formatMinorFromPaise(collectedInPaise, order.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Status</dt><dd className="font-semibold">{isCancelled && !captured ? "Not collected" : captured ? "Collected" : "Pending collection"}</dd></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><dt className="text-stone-500">Order total</dt><dd>{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Originally collected</dt><dd>{formatMinorFromPaise(collectedInPaise, order.currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-stone-500">Refunded</dt><dd>{formatMinorFromPaise(refundedInPaise, order.currency)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Net collected</dt><dd>{formatMinorFromPaise(netCollectedInPaise, order.currency)}</dd></div>
              </>
            )}
          </dl>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-stone-500">Products</dt><dd>{formatMinorFromPaise(order.subtotalInPaise, order.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Shipping</dt><dd>{formatMinorFromPaise(order.shippingInPaise, order.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Discount</dt><dd>{order.discountInPaise ? `−${formatMinorFromPaise(order.discountInPaise, order.currency)}` : formatMinorFromPaise(0, order.currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">GST</dt><dd>{formatMinorFromPaise(order.taxInPaise, order.currency)}</dd></div>
            <div className="flex justify-between border-t-2 border-stone-200 pt-3 text-base font-bold text-[#1c352a]"><dt>Grand Total</dt><dd>{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</dd></div>
          </dl>
        </div>
      </section>

      {isCancelled || isRefunded || refundContent || serviceRequests ? (
        <section className={card}>
          <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">{isCancelled && isCod && !captured ? "Cancellation" : "Refunds & Returns"}</h2></div>
          <div className="space-y-4 p-5">
            {isCancelled && isCod && !captured ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-stone-500">Status</dt><dd className="font-semibold">Cancelled before shipment</dd></div>
                <div><dt className="text-stone-500">Payment collected</dt><dd className="font-semibold">{formatMinorFromPaise(0, order.currency)}</dd></div>
                <div><dt className="text-stone-500">Refund required</dt><dd className="font-semibold">No</dd></div>
              </dl>
            ) : refundContent}
            {serviceRequests}
          </div>
        </section>
      ) : null}

      <section className={card}>
        <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Documents</h2></div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <div className="rounded-lg border border-stone-200 p-4">
            <p className="font-semibold">Tax Invoice</p>
            <p className="mt-1 font-mono text-xs text-stone-500">{invoice?.invoiceNo ?? "Not generated"}</p>
            {invoice?.invoiceNo || invoice?.pdfUrl ? <a href={invoice.downloadUrl ?? adminOrderInvoiceDownloadUrl(order.id)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-[#8a6428] hover:underline">Download</a> : null}
          </div>
          <div className="rounded-lg border border-stone-200 p-4">
            <p className="font-semibold">Delivery Challan</p>
            <p className="mt-1 font-mono text-xs text-stone-500">{deliveryChallan?.challanNumber ?? "Not generated"}</p>
            {deliveryChallan ? <a href={deliveryChallan.downloadUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-[#8a6428] hover:underline">Download</a> : canGenerateChallan ? <button type="button" disabled={challanBusy} onClick={() => onGenerateChallan(false)} className="mt-3 text-sm font-semibold text-[#8a6428] hover:underline disabled:opacity-50">{challanBusy ? "Generating…" : "Generate"}</button> : null}
          </div>
          <div className="rounded-lg border border-stone-200 p-4">{ewayBill}</div>
        </div>
      </section>

      <section className={card}>
        <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Accounting</h2></div>
        <div className="p-5">
          {order.accountingEvents.length ? (
            <div className="space-y-3">
              {order.accountingEvents.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold">{event.eventType === "ORDER_PAID" ? "Sale journal" : event.eventType === "ORDER_CANCELLED" ? "Cancellation reversal" : event.eventType === "ORDER_REFUNDED_FULL" ? "Refund reversal" : humanState(event.eventType)}</p>
                    <p className="mt-0.5 font-mono text-xs text-stone-500">{event.journalEntry?.entryNumber ?? "Journal pending"}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Posted</span>
                </div>
              ))}
              <Link href="/admin/accounting/journals" className="inline-block text-sm font-semibold text-[#8a6428] hover:underline">View journal entries</Link>
            </div>
          ) : <p className="text-sm text-stone-500">No accounting entries have been posted for this order.</p>}
        </div>
      </section>

      <section className={card}>
        <div className={sectionHeader}><h2 className="text-base font-bold text-[#1c352a] dark:text-stone-100">Order Timeline</h2></div>
        <ol className="divide-y divide-stone-100 px-5">
          {timeline.map((item) => (
            <li key={item.key} className="grid gap-1 py-4 sm:grid-cols-[190px_1fr]">
              <time className="text-xs text-stone-500">{new Date(item.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time>
              <div><p className="text-sm font-semibold">{item.title}</p>{item.detail ? <p className="mt-0.5 text-xs text-stone-500">{item.detail}</p> : null}</div>
            </li>
          ))}
        </ol>
      </section>

      <details className={card}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#1c352a]">Marketing attribution</summary>
        <div className="border-t border-stone-100 p-5"><AdminOrderAttributionCard attribution={order.attribution} /></div>
      </details>

      <details className={card}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#1c352a]">Technical details</summary>
        <div className="grid gap-4 border-t border-stone-100 p-5 text-xs md:grid-cols-2">
          <dl className="space-y-2">
            <div><dt className="text-stone-500">Internal order ID</dt><dd className="break-all font-mono">{order.id}</dd></div>
            <div><dt className="text-stone-500">Stored order state</dt><dd className="font-mono">{order.status}</dd></div>
            <div><dt className="text-stone-500">Stored payment state</dt><dd className="font-mono">{order.paymentStatus}</dd></div>
            <div><dt className="text-stone-500">Stored fulfillment state</dt><dd className="font-mono">{order.fulfillmentStatus}</dd></div>
          </dl>
          <div className="space-y-3">
            {(order.payments ?? []).map((p, idx) => (
              <dl key={`${p.provider}-${idx}`} className="space-y-1 rounded-lg bg-stone-50 p-3">
                <div><dt className="text-stone-500">Provider</dt><dd>{p.provider}</dd></div>
                {p.providerOrderId ? <div><dt className="text-stone-500">Provider order ID</dt><dd className="break-all font-mono">{p.providerOrderId}</dd></div> : null}
                {p.providerPaymentId ? <div><dt className="text-stone-500">Provider payment ID</dt><dd className="break-all font-mono">{p.providerPaymentId}</dd></div> : null}
              </dl>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderLoaded | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [invoice, setInvoice] = useState<OrderInvoiceState | null>(null);
  const [deliveryChallan, setDeliveryChallan] = useState<OrderDeliveryChallanState | null>(null);
  const [challanBusy, setChallanBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shipBusy, setShipBusy] = useState<string | null>(null);
  const [shipmentWorkspaceOpen, setShipmentWorkspaceOpen] = useState(false);
  const [pickupOptions, setPickupOptions] = useState<AdminPickupLocationRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState<string>("");
  const [selectedCourier, setSelectedCourier] = useState<string>("AUTO");
  const [itemWarehouses, setItemWarehouses] = useState<Record<string, string>>({});
  const [itemCouriers, setItemCouriers] = useState<Record<string, string>>({});
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkWarehouse, setBulkWarehouse] = useState("");
  const [bulkCourier, setBulkCourier] = useState("AUTO");
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<string | null>(null);
  const [cancelAwbConfirm, setCancelAwbConfirm] = useState<string | null>(null);
  const [manualAwb, setManualAwb] = useState("");
  const [manualTrackingUrl, setManualTrackingUrl] = useState("");
  const [manualCourier, setManualCourier] = useState<
    "DELHIVERY" | "SHIPROCKET" | "FEDEX" | "INDIA_POST" | "OTHER"
  >("FEDEX");
  const [shipChannel] = useState("www.sarveda.com");
  const [shipBoxes, setShipBoxes] = useState<DelhiveryShipBox[]>([defaultShipBox()]);
  const [activeShipBoxIdx, setActiveShipBoxIdx] = useState(0);
  const [shipMode, setShipMode] = useState<"S" | "E">("S");
  const [shipPaymentMode, setShipPaymentMode] = useState<"Pre-paid" | "COD">("Pre-paid");
  const [freightByMode, setFreightByMode] = useState<{ S: number | null; E: number | null }>({
    S: null,
    E: null
  });
  const [freightEstimateBusy, setFreightEstimateBusy] = useState(false);
  const [freightEstimateError, setFreightEstimateError] = useState<string | null>(null);
  const [shipResultModal, setShipResultModal] = useState<{
    success: boolean;
    title: string;
    message: string;
    waybill?: string;
  } | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [addressModal, setAddressModal] = useState<AddressRow | null>(null);
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrDraft, setAddrDraft] = useState({
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "IN"
  });

  const pushToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const raw = (await fetchAdminOrderDetail(id)) as Record<string, unknown>;
      const o = asOrder(raw);
      setOrder(o);
      setSelectedCourier(o.preferredCourier ?? "AUTO");
      const wh: Record<string, string> = {};
      const cr: Record<string, string> = {};
      for (const it of o.items) {
        if (it.id) {
          wh[it.id] = it.pickupLocationId ?? "";
          cr[it.id] = o.preferredCourier ?? "AUTO";
        }
      }
      setItemWarehouses(wh);
      setItemCouriers(cr);
      setSelectedItemIds(new Set());
      setBulkCourier(o.preferredCourier ?? "AUTO");
      const inv = await fetchAdminOrderInvoice(id);
      setInvoice(inv);
      try {
        const dc = await fetchAdminOrderDeliveryChallan(id);
        setDeliveryChallan(
          dc
            ? {
                challanNumber: dc.challanNumber,
                downloadUrl: dc.downloadUrl,
                awb: dc.awb,
                carrier: dc.carrier,
                reasonLabel: dc.reasonLabel
              }
            : null
        );
      } catch {
        setDeliveryChallan(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load order";
      setErr(msg);
      setOrder(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order) return;
    const isCod = (order.payments ?? []).some((p) => p.provider === "COD");
    setShipPaymentMode(isCod ? "COD" : "Pre-paid");
    // Prefill dead weight (~500 g per unit) like the pre-revamp shipment UI.
    const weightGrams = Math.max(
      50,
      order.items.reduce((sum, it) => sum + it.qtyOrdered * 500, 0) || 500
    );
    setShipBoxes([defaultShipBox(weightGrams)]);
    setActiveShipBoxIdx(0);
  }, [order?.id, order?.items]);

  const activeShipBox = shipBoxes[activeShipBoxIdx] ?? shipBoxes[0] ?? defaultShipBox();
  const totalChargeableG = totalChargeableWeightGrams(shipBoxes);
  const boxDimError = validateBoxDimensions(
    activeShipBox.lengthCm,
    activeShipBox.breadthCm,
    activeShipBox.heightCm
  );

  function removeShipBox(idx: number) {
    if (shipBoxes.length <= 1 || idx < 1) return;
    setShipBoxes((prev) => prev.filter((_, i) => i !== idx));
    setActiveShipBoxIdx((prev) => {
      if (prev === idx) return Math.max(0, idx - 1);
      if (prev > idx) return prev - 1;
      return prev;
    });
  }

  useEffect(() => {
    if (!order) {
      setFreightByMode({ S: null, E: null });
      return;
    }
    const shipAddr = order.addresses.find((a) => a.type === "SHIPPING");
    const destPin = shipAddr?.postalCode?.replace(/\D/g, "").slice(0, 6) ?? "";
    const pickup = pickupOptions.find((p) => p.id === selectedPickupId);
    const originPin =
      pickup?.postalCode?.replace(/\D/g, "").slice(0, 6) ||
      process.env.NEXT_PUBLIC_SHIPPING_ORIGIN_PINCODE?.replace(/\D/g, "").slice(0, 6) ||
      "560002";
    if (destPin.length !== 6 || shipBoxes.length === 0) {
      setFreightByMode({ S: null, E: null });
      setFreightEstimateError(null);
      return;
    }
    const dimInvalid = shipBoxes.some(
      (b) => validateBoxDimensions(b.lengthCm, b.breadthCm, b.heightCm) != null
    );
    if (dimInvalid) {
      setFreightByMode({ S: null, E: null });
      setFreightEstimateError("Fix box dimensions to estimate Delhivery freight.");
      return;
    }
    let cancelled = false;
    setFreightEstimateBusy(true);
    setFreightEstimateError(null);
    const t = setTimeout(() => {
      const estimateBody = {
        originPin,
        destPin,
        paymentMode: shipPaymentMode,
        boxes: shipBoxes
      };
      void Promise.all(
        (["S", "E"] as const).map((mode) =>
          adminEstimateDelhiveryCharge({ ...estimateBody, shippingMode: mode }).then(
            (r) => ({ mode, amount: r.totalAmount }),
            () => ({ mode, amount: null as number | null })
          )
        )
      )
        .then((rows) => {
          if (cancelled) return;
          const next = { S: null as number | null, E: null as number | null };
          for (const row of rows) {
            next[row.mode] = row.amount != null && row.amount > 0 ? row.amount : null;
          }
          setFreightByMode(next);
          if (!next.S && !next.E) {
            setFreightEstimateError("Delhivery returned no freight rate. Check API key and pincodes.");
          } else {
            setFreightEstimateError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setFreightByMode({ S: null, E: null });
            setFreightEstimateError(e instanceof Error ? e.message : "Could not fetch Delhivery freight");
          }
        })
        .finally(() => {
          if (!cancelled) setFreightEstimateBusy(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [order, shipBoxes, shipPaymentMode, selectedPickupId, pickupOptions]);

  function formatFreightAmount(amount: number | null | undefined): string {
    if (freightEstimateBusy) return "…";
    if (amount != null && amount > 0) {
      return `₹ ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    }
    return "₹ ---";
  }

  useEffect(() => {
    if (!id) return;
    void fetchAdminPickupLocations({ activeOnly: true })
      .then((list) => {
        setPickupOptions(list);
        setSelectedPickupId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          const primary = list.find((p) => p.isPrimary);
          return primary?.id ?? list[0]?.id ?? "";
        });
      })
      .catch(() => {
        setPickupOptions([]);
        setSelectedPickupId("");
      });
  }, [id]);

  useEffect(() => {
    if (!addressModal) return;
    setAddrDraft({
      fullName: addressModal.fullName,
      phone: addressModal.phone,
      line1: addressModal.line1,
      line2: addressModal.line2 ?? "",
      city: addressModal.city,
      state: addressModal.state,
      postalCode: addressModal.postalCode,
      country: addressModal.country || "IN"
    });
  }, [addressModal]);

  async function handleStatusConfirm() {
    const nextStatus = statusConfirm;
    if (!id || !nextStatus || !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
      setStatusConfirm(null);
      return;
    }
    setStatusSaving(true);
    try {
      await patchAdminOrderStatus(id, nextStatus);
      setStatusConfirm(null);
      await load();
      pushToast(`Order status updated to ${nextStatus.replace(/_/g, " ")}`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Update failed", true);
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleSyncAllTracking() {
    if (!id) return;
    setShipBusy("sync-all");
    try {
      await adminSyncOrderShipments(id);
      await load();
      pushToast("Tracking refreshed from carriers.");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Sync failed", true);
    } finally {
      setShipBusy(null);
    }
  }

  function applyBulkToSelected() {
    if (!order) return;
    const ids =
      selectedItemIds.size > 0
        ? Array.from(selectedItemIds)
        : order.items.map((it) => it.id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    if (bulkWarehouse) {
      setItemWarehouses((prev) => {
        const next = { ...prev };
        for (const itemId of ids) next[itemId] = bulkWarehouse;
        return next;
      });
    }
    if (bulkCourier) {
      setSelectedCourier(bulkCourier);
      setItemCouriers((prev) => {
        const next = { ...prev };
        for (const itemId of ids) next[itemId] = bulkCourier;
        return next;
      });
    }
    pushToast(`Applied to ${ids.length} line item(s). Save by creating shipment.`);
  }

  function toggleSelectItem(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleSelectAllItems() {
    if (!order) return;
    const ids = order.items.map((it) => it.id).filter(Boolean) as string[];
    setSelectedItemIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }

  async function persistLineShippingPrefs(): Promise<void> {
    if (!id || !order) return;
    const courier =
      selectedCourier ||
      order.items.map((it) => (it.id ? itemCouriers[it.id] : null)).find(Boolean) ||
      "AUTO";
    if (courier !== (order.preferredCourier ?? "AUTO")) {
      await patchAdminOrderPreferredCourier(
        id,
        courier as "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL"
      );
    }
    const warehouseRows = Object.entries(itemWarehouses)
      .filter(([orderItemId]) => orderItemId)
      .map(([orderItemId, pickupLocationId]) => ({
        orderItemId,
        pickupLocationId: pickupLocationId || null
      }));
    if (warehouseRows.length > 0) {
      await patchAdminOrderItemWarehouses(id, warehouseRows);
    }
  }

  async function handleRetryShipment() {
    if (!id || !order) return;
    const invalidBox = shipBoxes.find(
      (b) => validateBoxDimensions(b.lengthCm, b.breadthCm, b.heightCm) != null
    );
    if (invalidBox) {
      setShipResultModal({
        success: false,
        title: "Invalid box dimensions",
        message:
          validateBoxDimensions(
            invalidBox.lengthCm,
            invalidBox.breadthCm,
            invalidBox.heightCm
          ) ?? "Each box needs positive integer dimensions (min 5 cm per side, L+B+H ≥ 15 cm)."
      });
      return;
    }
    setShipBusy("create");
    try {
      await persistLineShippingPrefs();
      const primaryPickup =
        Object.values(itemWarehouses).find((v) => v) || selectedPickupId || undefined;
      const created = await adminCreateShipmentForOrder(id, {
        ...(primaryPickup ? { pickupLocationId: primaryPickup } : {}),
        preferredCourier: "DELHIVERY",
        channel: shipChannel,
        paymentMode: shipPaymentMode,
        lengthCm: activeShipBox.lengthCm,
        breadthCm: activeShipBox.breadthCm,
        heightCm: activeShipBox.heightCm,
        weightGrams: activeShipBox.weightGrams,
        packageType: activeShipBox.packageType,
        shippingMode: shipMode,
        delhiveryFreightInr: freightByMode[shipMode] ?? undefined,
        chargeableGrams: totalChargeableG,
        customerShippingInPaise: order.shippingInPaise,
        boxes: shipBoxes
      });
      await load();
      setShipmentWorkspaceOpen(false);
      setShipResultModal({
        success: true,
        title: "Shipment created",
        message: `AWB ${created.waybill} is ready. Download the Delhivery label from the shipments section below.`,
        waybill: created.waybill
      });
      pushToast(`Shipment created — AWB ${created.waybill}`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not create shipment. Check box details and Delhivery settings.";
      // Close create modal first so the result dialog is not buried under the blurry overlay.
      setShipmentWorkspaceOpen(false);
      setShipResultModal({
        success: false,
        title: "Shipment creation failed",
        message
      });
      pushToast(message, true);
      void load();
    } finally {
      setShipBusy(null);
    }
  }

  async function handleCreateReturn() {
    if (!id) return;
    setShipBusy("reverse");
    try {
      const primaryPickup = selectedPickupId || undefined;
      const created = await adminCreateReverseShipment(id, {
        ...(primaryPickup ? { pickupLocationId: primaryPickup } : {}),
        channel: shipChannel,
        shippingMode: shipMode,
        reason: "Customer return",
        weightGrams: activeShipBox.weightGrams,
        lengthCm: activeShipBox.lengthCm,
        breadthCm: activeShipBox.breadthCm,
        heightCm: activeShipBox.heightCm
      });
      await load();
      pushToast(`Delhivery return AWB ${created.waybill} created.`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Return pickup failed", true);
    } finally {
      setShipBusy(null);
    }
  }

  async function handleSaveManualAwb() {
    if (!id) return;
    const awb = manualAwb.trim();
    if (!awb) {
      pushToast("Enter an AWB number.", true);
      return;
    }
    setShipBusy("manual-awb");
    try {
      await adminSaveManualAwb(id, {
        awb,
        courier: manualCourier,
        ...(manualTrackingUrl.trim() ? { trackingUrl: manualTrackingUrl.trim() } : {})
      });
      setManualAwb("");
      setManualTrackingUrl("");
      await load();
      pushToast("Manual AWB saved.");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to save AWB", true);
    } finally {
      setShipBusy(null);
    }
  }

  async function handleTrackOne(awb: string) {
    setShipBusy(awb);
    try {
      await adminTrackShipmentByWaybill(awb);
      await load();
      pushToast("Shipment status synced from carrier.");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Track failed", true);
    } finally {
      setShipBusy(null);
    }
  }

  async function confirmCancelWaybill(localOnly = false) {
    const awb = cancelAwbConfirm;
    if (!awb) return;
    setShipBusy(`cancel-${awb}`);
    try {
      const r = await adminCancelWaybill(awb, { localOnly });
      setCancelAwbConfirm(null);
      await load();
      if (r.carrierAlreadyCancelled || r.localOnly) {
        pushToast("Label removed in Sarveda. You can create a new Delhivery label.");
      } else {
        pushToast("Delhivery label cancelled. Local shipment removed so you can retry.");
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Cancel failed", true);
    } finally {
      setShipBusy(null);
    }
  }

  async function handleSaveAddress() {
    if (!id || !addressModal) return;
    setAddrSaving(true);
    try {
      await patchAdminOrderAddress(id, {
        type: addressModal.type as "SHIPPING" | "BILLING",
        fullName: addrDraft.fullName.trim(),
        phone: addrDraft.phone.trim(),
        line1: addrDraft.line1.trim(),
        line2: addrDraft.line2.trim() || null,
        city: addrDraft.city.trim(),
        state: addrDraft.state.trim(),
        postalCode: addrDraft.postalCode.trim(),
        country: addrDraft.country.trim().toUpperCase()
      });
      setAddressModal(null);
      await load();
      pushToast("Address updated.");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Save failed", true);
    } finally {
      setAddrSaving(false);
    }
  }

  async function handleReconcileRazorpay() {
    if (!id) return;
    setReconcileBusy(true);
    try {
      const r = await reconcileAdminOrderRazorpay(id);
      if (r.updated) {
        await load();
        pushToast(`Razorpay reconciled: payment captured (${r.razorpayPaymentId ?? ""}).`);
      } else {
        pushToast(r.reason ?? "No captured payment found on Razorpay yet.");
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Reconcile failed", true);
    } finally {
      setReconcileBusy(false);
    }
  }

  function carrierUiEnabled(o: OrderLoaded): boolean {
    if (["CANCELLED", "REFUNDED", "PENDING_PAYMENT"].includes(o.status)) return false;
    const isCodPaid =
      o.status === "PAID" &&
      o.paymentStatus === "PENDING" &&
      (o.payments ?? []).some((p) => p.provider === "COD");
    if (o.paymentStatus !== "CAPTURED" && !isCodPaid) return false;
    return ["PAID", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(o.status);
  }

  if (err && !order) {
    return (
      <div>
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-gold transition-colors hover:text-brand-forest mt-4 dark:text-amber-400"
        >
          <ChevronLeft size={14} />
          Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading order">
        <AdminSkeleton height={72} style={{ borderRadius: 16 }} />
        <div className="grid gap-4 md:grid-cols-2">
          <AdminSkeleton height={180} style={{ borderRadius: 16 }} />
          <AdminSkeleton height={180} style={{ borderRadius: 16 }} />
        </div>
        <AdminSkeletonLines lines={5} />
      </div>
    );
  }

  const hasRazorpay = (order.payments ?? []).some((p) => p.provider === "RAZORPAY");
  const shipUi = carrierUiEnabled(order);
  const awbRows = allOrderAwbRows(order.shipments);
  const forwardShipment = primaryForwardShipment(order.shipments);
  const hasForwardAwb = !!forwardShipment?.awb?.trim();
  const forwardMeta = forwardShipment?.carrierMeta;
  const bookingBoxes =
    forwardMeta?.boxes && forwardMeta.boxes.length > 0
      ? forwardMeta.boxes
      : forwardMeta?.lengthCm
        ? [
            {
              lengthCm: forwardMeta.lengthCm,
              breadthCm: forwardMeta.breadthCm ?? 0,
              heightCm: forwardMeta.heightCm ?? 0,
              weightGrams: forwardMeta.weightGrams ?? 0,
              packageType: "CARDBOARD_BOX"
            }
          ]
        : [];
  const canInitiateReturn = ["DELIVERED", "SHIPPED"].includes(order.status);
  const customerShippingCharged =
    forwardMeta?.customerShippingInPaise ?? order.shippingInPaise;
  const delhiveryFreightBooked = forwardMeta?.delhiveryFreightInr;
  const bookedPaymentMode =
    forwardMeta?.paymentMode ??
    ((order.payments ?? []).some((p) => p.provider === "COD") ? "COD" : "Pre-paid");
  const bookedShippingMode = forwardMeta?.shippingMode ?? null;
  const bookedChargeableG =
    forwardMeta?.chargeableGrams ??
    (bookingBoxes.length
      ? bookingBoxes.reduce(
          (sum, b) =>
            sum +
            breakdownChargeableWeight({
              lengthCm: b.lengthCm,
              breadthCm: b.breadthCm,
              heightCm: b.heightCm,
              weightGrams: b.weightGrams,
              packageType: (b.packageType as "PLASTIC_COVER" | "CARDBOARD_BOX") ?? "CARDBOARD_BOX"
            }).chargeableGrams,
          0
        )
      : null);
  async function handleGenerateDeliveryChallan(refreshShipment = false) {
    if (!id || challanBusy) return;
    setChallanBusy(true);
    try {
      const dc = await generateAdminOrderDeliveryChallan(id, {
        reason: "SUPPLY_DELIVERY",
        refreshShipment
      });
      setDeliveryChallan({
        challanNumber: dc.challanNumber,
        downloadUrl: dc.downloadUrl,
        awb: dc.awb,
        carrier: dc.carrier,
        reasonLabel: dc.reasonLabel
      });
      pushToast(
        refreshShipment
          ? "Delivery challan updated with current AWB"
          : dc.created
            ? "Delivery challan generated"
            : "Delivery challan already exists"
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Could not generate delivery challan", true);
    } finally {
      setChallanBusy(false);
    }
  }

  /** When the line-item refund panel can run, it is the only refund control on the page. */
  const lineRefundAvailable =
    order.payments?.[0]?.provider !== "COD" &&
    !order.shipments.some((s) => s.status === "RTO" || s.rtoAt) &&
    !["CANCELLED", "REFUNDED"].includes(order.status) &&
    ["CAPTURED", "PARTIALLY_REFUNDED"].includes(order.paymentStatus);

  const showRefundActions =
    !order.shipments.some((s) => s.status === "RTO" || s.rtoAt) &&
    !["CANCELLED", "REFUNDED", "DELIVERED"].includes(order.status) &&
    ((order.paymentStatus === "CAPTURED" &&
      ["PAID", "PROCESSING", "PACKED", "SHIPPED"].includes(order.status)) ||
      order.status === "PENDING_PAYMENT" ||
      order.paymentStatus === "PENDING" ||
      order.paymentStatus === "FAILED");

  const canGenerateChallan =
    order.status !== "CANCELLED" &&
    order.status !== "REFUNDED" &&
    !(order.status === "PENDING_PAYMENT" && order.paymentStatus === "PENDING" &&
      !(order.payments ?? []).some((p) => p.provider === "COD"));
  const hasAwb = order.shipments.some((s) => s.awb?.trim());

  return (
    <div className="space-y-8">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <AdminConfirmModal
        open={statusConfirm !== null}
        title="Update order status?"
        message={
          statusConfirm === "DELIVERED" && order.status === "DELIVERED"
            ? "Confirm delivery state? This syncs shipment tracking to Delivered, sets fulfillment to Fulfilled, and establishes the return-window start time without changing an existing delivered timestamp."
            : statusConfirm
              ? `Change status to “${statusConfirm.replace(/_/g, " ")}”? This may trigger fulfilment actions (for example auto-shipment when moving to Processing).`
              : ""
        }
        confirmLabel="Yes, update"
        busy={statusSaving}
        onClose={() => setStatusConfirm(null)}
        onConfirm={() => void handleStatusConfirm()}
      />

      <AdminConfirmModal
        open={cancelAwbConfirm !== null}
        title="Cancel Delhivery label?"
        message={
          cancelAwbConfirm
            ? `Cancel AWB ${cancelAwbConfirm} on Delhivery (voids the AWB there, including child boxes for multi-piece shipments) and remove it from Sarveda. If you already cancelled in the Delhivery dashboard, use “Remove label only” — that only clears Sarveda. This does not cancel the Sarveda order.`
            : ""
        }
        confirmLabel="Cancel on Delhivery"
        secondaryConfirmLabel="Remove label only (Sarveda)"
        onSecondaryConfirm={() => void confirmCancelWaybill(true)}
        danger
        busy={!!shipBusy}
        onClose={() => setCancelAwbConfirm(null)}
        onConfirm={() => void confirmCancelWaybill(false)}
      />

      {shipResultModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
              role="dialog"
              aria-modal="true"
              style={{ position: "fixed", inset: 0 }}
            >
              <div
                className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-600 dark:bg-stone-900"
                style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.24)" }}
              >
                <div
                  style={{
                    height: "3px",
                    background: "linear-gradient(90deg, #b98a3e, #e9d6ae, #b98a3e)",
                    borderRadius: "12px 12px 0 0",
                    margin: "-24px -24px 20px"
                  }}
                />
                <h2
                  className={`text-xl font-bold tracking-tight ${
                    shipResultModal.success
                      ? "text-emerald-900 dark:text-emerald-200"
                      : "text-red-900 dark:text-red-200"
                  }`}
                >
                  {shipResultModal.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                  {shipResultModal.message}
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  {shipResultModal.success && shipResultModal.waybill ? (
                    <a
                      href={delhiveryLabelUrl(shipResultModal.waybill)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-100"
                    >
                      Open label
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShipResultModal(null)}
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-50 dark:bg-stone-100 dark:text-stone-900"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {addressModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-600 dark:bg-stone-900" style={{ boxShadow: "0 32px 64px rgba(0,0,0,0.24)" }}>
            <div
              style={{
                height: "3px",
                background: "linear-gradient(90deg, #b98a3e, #e9d6ae, #b98a3e)",
                borderRadius: "12px 12px 0 0",
                margin: "-24px -24px 20px"
              }}
            />
            <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Edit {addressModal.type.toLowerCase()} address
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Full name</span>
                <input
                  value={addrDraft.fullName}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">Phone</span>
                <input
                  value={addrDraft.phone}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">Country</span>
                <input
                  value={addrDraft.country}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, country: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Address line 1</span>
                <input
                  value={addrDraft.line1}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, line1: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Address line 2</span>
                <input
                  value={addrDraft.line2}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, line2: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">City</span>
                <input
                  value={addrDraft.city}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">State</span>
                <input
                  value={addrDraft.state}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, state: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Postal code</span>
                <input
                  value={addrDraft.postalCode}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, postalCode: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 transition-colors duration-150 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={addrSaving}
                onClick={() => setAddressModal(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
              >
                Close
              </button>
              <button
                type="button"
                disabled={addrSaving}
                onClick={() => void handleSaveAddress()}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2 text-sm font-semibold text-stone-950 shadow-sm transition-all duration-150 hover:from-amber-500 hover:to-amber-400 hover:shadow-md disabled:opacity-50"
              >
                {addrSaving ? "Saving…" : "Save address"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand-gold transition-colors hover:text-brand-forest dark:text-amber-400">
        <ChevronLeft size={14} />
        Orders
      </Link>
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {err}
        </p>
      ) : null}
      <AdminOrderProductionView
        order={order}
        invoice={invoice}
        deliveryChallan={deliveryChallan}
        challanBusy={challanBusy}
        canGenerateChallan={canGenerateChallan}
        shipBusy={shipBusy}
        shipUi={shipUi}
        onCreateShipment={() => setShipmentWorkspaceOpen(true)}
        onGenerateChallan={(refresh) => void handleGenerateDeliveryChallan(refresh)}
        onEditAddress={(address) => {
          setAddressModal(address);
          setAddrDraft({
            fullName: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2 ?? "",
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country
          });
        }}
        onStatusChange={(status) => setStatusConfirm(status)}
        statusSaving={statusSaving}
        dangerActions={
          showRefundActions && !lineRefundAvailable ? (
            <RefundCancelPanel
              compact
              orderId={order.id}
              status={order.status}
              paymentStatus={order.paymentStatus}
              onDone={() => void load()}
            />
          ) : null
        }
        refundContent={
          order.payments?.[0]?.provider !== "COD" &&
          ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.paymentStatus) ? (
            <>
              {lineRefundAvailable ? (
                <AdminOrderLineRefund
                  orderId={order.id}
                  currency={order.currency}
                  refreshKey={`${order.status}:${order.paymentStatus}:${order.payments?.[0]?.refundedInPaise ?? 0}`}
                  onRefunded={() => void load()}
                />
              ) : (
                <AdminOrderRefundPreview
                  orderId={order.id}
                  currency={order.currency}
                  refreshKey={`${order.status}:${order.paymentStatus}:${order.payments?.[0]?.refundedInPaise ?? 0}`}
                />
              )}
              <AdminOrderRtoWorkflow orderId={order.id} currency={order.currency} onUpdated={() => void load()} />
            </>
          ) : null
        }
        serviceRequests={
          order.serviceRequests?.length ? (
            <AdminOrderServiceRequests
              orderId={order.id}
              requests={order.serviceRequests}
              orderCtx={{
                currency: order.currency,
                grandTotalInPaise: order.grandTotalInPaise,
                paymentStatus: order.paymentStatus,
                paymentProvider: order.payments?.[0]?.provider ?? null,
                paymentRefundedInPaise: order.payments?.[0]?.refundedInPaise ?? 0,
                orderItems: order.items.map((i) => ({
                  id: i.id ?? "",
                  lineTotalInPaise: i.lineTotalInPaise
                }))
              }}
              onUpdated={() => void load()}
            />
          ) : null
        }
        ewayBill={<AdminOrderEwayBillCard orderId={id} onToast={pushToast} />}
        shipmentSetup={null}
      />

      {shipmentWorkspaceOpen && shipUi && !hasForwardAwb ? (
        <div
          className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-shipment-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !shipBusy) setShipmentWorkspaceOpen(false);
          }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-600 dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-700">
              <div>
                <h2 id="create-shipment-title" className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">
                  Create shipment
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Delhivery shipment — facility, box details, and shipping mode. AWBs are generated via Delhivery API.
                </p>
              </div>
              <button
                type="button"
                disabled={!!shipBusy}
                onClick={() => setShipmentWorkspaceOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50 dark:hover:bg-stone-800"
              >
                Close
              </button>
            </div>
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Order details</p>
                  <label className="mt-2 block">
                    <span className="text-xs text-stone-500">Channel</span>
                    <input
                      readOnly
                      value={shipChannel}
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-xs text-stone-500">Order ID</span>
                    <input
                      readOnly
                      value={order.orderNumber}
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Select facility *</p>
                  <select
                    value={selectedPickupId}
                    onChange={(e) => setSelectedPickupId(e.target.value)}
                    disabled={!pickupOptions.length}
                    className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  >
                    {pickupOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.delhiveryPickupName || p.label}
                        {p.city ? ` · ${p.city}` : ""}
                      </option>
                    ))}
                  </select>
                  {pickupOptions.length === 0 ? (
                    <Link
                      href="/admin/settings/pickup-locations"
                      className="mt-2 inline-block text-xs text-amber-800 underline dark:text-amber-400"
                    >
                      Add pickup locations first →
                    </Link>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Products to ship</p>
                  <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
                    {order.items.map((it, i) => (
                      <li key={it.id ?? i} className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-stone-800 dark:text-stone-100">{it.nameSnapshot}</span>
                        <span className="font-mono text-xs text-stone-500">
                          {it.skuSnapshot} × {it.qtyOrdered}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Payment mode</span>
                  <select
                    value={shipPaymentMode}
                    onChange={(e) => setShipPaymentMode(e.target.value as "Pre-paid" | "COD")}
                    className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  >
                    <option value="Pre-paid">Pre-Paid</option>
                    <option value="COD">Cash On Delivery</option>
                  </select>
                </label>
              </div>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Box details</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {shipBoxes.map((_, idx) => (
                      <div key={idx} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveShipBoxIdx(idx)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                            activeShipBoxIdx === idx
                              ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                              : "border-stone-300 text-stone-600 dark:border-stone-600"
                          }`}
                        >
                          Box {idx + 1}
                        </button>
                        {idx > 0 ? (
                          <button
                            type="button"
                            title={`Remove box ${idx + 1}`}
                            onClick={() => removeShipBox(idx)}
                            className="rounded-md border border-red-200 px-1.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {shipBoxes.length < MAX_SHIP_BOXES ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShipBoxes((prev) => [...prev, defaultShipBox(activeShipBox.weightGrams)]);
                          setActiveShipBoxIdx(shipBoxes.length);
                        }}
                        className="rounded-md border border-dashed border-stone-400 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:border-stone-500"
                      >
                        + Add box
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs text-stone-500">Package type</span>
                  <select
                    value={activeShipBox.packageType}
                    onChange={(e) => {
                      const packageType = e.target.value as DelhiveryShipBox["packageType"];
                      setShipBoxes((prev) =>
                        prev.map((b, i) => (i === activeShipBoxIdx ? { ...b, packageType } : b))
                      );
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  >
                    <option value="PLASTIC_COVER">Plastic cover / Flyer</option>
                    <option value="CARDBOARD_BOX">Cardboard Box</option>
                  </select>
                </label>
                <hr className="my-4 border-stone-100 dark:border-stone-800" />
                <div>
                  <label className="block">
                    <span className="text-xs text-stone-500">Box size preset</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                      defaultValue=""
                      onChange={(e) => {
                        const preset = SHIP_BOX_PRESETS.find((p) => p.id === e.target.value);
                        if (!preset) return;
                        setShipBoxes((prev) =>
                          prev.map((b, i) =>
                            i === activeShipBoxIdx
                              ? {
                                  ...b,
                                  lengthCm: preset.lengthCm,
                                  breadthCm: preset.breadthCm,
                                  heightCm: preset.heightCm,
                                  packageType: "CARDBOARD_BOX"
                                }
                              : b
                          )
                        );
                        e.target.value = "";
                      }}
                    >
                      <option value="">Select standard size…</option>
                      {SHIP_BOX_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Size (cm) — freely editable
                  </span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {(["lengthCm", "breadthCm", "heightCm"] as const).map((field) => (
                      <label key={field} className="block text-[11px] text-stone-500">
                        {field === "lengthCm" ? "Length" : field === "breadthCm" ? "Breadth" : "Height"}
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={activeShipBox[field] > 0 ? String(activeShipBox[field]) : ""}
                          onChange={(e) => {
                            setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, field, e.target.value));
                          }}
                          className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                        />
                      </label>
                    ))}
                  </div>
                  {boxDimError ? (
                    <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">{boxDimError}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-stone-500">
                      Positive integers only. Min 5 cm per side; L + B + H ≥ 15 cm.
                    </p>
                  )}
                </div>
                <label className="block">
                  <span className="text-xs text-stone-500">Package weight (gm) — integer</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={activeShipBox.weightGrams > 0 ? String(activeShipBox.weightGrams) : ""}
                    onChange={(e) => {
                      setShipBoxes((prev) => patchActiveBoxWeight(prev, activeShipBoxIdx, e.target.value));
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <hr className="my-4 border-stone-100 dark:border-stone-800" />
                <div>
                  <span className="text-xs text-stone-500">Shipping mode</span>
                  <div className="relative mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShipMode("S")}
                        className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                          shipMode === "S"
                            ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                            : "border-stone-300 text-stone-700 dark:border-stone-600"
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-widest text-stone-500">Surface</span>
                        <span className="mt-1 block text-base font-bold">{formatFreightAmount(freightByMode.S)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShipMode("E")}
                        className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                          shipMode === "E"
                            ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                            : "border-stone-300 text-stone-700 dark:border-stone-600"
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-widest text-stone-500">Express</span>
                        <span className="mt-1 block text-base font-bold">{formatFreightAmount(freightByMode.E)}</span>
                      </button>
                    </div>
                    {freightEstimateBusy ? (
                      <div
                        className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px] dark:bg-stone-950/75"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                      >
                        <div className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-3.5 py-2 shadow-sm dark:border-stone-600 dark:bg-stone-900">
                          <div
                            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-[#1c352a]"
                            aria-hidden
                          />
                          <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                            Calculating…
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">
                    Total chargeable:{" "}
                    <strong>{totalChargeableG.toLocaleString("en-IN")} gm</strong>
                    {freightEstimateError ? (
                      <span className="ml-2 text-red-600 dark:text-red-400">{freightEstimateError}</span>
                    ) : null}
                  </p>
                </div>
                <hr className="my-4 border-stone-100 dark:border-stone-800" />
                <button
                  type="button"
                  disabled={!!shipBusy || !pickupOptions.length || !!boxDimError || totalChargeableG <= 0}
                  onClick={() => void handleRetryShipment()}
                  className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-amber-50 transition-all duration-150 hover:bg-stone-800 hover:shadow-md disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
                >
                  {shipBusy === "create" ? "Creating AWB…" : "Create shipment to Delhivery"}
                </button>
                {shipBusy === "create" ? (
                  <p className="mt-2 text-center text-xs font-medium text-stone-500">
                    Calling Delhivery — please wait for success or failure…
                  </p>
                ) : null}
                {order.shippingLastError ? (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    Last error: {order.shippingLastError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {process.env.NEXT_PUBLIC_LEGACY_ORDER_DETAIL === "1" ? ((order: OrderLoaded, invoice: OrderInvoiceState | null, deliveryChallan: OrderDeliveryChallanState | null) => (
        <>
      <div>
        <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand-gold transition-colors hover:text-brand-forest dark:text-amber-400">
          <ChevronLeft size={14} />
          Orders
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-stone-800 dark:text-stone-100" style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, sans-serif", fontWeight: 800 }}>{order.orderNumber}</h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  isUnpaidCheckoutAttempt(
                    order.status,
                    order.paymentStatus,
                    order.payments?.[0]?.provider
                  )
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                    : order.status === "CANCELLED"
                      ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                      : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                }`}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "currentColor",
                    display: "inline-block",
                    marginRight: "5px",
                    flexShrink: 0
                  }}
                />
                {formatAdminOrderStatusLabel(
                  order.status,
                  order.paymentStatus,
                  order.payments?.[0]?.provider
                )}
              </span>
              {parseOrderNotes(order.notes).giftWrap ? (
                <span className="rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100">
                  🎁 Gift wrap requested
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{order.email}</p>
            {(() => {
              const { customerNote, internalNotes } = parseOrderNotes(order.notes);
              if (!customerNote && !internalNotes) return null;
              return (
                <div className="mt-3 max-w-xl space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm dark:border-amber-800/50 dark:bg-amber-950/20">
                  {customerNote ? (
                    <p className="text-stone-800 dark:text-stone-200">
                      <span className="font-semibold text-amber-900 dark:text-amber-200">Customer note:</span>{" "}
                      {customerNote}
                    </p>
                  ) : null}
                  {internalNotes ? (
                    <p className="text-stone-600 dark:text-stone-400">
                      <span className="font-medium">Internal:</span> {internalNotes}
                    </p>
                  ) : null}
                </div>
              );
            })()}
            {isUnpaidCheckoutAttempt(
              order.status,
              order.paymentStatus,
              order.payments?.[0]?.provider
            ) ? (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
                Abandoned checkout — the customer never completed payment. Hidden from My Orders. Stock was released.
                Database status stays CANCELLED so inventory and reporting stay consistent.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
              <span>Order status</span>
              <select
                value={order.status}
                disabled={statusSaving}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== order.status) setStatusConfirm(v);
                }}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 font-medium text-stone-800 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "CANCELLED" &&
                    isUnpaidCheckoutAttempt(
                      order.status,
                      order.paymentStatus,
                      order.payments?.[0]?.provider
                    )
                      ? "Abandoned"
                      : s === "CANCELLED"
                        ? "Cancelled"
                        : s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Payment: {order.paymentStatus.replace(/_/g, " ")} ({order.currency})
            </p>
            {hasRazorpay ? (
              <button
                type="button"
                disabled={reconcileBusy}
                onClick={() => void handleReconcileRazorpay()}
                className="rounded-lg border border-amber-700/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-500/20 disabled:opacity-50 dark:border-amber-500/50 dark:text-amber-200"
              >
                {reconcileBusy ? "Checking Razorpay…" : "Sync payment (Razorpay)"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <AdminOrderRefundPreview
        orderId={order.id}
        currency={order.currency}
        refreshKey={`${order.status}:${order.paymentStatus}:${order.payments?.[0]?.refundedInPaise ?? 0}`}
      />

      <AdminOrderRtoWorkflow orderId={order.id} currency={order.currency} onUpdated={() => void load()} />

      {order.serviceRequests?.length ? (
        <AdminOrderServiceRequests
          orderId={order.id}
          requests={order.serviceRequests}
          orderCtx={{
            currency: order.currency,
            grandTotalInPaise: order.grandTotalInPaise,
            paymentStatus: order.paymentStatus,
            paymentProvider: order.payments?.[0]?.provider ?? null,
            paymentRefundedInPaise: order.payments?.[0]?.refundedInPaise ?? 0,
            orderItems: order.items.map((i) => ({
              id: i.id ?? "",
              lineTotalInPaise: i.lineTotalInPaise
            }))
          }}
          onUpdated={() => void load()}
        />
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Documents</p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
            {invoice ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Tax Invoice</p>
                {invoice.invoiceNo ? (
                  <p className="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">{invoice.invoiceNo}</p>
                ) : null}
                {invoice.invoiceNo || invoice.pdfUrl ? (
                  <a
                    href={invoice.downloadUrl ?? adminOrderInvoiceDownloadUrl(id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-[34px] items-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 no-underline hover:bg-amber-400"
                  >
                    Download PDF
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-stone-400 dark:text-stone-500">Invoice PDF not generated yet</p>
                )}
              </div>
            ) : null}

            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Delivery Challan</p>
              {deliveryChallan ? (
                <>
                  <p className="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">
                    {deliveryChallan.challanNumber}
                  </p>
                  {deliveryChallan.reasonLabel ? (
                    <p className="mt-1 text-xs text-stone-500">{deliveryChallan.reasonLabel}</p>
                  ) : null}
                  {deliveryChallan.awb ? (
                    <p className="mt-1 text-xs text-stone-500">
                      AWB {deliveryChallan.awb}
                      {deliveryChallan.carrier ? ` · ${deliveryChallan.carrier}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-stone-400">No AWB on challan snapshot yet</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={deliveryChallan.downloadUrl || adminOrderDeliveryChallanDownloadUrl(id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[34px] items-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-stone-900 no-underline hover:bg-amber-400"
                    >
                      Download PDF
                    </a>
                    {hasAwb ? (
                      <button
                        type="button"
                        disabled={challanBusy}
                        onClick={() => void handleGenerateDeliveryChallan(true)}
                        className="inline-flex min-h-[34px] items-center rounded-full border border-stone-300 px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                      >
                        {challanBusy ? "Updating…" : "Refresh AWB on PDF"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : canGenerateChallan ? (
                <>
                  <p className="mt-1 text-xs text-stone-500">
                    Logistics document for goods movement — not a tax invoice.
                  </p>
                  <button
                    type="button"
                    disabled={challanBusy}
                    onClick={() => void handleGenerateDeliveryChallan(false)}
                    className="mt-3 inline-flex min-h-[34px] items-center rounded-full border border-stone-700 bg-stone-800 px-4 text-sm font-semibold text-amber-50 hover:bg-stone-700 disabled:opacity-50 dark:border-stone-500 dark:bg-stone-200 dark:text-stone-900"
                  >
                    {challanBusy ? "Generating…" : "Generate Delivery Challan"}
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-stone-400 dark:text-stone-500">
                  Available after payment (or COD confirmation).
                </p>
              )}
            </div>

            <div className="min-w-0">
              <AdminOrderEwayBillCard orderId={id} onToast={pushToast} />
            </div>

            {hasAwb ? (
              <div className="min-w-0 sm:col-span-2">
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Shipping labels / AWB</p>
                <p className="mt-1 text-xs text-stone-500">
                  Carrier packing slips and AWB actions are in the Shipping section below.
                </p>
              </div>
            ) : null}
          </div>
          {showRefundActions ? (
            <RefundCancelPanel
              compact
              orderId={order.id}
              status={order.status}
              paymentStatus={order.paymentStatus}
              onDone={() => void load()}
            />
          ) : null}
        </div>
      </div>

      {!order.shipments.some((s) => s.awb?.trim()) && shipUi ? (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b border-stone-100 px-5 py-4 dark:border-stone-700">
            <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">Create shipment</h2>
            <p className="mt-1 text-xs text-stone-500">
              Delhivery shipment — facility, box details, and shipping mode. AWBs are generated via Delhivery API.
            </p>
          </div>
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Order details</p>
                <label className="mt-2 block">
                  <span className="text-xs text-stone-500">Channel</span>
                  <input
                    readOnly
                    value={shipChannel}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="text-xs text-stone-500">Order ID</span>
                  <input
                    readOnly
                    value={order.orderNumber}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Select facility *</p>
                <select
                  value={selectedPickupId}
                  onChange={(e) => setSelectedPickupId(e.target.value)}
                  disabled={!pickupOptions.length}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                >
                  {pickupOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.delhiveryPickupName || p.label}
                      {p.city ? ` · ${p.city}` : ""}
                    </option>
                  ))}
                </select>
                {pickupOptions.length === 0 ? (
                  <Link
                    href="/admin/settings/pickup-locations"
                    className="mt-2 inline-block text-xs text-amber-800 underline dark:text-amber-400"
                  >
                    Add pickup locations first →
                  </Link>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Products to ship</p>
                <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-700 dark:border-stone-700">
                  {order.items.map((it, i) => (
                    <li key={it.id ?? i} className="flex justify-between px-3 py-2 text-sm">
                      <span className="text-stone-800 dark:text-stone-100">{it.nameSnapshot}</span>
                      <span className="font-mono text-xs text-stone-500">
                        {it.skuSnapshot} × {it.qtyOrdered}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Payment mode</span>
                <select
                  value={shipPaymentMode}
                  onChange={(e) =>
                    setShipPaymentMode(e.target.value as "Pre-paid" | "COD")
                  }
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                >
                  <option value="Pre-paid">Pre-Paid</option>
                  <option value="COD">Cash On Delivery</option>
                </select>
              </label>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Box details</p>
                <div className="flex flex-wrap items-center gap-1">
                  {shipBoxes.map((_, idx) => (
                    <div key={idx} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveShipBoxIdx(idx)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                          activeShipBoxIdx === idx
                            ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                            : "border-stone-300 text-stone-600 dark:border-stone-600"
                        }`}
                      >
                        Box {idx + 1}
                      </button>
                      {idx > 0 ? (
                        <button
                          type="button"
                          title={`Remove box ${idx + 1}`}
                          onClick={() => removeShipBox(idx)}
                          className="rounded-md border border-red-200 px-1.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {shipBoxes.length < MAX_SHIP_BOXES ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShipBoxes((prev) => [...prev, defaultShipBox(activeShipBox.weightGrams)]);
                        setActiveShipBoxIdx(shipBoxes.length);
                      }}
                      className="rounded-md border border-dashed border-stone-400 px-2.5 py-1 text-xs font-semibold text-stone-600 dark:border-stone-500"
                    >
                      + Add box
                    </button>
                  ) : null}
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-stone-500">Package type</span>
                <select
                  value={activeShipBox.packageType}
                  onChange={(e) => {
                    const packageType = e.target.value as DelhiveryShipBox["packageType"];
                    setShipBoxes((prev) =>
                      prev.map((b, i) => (i === activeShipBoxIdx ? { ...b, packageType } : b))
                    );
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                >
                  <option value="PLASTIC_COVER">Plastic cover / Flyer</option>
                  <option value="CARDBOARD_BOX">Cardboard Box</option>
                </select>
              </label>
              <hr className="my-4 border-stone-100 dark:border-stone-800" />
              <div>
                <label className="block">
                  <span className="text-xs text-stone-500">Box size preset</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                    defaultValue=""
                    onChange={(e) => {
                      const preset = SHIP_BOX_PRESETS.find((p) => p.id === e.target.value);
                      if (!preset) return;
                      setShipBoxes((prev) =>
                        prev.map((b, i) =>
                          i === activeShipBoxIdx
                            ? {
                                ...b,
                                lengthCm: preset.lengthCm,
                                breadthCm: preset.breadthCm,
                                heightCm: preset.heightCm,
                                packageType: "CARDBOARD_BOX"
                              }
                            : b
                        )
                      );
                      e.target.value = "";
                    }}
                  >
                    <option value="">Select standard size…</option>
                    {SHIP_BOX_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Size (cm) — integers only
                </span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                  <label className="block text-[11px] text-stone-500">
                    Length
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={activeShipBox.lengthCm > 0 ? String(activeShipBox.lengthCm) : ""}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "lengthCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                  <label className="block text-[11px] text-stone-500">
                    Breadth
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={activeShipBox.breadthCm > 0 ? String(activeShipBox.breadthCm) : ""}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "breadthCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                  <label className="block text-[11px] text-stone-500">
                    Height
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={activeShipBox.heightCm > 0 ? String(activeShipBox.heightCm) : ""}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "heightCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                </div>
                {boxDimError ? (
                  <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">{boxDimError}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-stone-500">
                    Positive integers only. Min 5 cm per side; L + B + H ≥ 15 cm.
                  </p>
                )}
              </div>
              <label className="block">
                <span className="text-xs text-stone-500">Package weight (gm) — integer</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={activeShipBox.weightGrams > 0 ? String(activeShipBox.weightGrams) : ""}
                  onChange={(e) => {
                    setShipBoxes((prev) => patchActiveBoxWeight(prev, activeShipBoxIdx, e.target.value));
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <hr className="my-4 border-stone-100 dark:border-stone-800" />
              <div>
                <span className="text-xs text-stone-500">Shipping mode</span>
                <div className="relative mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setShipMode("S")}
                      className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                        shipMode === "S"
                          ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                          : "border-stone-300 text-stone-700 dark:border-stone-600"
                      }`}
                    >
                      <span className="block text-[10px] uppercase tracking-widest text-stone-500">Surface</span>
                      <span className="mt-1 block text-base font-bold" style={{ fontWeight: 700, color: shipMode === "S" ? "#fffbf5" : "#1c352a", fontSize: "1rem" }}>
                        {formatFreightAmount(freightByMode.S)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShipMode("E")}
                      className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                        shipMode === "E"
                          ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                          : "border-stone-300 text-stone-700 dark:border-stone-600"
                      }`}
                    >
                      <span className="block text-[10px] uppercase tracking-widest text-stone-500">Express</span>
                      <span className="mt-1 block text-base font-bold" style={{ fontWeight: 700, color: shipMode === "E" ? "#fffbf5" : "#1c352a", fontSize: "1rem" }}>
                        {formatFreightAmount(freightByMode.E)}
                      </span>
                    </button>
                  </div>
                  {freightEstimateBusy ? (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px] dark:bg-stone-950/75"
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-3.5 py-2 shadow-sm dark:border-stone-600 dark:bg-stone-900">
                        <div
                          className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-[#1c352a]"
                          aria-hidden
                        />
                        <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                          Calculating…
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] text-stone-500">
                  Total chargeable:{" "}
                  <strong>{totalChargeableG.toLocaleString("en-IN")} gm</strong>
                  {freightEstimateError ? (
                    <span className="ml-2 text-red-600 dark:text-red-400">{freightEstimateError}</span>
                  ) : null}
                </p>
              </div>
              <hr className="my-4 border-stone-100 dark:border-stone-800" />
              <button
                type="button"
                disabled={!!shipBusy || !pickupOptions.length || !!boxDimError}
                onClick={() => void handleRetryShipment()}
                className="w-full rounded-xl bg-stone-900 py-3 text-sm font-bold text-amber-50 transition-all duration-150 hover:bg-stone-800 hover:shadow-md disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                {shipBusy === "create" ? "Creating AWB…" : "Create order & get AWB"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {order.shippingLastError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          <p className="font-semibold">Shipment API error (last attempt)</p>
          <p className="mt-2 whitespace-pre-wrap">{order.shippingLastError}</p>
          {order.shippingLastErrorAt ? (
            <p className="mt-2 text-xs opacity-90">{new Date(order.shippingLastErrorAt).toLocaleString("en-IN")}</p>
          ) : null}
          <p className="mt-3 text-xs">
            Set status to Processing to auto-retry, or use the create shipment panel above.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="border-b border-stone-100 p-4 dark:border-stone-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">Line items &amp; fulfillment</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Fulfillment:{" "}
                <span className="font-medium text-stone-700 dark:text-stone-200">{order.fulfillmentStatus}</span>
                {order.shippingZone ? ` · Zone ${order.shippingZone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {awbRows.length > 0 ? (
                <button
                  type="button"
                  disabled={!!shipBusy || !shipUi}
                  onClick={() => void handleSyncAllTracking()}
                  className="inline-flex min-h-[34px] items-center rounded-full bg-stone-800 px-4 py-1.5 text-xs font-semibold text-amber-100 hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
                >
                  {shipBusy === "sync-all" ? "Syncing…" : "Refresh all tracking"}
                </button>
              ) : null}
              {!hasForwardAwb ? (
                <button
                  type="button"
                  disabled={!!shipBusy || !shipUi}
                  onClick={() => void handleRetryShipment()}
                  className="inline-flex min-h-[34px] items-center rounded-xl border border-amber-700 bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-950 transition-all duration-150 hover:bg-amber-100 hover:shadow-md disabled:opacity-50 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  {shipBusy === "create" ? "Working…" : "Create / retry shipment"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {!shipUi ? (
          <p className="border-b border-stone-100 px-4 py-2 text-xs text-amber-900/90 dark:border-stone-700 dark:text-amber-200/90">
            Carrier actions need captured payment (or COD order marked paid).
          </p>
        ) : null}
        {SHOW_LEGACY_PER_LINE_FULFILLMENT ? (
        <div className="flex flex-wrap items-end gap-3 border-b border-stone-100 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/40">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-stone-600 dark:text-stone-300">Bulk warehouse</span>
            <select
              value={bulkWarehouse}
              onChange={(e) => setBulkWarehouse(e.target.value)}
              disabled={!pickupOptions.length}
              className="min-w-[10rem] rounded border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-600 dark:bg-stone-950"
            >
              <option value="">—</option>
              {pickupOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-stone-600 dark:text-stone-300">Bulk courier</span>
            <select
              value={bulkCourier}
              onChange={(e) => setBulkCourier(e.target.value)}
              className="min-w-[10rem] rounded border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-600 dark:bg-stone-950"
            >
              <option value="AUTO">Auto</option>
              <option value="DELHIVERY">Delhivery</option>
              <option value="SHIPROCKET">Shiprocket</option>
              <option value="SHIPROCKET_INTERNATIONAL">Shiprocket Intl</option>
            </select>
          </label>
          <button
            type="button"
            onClick={applyBulkToSelected}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:border-amber-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
          >
            Apply to {selectedItemIds.size > 0 ? `${selectedItemIds.size} selected` : "all items"}
          </button>
        </div>
        ) : null}
        {order.wooCommerceId && order.items.length === 0 ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            WooCommerce order #{order.wooCommerceId} — header imported from WordPress export.
            {order.wooImportNote ? ` ${order.wooImportNote}` : " Line items were not in the export file."}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 dark:border-stone-700 dark:bg-stone-800/80" style={{ background: "linear-gradient(180deg,#f4f0e8,#f9f7f4)" }}>
              <tr>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">Product</th>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">SKU</th>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">Qty</th>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">Fulfilment</th>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">Unit</th>
                <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a7060] dark:text-stone-300">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {order.items.map((item, idx) => (
                <tr
                  key={item.id ?? `${item.skuSnapshot}-${idx}`}
                  className="transition-colors"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#faf8f5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                  }}
                >
                  <td className="px-3 py-3 align-top font-medium text-stone-800 dark:text-stone-100">
                    {item.nameSnapshot}
                  </td>
                  <td className="px-3 py-3 align-top" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#8a7060" }}>{item.skuSnapshot}</td>
                  <td className="px-3 py-3 align-top">{item.qtyOrdered}</td>
                  <td className="px-3 py-3 align-top text-xs text-stone-600 dark:text-stone-300">
                    {(() => {
                      const wh = item.warehouseFulfillmentQty ?? item.qtyOrdered;
                      const ds = item.dropShipFulfillmentQty ?? 0;
                      if (ds <= 0) return wh === item.qtyOrdered ? "Warehouse" : `Warehouse: ${wh}`;
                      if (wh <= 0) return `Drop ship: ${ds}`;
                      return `Warehouse: ${wh} · Drop ship: ${ds}`;
                    })()}
                  </td>
                  <td className="px-3 py-3 align-top">{formatMinorFromPaise(item.unitPriceInPaise, order.currency)}</td>
                  <td className="px-3 py-3 align-top">{formatMinorFromPaise(item.lineTotalInPaise, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-stone-100 px-4 py-4 dark:border-stone-700">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Shipping labels &amp; AWBs</p>
              <p className="mt-1 text-[11px] text-stone-500">
                Delhivery AWBs are created above. For FedEx, India Post, or Shiprocket booked outside Sarveda, paste the reference below.
              </p>
            </div>
            {canInitiateReturn && shipUi ? (
              <button
                type="button"
                disabled={!!shipBusy}
                onClick={() => void handleCreateReturn()}
                className={`${AWB_PILL.return} rounded-xl font-bold hover:shadow-md`}
              >
                {shipBusy === "reverse" ? "Creating…" : "Initiate Delhivery return"}
              </button>
            ) : null}
          </div>

          {hasForwardAwb ? (
            <div className="mt-4 rounded-lg border border-stone-200 bg-white px-3 py-3 dark:border-stone-600 dark:bg-stone-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Delhivery booking summary</p>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-stone-500">Customer shipping (checkout)</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {formatMinorFromPaise(customerShippingCharged, order.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Delhivery freight (at booking)</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {delhiveryFreightBooked != null
                      ? `₹${delhiveryFreightBooked.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                      : "—"}
                    {delhiveryFreightBooked != null &&
                    customerShippingCharged !== Math.round((delhiveryFreightBooked ?? 0) * 100) ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-amber-800 dark:text-amber-300">
                        May differ from checkout table — Delhivery API rate at booking time.
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Payment mode</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {paymentModeLabel(bookedPaymentMode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Shipping mode</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {shippingModeLabel(bookedShippingMode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Total chargeable weight</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {bookedChargeableG != null
                      ? `${bookedChargeableG.toLocaleString("en-IN")} gm`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">Boxes</dt>
                  <dd className="font-semibold text-stone-900 dark:text-stone-100">
                    {bookingBoxes.length > 0 ? bookingBoxes.length : "—"}
                  </dd>
                </div>
              </dl>
              {bookingBoxes.length > 0 ? (
                <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-2 text-[11px] text-stone-600 dark:border-stone-700 dark:text-stone-300">
                  {bookingBoxes.map((box, idx) => {
                    const vol = breakdownChargeableWeight({
                      lengthCm: box.lengthCm,
                      breadthCm: box.breadthCm,
                      heightCm: box.heightCm,
                      weightGrams: box.weightGrams,
                      packageType: (box.packageType as "PLASTIC_COVER" | "CARDBOARD_BOX") ?? "CARDBOARD_BOX"
                    });
                    return (
                      <li key={idx}>
                        <span className="font-semibold text-stone-800 dark:text-stone-100">Box {idx + 1}:</span>{" "}
                        {box.lengthCm}×{box.breadthCm}×{box.heightCm} cm · dead {box.weightGrams.toLocaleString("en-IN")}{" "}
                        gm · volumetric {vol.volumetricGrams.toLocaleString("en-IN")} gm · chargeable{" "}
                        {vol.chargeableGrams.toLocaleString("en-IN")} gm
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}

          {awbRows.length === 0 ? (
            <p className="mt-3 text-sm text-stone-400">No AWB yet — create a Delhivery shipment or add an external reference.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {awbRows.map((row) => (
                <div
                  key={`${row.shipmentId}-${row.awb}`}
                  className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-3 dark:border-stone-700 dark:bg-stone-950/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">{row.boxLabel}</p>
                      <p className="mt-1 font-mono text-sm text-stone-900 dark:text-stone-100">{row.awb}</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {row.courier} · {row.status.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.trackingUrl ? (
                        <a
                          href={row.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={AWB_PILL.track}
                        >
                          Track
                        </a>
                      ) : null}
                      {row.isDelhiveryIntegrated ? (
                        <>
                          <button
                            type="button"
                            className={AWB_PILL.sync}
                            disabled={!!shipBusy || !shipUi}
                            onClick={() => void handleTrackOne(row.awb)}
                          >
                            {shipBusy === row.awb ? "…" : "Sync Delhivery"}
                          </button>
                          <a
                            href={delhiveryLabelUrl(row.awb)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={AWB_PILL.label}
                          >
                            Download label
                          </a>
                          {row.role === "parent" || row.role === "return" ? (
                            <button
                              type="button"
                              className={AWB_PILL.cancel}
                              disabled={!!shipBusy}
                              onClick={() => setCancelAwbConfirm(row.cancelWaybill)}
                            >
                              Cancel label
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">External carrier reference</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <input
                value={manualAwb}
                onChange={(e) => setManualAwb(e.target.value)}
                placeholder="AWB / tracking number"
                disabled={!!shipBusy || !shipUi}
                className="min-w-[10rem] flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950"
              />
              <input
                value={manualTrackingUrl}
                onChange={(e) => setManualTrackingUrl(e.target.value)}
                placeholder="Tracking URL (optional)"
                disabled={!!shipBusy || !shipUi}
                className="min-w-[12rem] flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950"
              />
              <select
                value={manualCourier}
                onChange={(e) =>
                  setManualCourier(
                    e.target.value as "DELHIVERY" | "SHIPROCKET" | "FEDEX" | "INDIA_POST" | "OTHER"
                  )
                }
                disabled={!!shipBusy || !shipUi}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950"
              >
                <option value="FEDEX">FedEx</option>
                <option value="INDIA_POST">India Post</option>
                <option value="SHIPROCKET">Shiprocket</option>
                <option value="DELHIVERY">Delhivery (manual)</option>
                <option value="OTHER">Other</option>
              </select>
              <button
                type="button"
                onClick={() => void handleSaveManualAwb()}
                disabled={!!shipBusy || !shipUi}
                className={AWB_PILL.save}
              >
                {shipBusy === "manual-awb" ? "Saving…" : "Save reference"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <AdminOrderAttributionCard attribution={order.attribution} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">Totals</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Subtotal</dt>
              <dd>{formatMinorFromPaise(order.subtotalInPaise, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">
                Shipping
                {order.shippingZone ? (
                  <span className="block text-xs font-normal">Zone {order.shippingZone}</span>
                ) : null}
              </dt>
              <dd>{formatMinorFromPaise(order.shippingInPaise, order.currency)}</dd>
            </div>
            {(order.payments ?? []).length > 0 ? (
              <div className="flex justify-between">
                <dt className="text-stone-500 dark:text-stone-400">Payment method</dt>
                <dd className="font-medium">
                  {(order.payments ?? [])
                    .map((p) => p.provider)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(", ")}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Tax</dt>
              <dd>{formatMinorFromPaise(order.taxInPaise, order.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Discount</dt>
              <dd>{formatMinorFromPaise(order.discountInPaise, order.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold dark:border-stone-700" style={{ borderTop: "2px solid #e8e2d9" }}>
              <dt>Grand total</dt>
              <dd style={{ fontSize: "1.1rem", fontWeight: 800, color: "#1c352a" }}>{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Currency: {order.currency}
          </p>
          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            Created {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>

        {(order.payments ?? []).some(
          (p) => p.providerPaymentId || (p.refunds?.length ?? 0) > 0
        ) ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">Payment &amp; refunds</h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Match these IDs in Razorpay Dashboard → Transactions → Payments → Refunds.
            </p>
            <ul className="mt-4 space-y-4">
              {(order.payments ?? []).map((p, idx) => (
                <li
                  key={`${p.provider}-${p.providerPaymentId ?? idx}`}
                  className="rounded-lg border border-stone-100 bg-stone-50/80 p-3 text-sm dark:border-stone-700 dark:bg-stone-800/50"
                >
                  <p className="font-semibold text-stone-800 dark:text-stone-100">
                    {p.provider}
                    {p.status ? (
                      <span className="ml-2 text-xs font-normal uppercase text-stone-500">{p.status}</span>
                    ) : null}
                  </p>
                  {p.providerPaymentId ? (
                    <p className="mt-1 font-mono text-xs text-stone-600 dark:text-stone-300">
                      Payment ID: {p.providerPaymentId}
                    </p>
                  ) : null}
                  {p.providerOrderId ? (
                    <p className="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">
                      Order ID: {p.providerOrderId}
                    </p>
                  ) : null}
                  {p.refundedInPaise != null && p.refundedInPaise > 0 ? (
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
                      Refunded: {formatMinorFromPaise(p.refundedInPaise, order.currency)}
                    </p>
                  ) : null}
                  {(p.refunds ?? []).length > 0 ? (
                    <ul className="mt-2 space-y-2 border-t border-stone-200 pt-2 dark:border-stone-600">
                      {(p.refunds ?? []).map((r) => (
                        <li key={r.id} className="text-xs text-stone-600 dark:text-stone-300">
                          {r.providerRefundId ? (
                            <p className="font-mono font-medium text-stone-800 dark:text-stone-100">
                              Refund ID: {r.providerRefundId}
                            </p>
                          ) : (
                            <p className="font-medium text-stone-800 dark:text-stone-100">Refund (no gateway id)</p>
                          )}
                          <p>
                            {formatMinorFromPaise(r.amountInPaise, order.currency)} · {r.status} ·{" "}
                            {new Date(r.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </p>
                          {r.reason ? <p className="text-stone-500">{r.reason}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-4">
          <h2 className="text-base font-bold tracking-tight text-stone-800 dark:text-stone-100">Addresses</h2>
          {order.addresses.map((a) => (
            <div
              key={a.id ?? `${a.type}-${a.line1}`}
              className="rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900"
              style={{ borderLeft: "3px solid rgba(185,138,62,0.3)", borderRadius: "12px", padding: "16px", background: "linear-gradient(135deg, #faf7f2, #fff)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {a.type}
                </p>
                <button
                  type="button"
                  onClick={() => setAddressModal(a)}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Edit
                </button>
              </div>
              <p className="mt-2 font-medium text-stone-800 dark:text-stone-100">{a.fullName}</p>
              <p className="text-stone-600 dark:text-stone-300">{a.phone}</p>
              <p className="mt-2 text-stone-600 dark:text-stone-300">
                {a.line1}
                {a.line2 ? (
                  <>
                    <br />
                    {a.line2}
                  </>
                ) : null}
              </p>
              <p className="text-stone-600 dark:text-stone-300">
                {a.city}, {a.state} {a.postalCode}
              </p>
              <p className="text-stone-600 dark:text-stone-300">{a.country}</p>
            </div>
          ))}
        </div>
      </div>
        </>
      ))(order, invoice, deliveryChallan) : null}
    </div>
  );
}
