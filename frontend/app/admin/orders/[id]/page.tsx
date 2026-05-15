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
  nameSnapshot: string;
  skuSnapshot: string;
  qtyOrdered: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
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
};

function asOrder(raw: Record<string, unknown>): OrderLoaded {
  const items = (raw.items as OrderItemRow[]) ?? [];
  const addresses = (raw.addresses as AddressRow[]) ?? [];
  const shipments = (raw.shipments as ShipmentRow[]) ?? [];
  const payments = (raw.payments as PaymentRow[]) ?? [];
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
    shippingLastErrorAt: raw.shippingLastErrorAt != null ? String(raw.shippingLastErrorAt) : null
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
      setOrder(asOrder(raw));
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

  async function handleRetryShipment() {
    if (!id) return;
    setShipBusy("create");
    try {
      await adminCreateShipmentForOrder(
        id,
        selectedPickupId ? { pickupLocationId: selectedPickupId } : undefined
      );
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
    if (o.paymentStatus !== "CAPTURED") return false;
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
            ? `Cancel AWB ${cancelAwbConfirm} on Shiprocket and remove it here — or, if you already cancelled in Shiprocket, use “Remove label only”. This is not the same as cancelling the order (use Order status → Cancelled for that).`
            : ""
        }
        confirmLabel="Cancel on Shiprocket"
        secondaryConfirmLabel="Remove label only"
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

      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Shipping &amp; tracking</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Fulfillment:{" "}
              <span className="font-medium text-stone-700 dark:text-stone-200">{order.fulfillmentStatus}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!shipBusy || !shipUi}
              onClick={() => void handleSyncAllTracking()}
              className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-100"
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
          <p className="mt-3 text-xs text-amber-900/90 dark:text-amber-200/90">
            Carrier actions require a paid order with captured payment. Use &quot;Sync payment (Razorpay)&quot; if the
            customer paid but status is still pending.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          <strong className="font-medium text-stone-700 dark:text-stone-300">Open</strong> — carrier tracking page.{" "}
          <strong className="font-medium text-stone-700 dark:text-stone-300">Sync</strong> — pull latest status from
          Shiprocket/Delhivery into Sarveda.
        </p>

        {pickupOptions.length > 0 ? (
          <label className="mt-4 flex max-w-md flex-col gap-1 text-sm text-stone-600 dark:text-stone-300">
            <span className="font-medium text-stone-700 dark:text-stone-200">Pickup warehouse (Shiprocket)</span>
            <select
              value={selectedPickupId}
              onChange={(e) => setSelectedPickupId(e.target.value)}
              disabled={!!shipBusy || !shipUi}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              {pickupOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.isPrimary ? " (primary)" : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              <Link href="/admin/settings/pickup-locations" className="text-amber-800 underline dark:text-amber-400">
                Manage warehouses
              </Link>
            </span>
          </label>
        ) : (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            No warehouses in admin — Shiprocket uses env default.{" "}
            <Link href="/admin/settings/pickup-locations" className="text-amber-800 underline dark:text-amber-400">
              Add warehouses
            </Link>
          </p>
        )}
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          To ship from a different warehouse than the one on an existing AWB, use <strong className="font-medium">Cancel label</strong> first, then create again with the new pickup.
        </p>

        {order.shipments.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
            No carrier label yet — set status to Processing (auto) or use retry above.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-100 dark:border-stone-700">
                <tr>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Courier</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Pickup</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">AWB</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Status</th>
                  <th className="py-2 pr-4 font-semibold text-stone-600 dark:text-stone-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {order.shipments.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4">{s.courier}</td>
                    <td className="py-2 pr-4 text-stone-600 dark:text-stone-300">{s.pickupLocation?.label ?? "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{s.awb ?? "—"}</td>
                    <td className="py-2 pr-4">{s.status.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {s.trackingUrl ? (
                          <a
                            href={s.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-800 underline dark:text-amber-400"
                          >
                            Open
                          </a>
                        ) : null}
                        {s.awb ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-stone-700 underline dark:text-stone-300"
                            disabled={!!shipBusy || !shipUi}
                          >
                            {shipBusy === s.awb ? "…" : "Sync"}
                          </button>
                        ) : null}
                        {s.awb ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-red-700 underline dark:text-red-400"
                            disabled={!!shipBusy}
                            onClick={() => setCancelAwbConfirm(s.awb!)}
                          >
                            {shipBusy === `cancel-${s.awb}` ? "…" : "Cancel label"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              <dt className="text-stone-500 dark:text-stone-400">Shipping</dt>
              <dd>{formatMinorFromPaise(order.shippingInPaise, order.currency)}</dd>
            </div>
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

      <div>
        <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-100">Line items</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Product</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">SKU</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Qty</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Unit</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {order.items.map((item, idx) => (
                <tr key={`${item.skuSnapshot}-${idx}`}>
                  <td className="px-4 py-3 font-medium text-stone-800 dark:text-stone-100">{item.nameSnapshot}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-500 dark:text-stone-400">{item.skuSnapshot}</td>
                  <td className="px-4 py-3">{item.qtyOrdered}</td>
                  <td className="px-4 py-3">{formatMinorFromPaise(item.unitPriceInPaise, order.currency)}</td>
                  <td className="px-4 py-3">{formatMinorFromPaise(item.lineTotalInPaise, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
