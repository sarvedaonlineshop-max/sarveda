"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  adminCancelWaybill,
  adminCreateShipmentForOrder,
  adminSyncOrderShipments,
  adminTrackShipmentByWaybill,
  fetchAdminOrderDetail,
  fetchAdminOrderInvoice,
  fetchAdminPickupLocations,
  patchAdminOrderAddress,
  patchAdminOrderItemWarehouses,
  patchAdminOrderPreferredCourier,
  patchAdminOrderStatus,
  reconcileAdminOrderRazorpay,
  type AdminPickupLocationRow
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

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

type PaymentRow = { provider: string };

type OrderLoaded = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
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

  const canCancel = !["CANCELLED", "REFUNDED", "DELIVERED"].includes(status);
  const canRefund =
    ["PAID", "PROCESSING", "PACKED", "SHIPPED"].includes(status) && paymentStatus === "CAPTURED";

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
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsg({ text: data.message ?? "Done", ok: true });
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
        Refund / Cancel
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
              ? "This will refund the customer via the original payment method. Are you sure?"
              : "Cancel this order? Stock will be restored."}
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
  const payments = (raw.payments as PaymentRow[]) ?? [];
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
  const [invoice, setInvoice] = useState<{ pdfUrl: string | null; invoiceNo: string | null } | null>(null);
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
    setShipBusy("create");
    try {
      await persistLineShippingPrefs();
      const primaryPickup =
        Object.values(itemWarehouses).find((v) => v) || selectedPickupId || undefined;
      await adminCreateShipmentForOrder(id, {
        ...(primaryPickup ? { pickupLocationId: primaryPickup } : {}),
        preferredCourier: (selectedCourier ||
          bulkCourier) as "AUTO" | "DELHIVERY" | "SHIPROCKET" | "SHIPROCKET_INTERNATIONAL"
      });
      await load();
      pushToast("Shipment label created or refreshed.");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Shipment create failed", true);
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
            <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">{order.orderNumber}</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{order.email}</p>
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
                    {s.replace(/_/g, " ")}
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
            {invoice.pdfUrl ? (
              <a
                href={invoice.pdfUrl}
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
        <div className="flex flex-col gap-3 border-b border-stone-100 p-4 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
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
