"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminToast } from "@/components/admin/AdminToast";
import {
  adminCreateShipmentForOrder,
  adminEstimateDelhiveryCharge,
  adminSyncOrderShipments,
  delhiveryLabelUrl,
  fetchAdminOrderDetail,
  fetchAdminOrderShippingBreakdown,
  fetchAdminPickupLocations,
  type AdminPickupLocationRow,
  type DelhiveryShipBox
} from "@/lib/admin-api";
import {
  digitsOnly,
  totalChargeableWeightGrams,
  validateBoxDimensions
} from "@/lib/chargeable-weight";
import { formatMinorFromPaise } from "@/lib/money";
import { DEFAULT_SHIP_BOX_PRESET, SHIP_BOX_PRESETS } from "@/lib/ship-box-presets";
import { allOrderAwbRows, primaryForwardShipment } from "@/lib/shipment-labels";

const MAX_SHIP_BOXES = 5;
const DIM_MAX_CM = 200;
const CHANNEL = "www.sarveda.com";

function defaultShipBox(weightGrams = 0): DelhiveryShipBox {
  return {
    lengthCm: DEFAULT_SHIP_BOX_PRESET.lengthCm,
    breadthCm: DEFAULT_SHIP_BOX_PRESET.breadthCm,
    heightCm: DEFAULT_SHIP_BOX_PRESET.heightCm,
    weightGrams: Math.max(0, weightGrams),
    packageType: "CARDBOARD_BOX"
  };
}

function patchDim(
  boxes: DelhiveryShipBox[],
  activeIdx: number,
  field: "lengthCm" | "breadthCm" | "heightCm",
  raw: string
): DelhiveryShipBox[] {
  const digits = digitsOnly(raw);
  const parsed = digits === "" ? 0 : Math.min(DIM_MAX_CM, Math.max(0, Number.parseInt(digits, 10)));
  return boxes.map((b, i) => (i === activeIdx ? { ...b, [field]: parsed } : b));
}

function patchWeight(boxes: DelhiveryShipBox[], activeIdx: number, raw: string): DelhiveryShipBox[] {
  const digits = digitsOnly(raw, 6);
  const parsed = digits === "" ? 0 : Math.min(500_000, Math.max(0, Number.parseInt(digits, 10)));
  return boxes.map((b, i) => (i === activeIdx ? { ...b, weightGrams: parsed } : b));
}

type OrderLoaded = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  email: string;
  phone?: string | null;
  shippingInPaise: number;
  taxInPaise?: number;
  subtotalInPaise?: number;
  grandTotalInPaise: number;
  customer?: { name?: string | null } | null;
  items: Array<{
    id?: string;
    nameSnapshot: string;
    skuSnapshot: string;
    qtyOrdered: number;
    /** Remaining to pack after restocks (pre-ship refunds). */
    qtyShippable?: number;
    returnedQty?: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  }>;
  addresses: Array<{
    type: string;
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }>;
  payments?: Array<{ provider?: string | null }>;
  shipments?: Array<{
    id: string;
    courier: string;
    awb: string | null;
    trackingUrl: string | null;
    status: string;
    carrierMeta?: Record<string, unknown> | null;
  }>;
};

export default function AdminShipmentCreateLabelPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";

  const [order, setOrder] = useState<OrderLoaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [pickupOptions, setPickupOptions] = useState<AdminPickupLocationRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState("");
  const [shipBoxes, setShipBoxes] = useState<DelhiveryShipBox[]>([defaultShipBox()]);
  const [activeShipBoxIdx, setActiveShipBoxIdx] = useState(0);
  const [shipMode, setShipMode] = useState<"S" | "E">("S");
  const [shipPaymentMode, setShipPaymentMode] = useState<"Pre-paid" | "COD">("Pre-paid");
  const [freightByMode, setFreightByMode] = useState<{ S: number | null; E: number | null }>({
    S: null,
    E: null
  });
  const [freightBusy, setFreightBusy] = useState(false);
  const [shipBusy, setShipBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [breakdown, setBreakdown] = useState<{
    breakdown: {
      zone: string;
      lines: Array<{ productName: string; quantity: number; lineTotal: number; codSurcharge: number }>;
      subtotalShipping: number;
      codExtra: number;
      totalWithCod: number;
    };
    orderShippingCharged: number;
  } | null>(null);

  const pushToast = (message: string, error = false) => setToast({ message, error });

  const load = useCallback(async () => {
    if (!orderId) return;
    setErr(null);
    try {
      const [o, pickups, br] = await Promise.all([
        fetchAdminOrderDetail(orderId),
        fetchAdminPickupLocations({ activeOnly: true }),
        fetchAdminOrderShippingBreakdown(orderId).catch(() => null)
      ]);
      const loaded = o as unknown as OrderLoaded;
      setOrder(loaded);
      setBreakdown(br);
      const list = pickups ?? [];
      setPickupOptions(list);
      if (list[0] && !selectedPickupId) setSelectedPickupId(list[0].id);
      const isCod = loaded.payments?.[0]?.provider === "COD";
      setShipPaymentMode(isCod ? "COD" : "Pre-paid");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load order");
      setOrder(null);
    }
  }, [orderId, selectedPickupId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per orderId
  }, [orderId]);

  const activeShipBox = shipBoxes[activeShipBoxIdx] ?? shipBoxes[0] ?? defaultShipBox();
  const totalChargeableG = totalChargeableWeightGrams(shipBoxes);
  const boxDimError = validateBoxDimensions(
    activeShipBox.lengthCm,
    activeShipBox.breadthCm,
    activeShipBox.heightCm
  );

  const shippingAddr = useMemo(() => {
    if (!order) return null;
    return order.addresses.find((a) => a.type === "SHIPPING") ?? order.addresses[0] ?? null;
  }, [order]);

  const forward = order ? primaryForwardShipment(order.shipments ?? []) : null;
  const awbRows = order ? allOrderAwbRows(order.shipments ?? []) : [];
  const hasForwardAwb = Boolean(forward?.awb?.trim());

  useEffect(() => {
    if (!order || !shippingAddr || hasForwardAwb) return;
    const destPin = (shippingAddr.postalCode || "").replace(/\D/g, "");
    if (destPin.length !== 6 || shipBoxes.length === 0) {
      setFreightByMode({ S: null, E: null });
      return;
    }
    if (shipBoxes.some((b) => validateBoxDimensions(b.lengthCm, b.breadthCm, b.heightCm) != null)) {
      return;
    }
    const originPin =
      pickupOptions.find((p) => p.id === selectedPickupId)?.postalCode?.replace(/\D/g, "") ?? "";
    if (originPin.length !== 6) return;

    let cancelled = false;
    setFreightBusy(true);
    void (async () => {
      try {
        const [s, e] = await Promise.all([
          adminEstimateDelhiveryCharge({
            originPin,
            destPin,
            shippingMode: "S",
            paymentMode: shipPaymentMode,
            boxes: shipBoxes
          }),
          adminEstimateDelhiveryCharge({
            originPin,
            destPin,
            shippingMode: "E",
            paymentMode: shipPaymentMode,
            boxes: shipBoxes
          })
        ]);
        if (!cancelled) {
          setFreightByMode({
            S: typeof s.totalAmount === "number" ? s.totalAmount : null,
            E: typeof e.totalAmount === "number" ? e.totalAmount : null
          });
        }
      } catch {
        if (!cancelled) setFreightByMode({ S: null, E: null });
      } finally {
        if (!cancelled) setFreightBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    order,
    shippingAddr,
    hasForwardAwb,
    shipBoxes,
    shipPaymentMode,
    selectedPickupId,
    pickupOptions
  ]);

  async function handleCreateLabel() {
    if (!orderId || !order) return;
    const invalid = shipBoxes.find(
      (b) => validateBoxDimensions(b.lengthCm, b.breadthCm, b.heightCm) != null
    );
    if (invalid) {
      pushToast(
        validateBoxDimensions(invalid.lengthCm, invalid.breadthCm, invalid.heightCm) ??
          "Invalid box dimensions",
        true
      );
      return;
    }
    if (!selectedPickupId) {
      pushToast("Select a pickup facility.", true);
      return;
    }
    setShipBusy(true);
    try {
      const created = await adminCreateShipmentForOrder(orderId, {
        pickupLocationId: selectedPickupId,
        preferredCourier: "DELHIVERY",
        channel: CHANNEL,
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
      pushToast(`Label created — AWB ${created.waybill}. Order moved to Processing.`);
      await load();
      router.push("/admin/shipments?bucket=created");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Could not create label", true);
      void load();
    } finally {
      setShipBusy(false);
    }
  }

  async function handleSync() {
    if (!orderId) return;
    setSyncBusy(true);
    try {
      await adminSyncOrderShipments(orderId);
      pushToast("Tracking synced from Delhivery.");
      await load();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Sync failed", true);
    } finally {
      setSyncBusy(false);
    }
  }

  if (!orderId) {
    return <p className="p-6 text-red-600">Missing order id</p>;
  }

  if (err) {
    return (
      <div className="space-y-4 p-2">
        <Link href="/admin/shipments?bucket=ready" className="inline-flex items-center gap-1 text-sm text-[#1c352a]">
          <ChevronLeft size={16} /> Back to Shipments
        </Link>
        <p className="text-red-600" role="alert">
          {err}
        </p>
      </div>
    );
  }

  if (!order) {
    return <AdminSkeleton />;
  }

  const fmtFreight = (n: number | null) =>
    n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {toast ? <AdminToast toast={toast} onDismiss={() => setToast(null)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/shipments?bucket=ready"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-[#8a7060] hover:text-[#1c352a]"
          >
            <ChevronLeft size={16} /> Shipments
          </Link>
          <h1 className="text-2xl font-extrabold text-[#1c352a]">Create label</h1>
          <p className="mt-1 text-sm text-stone-500">
            {order.orderNumber} · {order.status.replace(/_/g, " ")} · After create, status becomes{" "}
            <strong>Processing</strong> and the row moves to <strong>Created</strong>.
          </p>
        </div>
        <Link
          href={`/admin/orders/${order.id}`}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700"
        >
          Open full order
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Order</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Customer</dt>
              <dd className="font-semibold text-stone-900">
                {order.customer?.name || shippingAddr?.fullName || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Email</dt>
              <dd className="text-right text-stone-800">{order.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Phone</dt>
              <dd>{shippingAddr?.phone || order.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-stone-500">Payment</dt>
              <dd>{order.payments?.[0]?.provider ?? "—"} · {order.paymentStatus}</dd>
            </div>
          </dl>

          {shippingAddr ? (
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
              <p className="text-xs font-semibold uppercase text-stone-500">Ship to</p>
              <p className="mt-1 font-medium">{shippingAddr.fullName}</p>
              <p>
                {shippingAddr.line1}
                {shippingAddr.line2 ? `, ${shippingAddr.line2}` : ""}
              </p>
              <p>
                {shippingAddr.city}, {shippingAddr.state} {shippingAddr.postalCode}
              </p>
              <p>{shippingAddr.country}</p>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-[11px] uppercase text-stone-500">
                <tr>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">Qty</th>
                  <th className="py-2 text-right">Line</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {order.items
                  .map((it) => {
                    const qty =
                      typeof it.qtyShippable === "number"
                        ? it.qtyShippable
                        : it.qtyOrdered;
                    if (qty <= 0) return null;
                    const linePaise =
                      it.qtyOrdered > 0
                        ? Math.round((it.lineTotalInPaise * qty) / it.qtyOrdered)
                        : it.lineTotalInPaise;
                    return (
                      <tr key={it.id ?? `${it.skuSnapshot}-${qty}`}>
                        <td className="py-2 pr-2">
                          <div className="font-medium">{it.nameSnapshot}</div>
                          <div className="font-mono text-[11px] text-stone-500">
                            {it.skuSnapshot}
                          </div>
                          {typeof it.returnedQty === "number" && it.returnedQty > 0 ? (
                            <div className="mt-0.5 text-[11px] text-amber-800">
                              Ordered {it.qtyOrdered}, restocked {it.returnedQty}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2">{qty}</td>
                        <td className="py-2 text-right font-semibold">
                          {formatMinorFromPaise(linePaise, order.currency)}
                        </td>
                      </tr>
                    );
                  })
                  .filter(Boolean)}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-sm">
            {typeof order.subtotalInPaise === "number" ? (
              <div className="flex justify-between">
                <dt className="text-stone-500">Subtotal</dt>
                <dd>{formatMinorFromPaise(order.subtotalInPaise, order.currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-stone-500">Shipping charged</dt>
              <dd>{formatMinorFromPaise(order.shippingInPaise, order.currency)}</dd>
            </div>
            {typeof order.taxInPaise === "number" && order.taxInPaise > 0 ? (
              <div className="flex justify-between">
                <dt className="text-stone-500">Tax / GST (incl.)</dt>
                <dd>{formatMinorFromPaise(order.taxInPaise, order.currency)}</dd>
              </div>
            ) : (
              <div className="flex justify-between text-stone-500">
                <dt>Tax / GST</dt>
                <dd className="text-xs">Included in line prices (GST-inclusive catalog)</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Grand total</dt>
              <dd>{formatMinorFromPaise(order.grandTotalInPaise, order.currency)}</dd>
            </div>
          </dl>

          {breakdown ? (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
              <p className="text-xs font-semibold uppercase text-amber-900">
                Shipping breakdown · zone {breakdown.breakdown.zone}
              </p>
              <ul className="mt-2 space-y-1 text-amber-950">
                {breakdown.breakdown.lines.map((line, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {line.productName} × {line.quantity}
                    </span>
                    <span className="font-mono text-xs">
                      ₹{(line.lineTotal / 100).toFixed(2)}
                      {line.codSurcharge ? ` + COD ₹${(line.codSurcharge / 100).toFixed(2)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t border-amber-200/80 pt-2 font-semibold">
                <span>Total shipping (w/ COD)</span>
                <span>₹{(breakdown.breakdown.totalWithCod / 100).toFixed(2)}</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          {hasForwardAwb ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Label already created</h2>
              {awbRows.map((row) => (
                <div
                  key={`${row.shipmentId}-${row.awb}`}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm"
                >
                  <p>
                    <span className="text-stone-500">Courier</span> · {row.courier}
                  </p>
                  <p className="mt-1 font-mono text-xs">AWB {row.awb}</p>
                  <p className="mt-1">Status: {row.status}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.isDelhiveryIntegrated && row.awb ? (
                      <a
                        href={delhiveryLabelUrl(row.awb)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                      >
                        Download label
                      </a>
                    ) : null}
                    {row.trackingUrl ? (
                      <a
                        href={row.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-sky-700 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900"
                      >
                        Track
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => void handleSync()}
                className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {syncBusy ? "Syncing…" : "Sync tracking from Delhivery"}
              </button>
              <p className="text-xs text-stone-500">
                Picked → In transit → Out for delivery → Delivered updates come from Delhivery when you sync (or via
                automated tracking).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Delhivery label</h2>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-stone-500">Facility *</span>
                <select
                  value={selectedPickupId}
                  onChange={(e) => setSelectedPickupId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  {pickupOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.delhiveryPickupName || p.label}
                      {p.city ? ` · ${p.city}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-stone-500">Payment mode</span>
                <select
                  value={shipPaymentMode}
                  onChange={(e) => setShipPaymentMode(e.target.value as "Pre-paid" | "COD")}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="Pre-paid">Pre-Paid</option>
                  <option value="COD">Cash On Delivery</option>
                </select>
              </label>

              <div className="flex flex-wrap gap-1">
                {shipBoxes.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveShipBoxIdx(idx)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                      activeShipBoxIdx === idx
                        ? "border-stone-900 bg-stone-900 text-amber-50"
                        : "border-stone-300 text-stone-600"
                    }`}
                  >
                    Box {idx + 1}
                  </button>
                ))}
                {shipBoxes.length < MAX_SHIP_BOXES ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShipBoxes((prev) => [...prev, defaultShipBox(activeShipBox.weightGrams)]);
                      setActiveShipBoxIdx(shipBoxes.length);
                    }}
                    className="rounded-md border border-dashed border-stone-400 px-2.5 py-1 text-xs font-semibold"
                  >
                    + Add box
                  </button>
                ) : null}
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
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                >
                  <option value="PLASTIC_COVER">Plastic cover / Flyer</option>
                  <option value="CARDBOARD_BOX">Cardboard Box</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-stone-500">Box size preset</span>
                <select
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
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
                  {SHIP_BOX_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-2">
                {(["lengthCm", "breadthCm", "heightCm"] as const).map((field) => (
                  <label key={field} className="block text-[11px] text-stone-500">
                    {field === "lengthCm" ? "L" : field === "breadthCm" ? "B" : "H"} (cm)
                    <input
                      type="text"
                      inputMode="numeric"
                      value={activeShipBox[field] > 0 ? String(activeShipBox[field]) : ""}
                      onChange={(e) =>
                        setShipBoxes((prev) => patchDim(prev, activeShipBoxIdx, field, e.target.value))
                      }
                      className="mt-0.5 w-full rounded-lg border border-stone-300 px-2 py-2 font-mono text-sm"
                    />
                  </label>
                ))}
              </div>
              {boxDimError ? (
                <p className="text-[11px] font-medium text-red-600">{boxDimError}</p>
              ) : null}

              <label className="block">
                <span className="text-xs text-stone-500">Weight (gm)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={activeShipBox.weightGrams > 0 ? String(activeShipBox.weightGrams) : ""}
                  onChange={(e) =>
                    setShipBoxes((prev) => patchWeight(prev, activeShipBoxIdx, e.target.value))
                  }
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
                />
              </label>

              <div>
                <span className="text-xs text-stone-500">
                  Shipping mode {freightBusy ? "(estimating…)" : ""} · chargeable{" "}
                  {totalChargeableG} g
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShipMode("S")}
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      shipMode === "S"
                        ? "border-stone-900 bg-stone-900 text-amber-50"
                        : "border-stone-300"
                    }`}
                  >
                    <span className="block text-[10px] uppercase text-stone-500">Surface</span>
                    <span className="mt-1 block text-base font-bold">{fmtFreight(freightByMode.S)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShipMode("E")}
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      shipMode === "E"
                        ? "border-stone-900 bg-stone-900 text-amber-50"
                        : "border-stone-300"
                    }`}
                  >
                    <span className="block text-[10px] uppercase text-stone-500">Express</span>
                    <span className="mt-1 block text-base font-bold">{fmtFreight(freightByMode.E)}</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={shipBusy || !!boxDimError || !selectedPickupId}
                onClick={() => void handleCreateLabel()}
                className="w-full rounded-xl bg-[#1c352a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {shipBusy ? "Creating label…" : "Create shipment / label"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
