"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  adminCancelWaybill,
  adminCreateShipmentForOrder,
  adminEstimateDelhiveryCharge,
  adminSaveManualAwb,
  adminSyncOrderShipments,
  adminTrackShipmentByWaybill,
  delhiveryLabelUrl,
  fetchAdminOrderDetail,
  fetchAdminOrderInvoice,
  adminOrderInvoiceDownloadUrl,
  fetchAdminPickupLocations,
  isDelhiveryCourier,
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
  totalChargeableWeightGrams,
  validateBoxDimensions
} from "@/lib/chargeable-weight";
import { DEFAULT_SHIP_BOX_PRESET, SHIP_BOX_PRESETS } from "@/lib/ship-box-presets";

const MAX_SHIP_BOXES = 5;
const DIM_MIN_CM = 5;
const DIM_MAX_CM = 200;

function defaultShipBox(weightGrams = 500): DelhiveryShipBox {
  return {
    lengthCm: DEFAULT_SHIP_BOX_PRESET.lengthCm,
    breadthCm: DEFAULT_SHIP_BOX_PRESET.breadthCm,
    heightCm: DEFAULT_SHIP_BOX_PRESET.heightCm,
    weightGrams: Math.max(50, weightGrams),
    packageType: "CARDBOARD_BOX"
  };
}

function patchActiveBoxDim(
  boxes: DelhiveryShipBox[],
  activeIdx: number,
  field: "lengthCm" | "breadthCm" | "heightCm",
  raw: string
): DelhiveryShipBox[] {
  const digits = digitsOnly(raw);
  const parsed = digits === "" ? DIM_MIN_CM : Math.min(DIM_MAX_CM, Math.max(DIM_MIN_CM, Number.parseInt(digits, 10)));
  return boxes.map((b, i) => (i === activeIdx ? { ...b, [field]: parsed } : b));
}

function patchActiveBoxWeight(boxes: DelhiveryShipBox[], activeIdx: number, raw: string): DelhiveryShipBox[] {
  const digits = digitsOnly(raw, 6);
  const parsed =
    digits === "" ? 50 : Math.min(500_000, Math.max(50, Number.parseInt(digits, 10)));
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

type OrderLoaded = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
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
};

function RefundCancelPanel({
  orderId,
  status,
  paymentStatus,
  onDone
}: {
  orderId: string;
  status: string;
  paymentStatus: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "refund" | null>(null);

  const terminal = ["CANCELLED", "REFUNDED", "DELIVERED"].includes(status);
  const canRefund =
    !terminal &&
    paymentStatus === "CAPTURED" &&
    ["PAID", "PROCESSING", "PACKED", "SHIPPED"].includes(status);
  const canCancel =
    !terminal &&
    !canRefund &&
    (status === "PENDING_PAYMENT" || paymentStatus === "PENDING" || paymentStatus === "FAILED");

  async function execute(action: "cancel" | "refund") {
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
        refundId?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const detail =
        action === "refund" && data.refundId
          ? `${data.message ?? "Refund initiated."} Refund ID: ${data.refundId}`
          : (data.message ?? "Done");
      setMsg({ text: detail, ok: true });
      onDone();
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : "Failed",
        ok: false
      });
    } finally {
      setBusy(false);
    }
  }

  if (!canCancel && !canRefund) return null;

  return (
    <div
      style={{
        border: "1px solid #e8e2d9",
        borderRadius: "12px",
        background: "#fff",
        padding: "20px 24px",
        marginTop: "16px"
      }}
    >
      <p style={{ fontSize: "13px", fontWeight: 700, color: "#2c2420", marginBottom: "12px" }}>
        {canRefund ? "Refund" : "Cancel order"}
      </p>

      <input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid #e0d8ce",
          borderRadius: "8px",
          fontSize: "13px",
          marginBottom: "12px",
          boxSizing: "border-box"
        }}
      />

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("cancel")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              background: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              color: "#6b5c52",
              cursor: "pointer",
              opacity: busy ? 0.5 : 1
            }}
          >
            Cancel Order
          </button>
        ) : null}
        {canRefund ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm("refund")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #dc2626",
              background: "rgba(220,38,38,0.06)",
              fontSize: "13px",
              fontWeight: 600,
              color: "#dc2626",
              cursor: "pointer",
              opacity: busy ? 0.5 : 1
            }}
          >
            {busy ? "Processing..." : "Refund to Customer"}
          </button>
        ) : null}
      </div>

      {confirm ? (
        <div
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            background: "#fef2f2",
            borderRadius: "8px",
            border: "1px solid #fecaca"
          }}
        >
          <p style={{ fontSize: "13px", color: "#991b1b", marginBottom: "10px" }}>
            {confirm === "refund"
              ? "Refund the full amount to the customer’s original payment method and restore stock?"
              : "Cancel this unpaid order and release reserved stock?"}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => void execute(confirm)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Yes, confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "#fff",
                border: "1px solid #e0d8ce",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              No, go back
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p
          style={{
            marginTop: "10px",
            fontSize: "13px",
            color: msg.ok ? "#166534" : "#dc2626",
            background: msg.ok ? "#dcfce7" : "#fee2e2",
            padding: "8px 12px",
            borderRadius: "6px"
          }}
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
    unitPriceInPaise: Number(row.unitPriceInPaise),
    lineTotalInPaise: Number(row.lineTotalInPaise),
    pickupLocationId: row.pickupLocationId != null ? String(row.pickupLocationId) : null,
    pickupLocation: row.pickupLocation as OrderItemRow["pickupLocation"]
  }));
  const addresses = (raw.addresses as AddressRow[]) ?? [];
  const shipments = (raw.shipments as ShipmentRow[]) ?? [];
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
  return {
    id: String(raw.id),
    orderNumber: String(raw.orderNumber),
    email: String(raw.email),
    phone: String(raw.phone),
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
    wooImportNote: legacy?.lineItemsNote ?? null
  };
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderLoaded | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [invoice, setInvoice] = useState<{
    pdfUrl: string | null;
    invoiceNo: string | null;
    downloadUrl: string | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shipBusy, setShipBusy] = useState<string | null>(null);
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
  const [manualCourier, setManualCourier] = useState<"DELHIVERY" | "SHIPROCKET" | "OTHER">("DELHIVERY");
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

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
    const g = Math.max(
      50,
      order.items.reduce((sum, it) => sum + it.qtyOrdered * 500, 0) || 500
    );
    setShipBoxes([defaultShipBox(g)]);
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
    if (!order || selectedCourier === "SHIPROCKET" || selectedCourier === "SHIPROCKET_INTERNATIONAL") {
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
  }, [order, shipBoxes, shipPaymentMode, selectedCourier, selectedPickupId, pickupOptions]);

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
    if (!id) return;
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
        preferredCourier: (selectedCourier ||
          bulkCourier) as "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL",
        channel: shipChannel,
        paymentMode: shipPaymentMode,
        lengthCm: activeShipBox.lengthCm,
        breadthCm: activeShipBox.breadthCm,
        heightCm: activeShipBox.heightCm,
        weightGrams: activeShipBox.weightGrams,
        packageType: activeShipBox.packageType,
        shippingMode: shipMode,
        boxes: shipBoxes
      });
      await load();
      setShipResultModal({
        success: true,
        title: "Shipment created",
        message: `AWB ${created.waybill} is ready. Download the Delhivery label from the shipments section below.`,
        waybill: created.waybill
      });
    } catch (e) {
      setShipResultModal({
        success: false,
        title: "Shipment creation failed",
        message: e instanceof Error ? e.message : "Could not create shipment. Check box details and Delhivery settings."
      });
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
      await adminSaveManualAwb(id, { awb, courier: manualCourier });
      setManualAwb("");
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
        pushToast("Label removed in Sarveda (already cancelled on Shiprocket). You can create a new label.");
      } else {
        pushToast("Carrier label cancelled. Local shipment removed so you can retry.");
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
          className="mt-4 inline-block text-amber-700 hover:underline dark:text-amber-400"
        >
          ← Orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-stone-500 dark:text-stone-400" role="status">
        Loading…
      </div>
    );
  }

  const hasRazorpay = (order.payments ?? []).some((p) => p.provider === "RAZORPAY");
  const shipUi = carrierUiEnabled(order);

  return (
    <div className="space-y-8">
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.error
              ? "border-red-300 bg-red-950 text-red-50 dark:border-red-800"
              : "border-stone-300 bg-stone-900 text-amber-50 dark:border-stone-600"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <AdminConfirmModal
        open={statusConfirm !== null}
        title="Update order status?"
        message={
          statusConfirm
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
        title="Cancel carrier label?"
        message={
          cancelAwbConfirm
            ? `Cancel AWB ${cancelAwbConfirm} on Shiprocket (voids the AWB there) and remove it from Sarveda. If you already cancelled in the Shiprocket dashboard, use “Remove label only” — that only clears Sarveda; Shiprocket is already updated. This does not cancel the Sarveda order (use Order status → Cancelled for refunds/stock).`
            : ""
        }
        confirmLabel="Cancel on Shiprocket"
        secondaryConfirmLabel="Remove label only (Sarveda)"
        onSecondaryConfirm={() => void confirmCancelWaybill(true)}
        danger
        busy={!!shipBusy}
        onClose={() => setCancelAwbConfirm(null)}
        onConfirm={() => void confirmCancelWaybill(false)}
      />

      {shipResultModal ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-600 dark:bg-stone-900">
            <h2
              className={`font-serif text-xl italic ${
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
        </div>
      ) : null}

      {addressModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-600 dark:bg-stone-900">
            <h2 className="font-serif text-xl italic text-stone-900 dark:text-stone-50">
              Edit {addressModal.type.toLowerCase()} address
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Full name</span>
                <input
                  value={addrDraft.fullName}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">Phone</span>
                <input
                  value={addrDraft.phone}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, phone: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">Country</span>
                <input
                  value={addrDraft.country}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, country: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Address line 1</span>
                <input
                  value={addrDraft.line1}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, line1: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Address line 2</span>
                <input
                  value={addrDraft.line2}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, line2: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">City</span>
                <input
                  value={addrDraft.city}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600 dark:text-stone-400">State</span>
                <input
                  value={addrDraft.state}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, state: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-stone-600 dark:text-stone-400">Postal code</span>
                <input
                  value={addrDraft.postalCode}
                  onChange={(e) => setAddrDraft((d) => ({ ...d, postalCode: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
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
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-stone-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {addrSaving ? "Saving…" : "Save address"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200" role="alert">
          {err}
        </p>
      ) : null}
      <div>
        <Link href="/admin/orders" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
          ← Orders
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">{order.orderNumber}</h1>
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
                {formatAdminOrderStatusLabel(
                  order.status,
                  order.paymentStatus,
                  order.payments?.[0]?.provider
                )}
              </span>
              {parseOrderNotes(order.notes).giftWrap ? (
                <span className="rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100">
                  Gift wrap requested
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
                Payment was not completed (checkout abandoned, gateway exit, or replaced by a newer order). System
                status remains <span className="font-mono">CANCELLED</span> for stock and reporting.
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
                    {s === "CANCELLED" ? "Cancelled" : s.replace(/_/g, " ")}
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
            <RefundCancelPanel
              orderId={order.id}
              status={order.status}
              paymentStatus={order.paymentStatus}
              onDone={() => void load()}
            />
          </div>
        </div>
      </div>

      {invoice ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Invoice</span>
          {invoice.invoiceNo ? (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{invoice.invoiceNo}</p>
          ) : null}
          <div className="mt-3">
            {invoice.invoiceNo || invoice.pdfUrl ? (
              <a
                href={invoice.downloadUrl ?? adminOrderInvoiceDownloadUrl(id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400"
              >
                Download PDF
              </a>
            ) : (
              <span className="text-sm text-stone-400 dark:text-stone-500">Invoice PDF not generated yet</span>
            )}
          </div>
        </div>
      ) : null}

      {!order.shipments.some((s) => s.awb?.trim()) && shipUi ? (
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <div className="border-b border-stone-100 px-5 py-4 dark:border-stone-700">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Create shipment</h2>
            <p className="mt-1 text-xs text-stone-500">
              Delhivery-style order creation — channel, facility, box details, and shipping mode.
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
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">Courier</span>
                <select
                  value={selectedCourier}
                  onChange={(e) => setSelectedCourier(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                >
                  <option value="AUTO">Auto (routing rules)</option>
                  <option value="DELHIVERY">Delhivery</option>
                  <option value="SHIPROCKET">Shiprocket</option>
                  <option value="SHIPROCKET_INTERNATIONAL">Shiprocket Intl</option>
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
                      value={String(activeShipBox.lengthCm)}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "lengthCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                  <label className="block text-[11px] text-stone-500">
                    Breadth
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(activeShipBox.breadthCm)}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "breadthCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                    />
                  </label>
                  <label className="block text-[11px] text-stone-500">
                    Height
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(activeShipBox.heightCm)}
                      onChange={(e) => {
                        setShipBoxes((prev) => patchActiveBoxDim(prev, activeShipBoxIdx, "heightCm", e.target.value));
                      }}
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
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
                  value={String(activeShipBox.weightGrams)}
                  onChange={(e) => {
                    setShipBoxes((prev) => patchActiveBoxWeight(prev, activeShipBoxIdx, e.target.value));
                  }}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <div>
                <span className="text-xs text-stone-500">Shipping mode</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShipMode("S")}
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      shipMode === "S"
                        ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                        : "border-stone-300 text-stone-700 dark:border-stone-600"
                    }`}
                  >
                    <span className="block">SURFACE</span>
                    <span className="mt-1 block text-base font-bold">
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
                    <span className="block">EXPRESS</span>
                    <span className="mt-1 block text-base font-bold">
                      {formatFreightAmount(freightByMode.E)}
                    </span>
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-stone-500">
                  Total chargeable:{" "}
                  <strong>{totalChargeableG.toLocaleString("en-IN")} gm</strong>
                  {freightEstimateError ? (
                    <span className="ml-2 text-red-600 dark:text-red-400">{freightEstimateError}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                disabled={!!shipBusy || !pickupOptions.length || !!boxDimError}
                onClick={() => void handleRetryShipment()}
                className="w-full rounded-lg bg-stone-900 py-3 text-sm font-semibold text-amber-50 hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
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
            Set status to Processing to auto-retry, or use &quot;Create / retry shipment&quot; below.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="border-b border-stone-100 p-4 dark:border-stone-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Line items &amp; fulfillment</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Fulfillment:{" "}
                <span className="font-medium text-stone-700 dark:text-stone-200">{order.fulfillmentStatus}</span>
                {order.shippingZone ? ` · Zone ${order.shippingZone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!shipBusy || !shipUi}
                onClick={() => void handleSyncAllTracking()}
                className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
              >
                {shipBusy === "sync-all" ? "Syncing…" : "Refresh all tracking"}
              </button>
              <button
                type="button"
                disabled={!!shipBusy || !shipUi}
                onClick={() => void handleRetryShipment()}
                className="rounded-lg border border-amber-600 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-500/20 disabled:opacity-50 dark:border-amber-500 dark:text-amber-200"
              >
                {shipBusy === "create" ? "Working…" : "Create / retry shipment"}
              </button>
            </div>
          </div>
          {!order.shipments.some((s) => s.awb?.trim()) ? (
            <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-700">
              <p className="mb-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                Or enter AWB manually (if created in Delhivery/Shiprocket):
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={manualAwb}
                  onChange={(e) => setManualAwb(e.target.value)}
                  placeholder="AWB number"
                  disabled={!!shipBusy || !shipUi}
                  className="min-w-[10rem] flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950"
                />
                <select
                  value={manualCourier}
                  onChange={(e) =>
                    setManualCourier(e.target.value as "DELHIVERY" | "SHIPROCKET" | "OTHER")
                  }
                  disabled={!!shipBusy || !shipUi}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[13px] dark:border-stone-600 dark:bg-stone-950"
                >
                  <option value="DELHIVERY">Delhivery</option>
                  <option value="SHIPROCKET">Shiprocket</option>
                  <option value="OTHER">Other</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleSaveManualAwb()}
                  disabled={!!shipBusy || !shipUi}
                  className="rounded-lg bg-stone-800 px-3.5 py-1.5 text-xs font-semibold text-amber-50 hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
                >
                  {shipBusy === "manual-awb" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {!shipUi ? (
          <p className="border-b border-stone-100 px-4 py-2 text-xs text-amber-900/90 dark:border-stone-700 dark:text-amber-200/90">
            Carrier actions need captured payment (or COD order marked paid).
          </p>
        ) : null}
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
          {pickupOptions.length === 0 ? (
            <Link href="/admin/settings/pickup-locations" className="text-xs text-amber-800 underline dark:text-amber-400">
              Add warehouses
            </Link>
          ) : null}
        </div>
        {order.wooCommerceId && order.items.length === 0 ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            WooCommerce order #{order.wooCommerceId} — header imported from WordPress export.
            {order.wooImportNote ? ` ${order.wooImportNote}` : " Line items were not in the export file."}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all line items"
                    checked={
                      order.items.filter((it) => it.id).length > 0 &&
                      selectedItemIds.size === order.items.filter((it) => it.id).length
                    }
                    onChange={toggleSelectAllItems}
                  />
                </th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Product</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">SKU</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Qty</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Unit</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Line total</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Warehouse</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Courier</th>
                <th className="px-3 py-3 font-semibold text-stone-600 dark:text-stone-300">Labels / tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {order.items.map((item, idx) => {
                const primaryShipment = order.shipments[0];
                return (
                  <tr key={item.id ?? `${item.skuSnapshot}-${idx}`}>
                    <td className="px-3 py-3 align-top">
                      {item.id ? (
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => toggleSelectItem(item.id!)}
                          aria-label={`Select ${item.nameSnapshot}`}
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top font-medium text-stone-800 dark:text-stone-100">
                      {item.nameSnapshot}
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-xs text-stone-500">{item.skuSnapshot}</td>
                    <td className="px-3 py-3 align-top">{item.qtyOrdered}</td>
                    <td className="px-3 py-3 align-top">{formatMinorFromPaise(item.unitPriceInPaise, order.currency)}</td>
                    <td className="px-3 py-3 align-top">{formatMinorFromPaise(item.lineTotalInPaise, order.currency)}</td>
                    <td className="px-3 py-3 align-top">
                      {item.id && pickupOptions.length > 0 ? (
                        <select
                          value={itemWarehouses[item.id] ?? ""}
                          onChange={(e) =>
                            setItemWarehouses((prev) => ({ ...prev, [item.id!]: e.target.value }))
                          }
                          className="max-w-[9rem] rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-950"
                        >
                          <option value="">Default</option>
                          {pickupOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {item.id ? (
                        <select
                          value={itemCouriers[item.id] ?? selectedCourier}
                          onChange={(e) => {
                            const v = e.target.value;
                            setSelectedCourier(v);
                            setItemCouriers((prev) => ({ ...prev, [item.id!]: v }));
                          }}
                          className="max-w-[9rem] rounded border border-stone-300 bg-white px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-950"
                        >
                          <option value="AUTO">Auto</option>
                          <option value="DELHIVERY">Delhivery</option>
                          <option value="SHIPROCKET">Shiprocket</option>
                          <option value="SHIPROCKET_INTERNATIONAL">Intl</option>
                        </select>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      {idx === 0 && primaryShipment ? (
                        <div className="space-y-1">
                          <p>
                            <span className="font-medium">{primaryShipment.courier}</span>
                            {primaryShipment.awb ? (
                              <span className="ml-1 font-mono">{primaryShipment.awb}</span>
                            ) : null}
                          </p>
                          <p className="text-stone-500">{primaryShipment.status.replace(/_/g, " ")}</p>
                          <div className="flex flex-wrap gap-2">
                            {primaryShipment.trackingUrl ? (
                              <a
                                href={primaryShipment.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-amber-800 underline dark:text-amber-400"
                              >
                                Open
                              </a>
                            ) : null}
                            {primaryShipment.awb ? (
                              <button
                                type="button"
                                className="font-semibold text-stone-700 underline dark:text-stone-300"
                                disabled={!!shipBusy || !shipUi}
                                onClick={() => void handleTrackOne(primaryShipment.awb!)}
                              >
                                {shipBusy === primaryShipment.awb ? "…" : "Sync"}
                              </button>
                            ) : null}
                            {primaryShipment.awb ? (
                              <button
                                type="button"
                                className="font-semibold text-red-700 underline dark:text-red-400"
                                disabled={!!shipBusy}
                                onClick={() => setCancelAwbConfirm(primaryShipment.awb!)}
                              >
                                {shipBusy === `cancel-${primaryShipment.awb}` ? "…" : "Cancel label"}
                              </button>
                            ) : null}
                            {primaryShipment.awb && isDelhiveryCourier(primaryShipment.courier) ? (
                              <a
                                href={delhiveryLabelUrl(primaryShipment.awb)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-900/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-950 no-underline hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                              >
                                Print label
                              </a>
                            ) : null}
                          </div>
                          {order.shipments.length > 1 ? (
                            <p className="text-stone-400">+{order.shipments.length - 1} more label(s) — use Refresh all</p>
                          ) : null}
                        </div>
                      ) : idx === 0 ? (
                        <span className="text-stone-400">No label yet</span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {order.shipments.length > 1 ? (
          <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-700">
            <p className="mb-2 text-xs font-semibold uppercase text-stone-500">All shipment labels</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="text-stone-500">
                    <th className="py-1 pr-3">Courier</th>
                    <th className="py-1 pr-3">AWB</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {order.shipments.map((s) => (
                    <tr key={s.id} className="border-t border-stone-50 dark:border-stone-800">
                      <td className="py-2 pr-3">{s.courier}</td>
                      <td className="py-2 pr-3 font-mono">{s.awb ?? "—"}</td>
                      <td className="py-2 pr-3">{s.status.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-2">
                          {s.trackingUrl ? (
                            <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline">
                              Open
                            </a>
                          ) : null}
                          {s.awb ? (
                            <button
                              type="button"
                              className="underline"
                              disabled={!!shipBusy || !shipUi}
                              onClick={() => void handleTrackOne(s.awb!)}
                            >
                              Sync
                            </button>
                          ) : null}
                          {s.awb ? (
                            <button
                              type="button"
                              className="text-red-700 underline dark:text-red-400"
                              disabled={!!shipBusy}
                              onClick={() => setCancelAwbConfirm(s.awb!)}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {s.awb && isDelhiveryCourier(s.courier) ? (
                            <a
                              href={delhiveryLabelUrl(s.awb)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-emerald-800 no-underline dark:text-emerald-300"
                            >
                              Print label
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Totals</h2>
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
            <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold dark:border-stone-700">
              <dt>Grand total</dt>
              <dd>{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</dd>
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
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Payment &amp; refunds</h2>
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
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Addresses</h2>
          {order.addresses.map((a) => (
            <div
              key={a.id ?? `${a.type}-${a.line1}`}
              className="rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900"
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
    </div>
  );
}
