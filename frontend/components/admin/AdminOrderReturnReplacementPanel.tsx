"use client";

import { useEffect, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { formatMinorFromPaise } from "@/lib/money";
import {
  adminClearReturnRefundOverride,
  adminFetchReturnRefundPreview,
  adminMarkReturnDisposition,
  adminMarkReturnReceived,
  adminProcessReturnRefund,
  adminSetReturnRefundOverride,
  adminUpdateReturnShipment,
  adminShipReplacement,
  type ReturnRefundPreview
} from "@/lib/order-service-request";

export type ReturnReplacementAdminContext = {
  orderId: string;
  currency: string;
  paymentProvider: string | null;
  orderItems?: Array<{ id: string; lineTotalInPaise: number; qtyOrdered: number }>;
  request: {
    id: string;
    caseNumber?: string | null;
    status: string;
    returnPhysicalStatus?: string;
    resolutionStatus?: string;
    shippingRefundPolicy?: string | null;
    refundTotalInPaise?: number | null;
    refundProcessedAt?: string | null;
    refundProviderReference?: string | null;
    items?: Array<{
      id: string;
      orderItemId?: string;
      nameSnapshot: string;
      qtySelected: number;
      reasonLabel: string;
      reviewDecision?: string | null;
      requestedResolution?: string | null;
      refundAmountInPaise?: number | null;
      refundedAt?: string | null;
      refundProviderId?: string | null;
    }>;
    returnShipment?: {
      id: string;
      awb?: string | null;
      courier?: string | null;
      trackingUrl?: string | null;
      physicalStatus?: string;
      receivedAt?: string | null;
      disposition?: string | null;
    } | null;
    replacementFulfillments?: Array<{
      id: string;
      qty: number;
      status: string;
      replacementVariantId: string;
    }>;
  };
};

const RESOLUTION_LABELS: Record<string, string> = {
  RETURN_FOR_REFUND: "Return for refund",
  REPLACEMENT: "Replacement",
  PARTIAL_REFUND: "Partial refund",
  KEEP_ITEM_PARTIAL_REFUND: "Keep item — partial refund",
  MISSING_PART: "Missing part"
};

function humanPhysicalStatus(value?: string | null): string {
  switch (value) {
    case "AWAITING_RETURN":
      return "Awaiting customer return";
    case "IN_TRANSIT":
      return "Return in transit";
    case "RECEIVED":
      return "Return received";
    case "INSPECTED":
      return "Inspection completed";
    case "NOT_REQUIRED":
      return "Physical return not required";
    default:
      return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanResolutionStatus(value?: string | null): string {
  switch (value) {
    case "REFUND_PENDING":
      return "Refund pending";
    case "REFUND_PROCESSING":
      return "Refund processing";
    case "REFUNDED":
      return "Refund processed";
    case "REPLACEMENT_PENDING":
      return "Replacement pending";
    case "NONE":
      return "None";
    default:
      return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanShippingPolicy(value?: string | null): string {
  switch (value) {
    case "MIXED":
      return "Shipping policy: Mixed";
    case "SHIPPING_REFUNDABLE":
      return "Shipping refundable — seller/logistics fault";
    case "SHIPPING_RETAINED":
      return "Shipping retained — customer preference";
    case "MANUAL_REVIEW":
      return "Shipping — manual review";
    default:
      return value?.replace(/_/g, " ") ?? "—";
  }
}

function humanDisposition(value?: string | null): string {
  switch (value) {
    case "RESTOCKABLE":
      return "Restockable";
    case "DAMAGED_NON_RESTOCKABLE":
      return "Damaged — do not restock";
    case "NEEDS_REVIEW":
      return "Needs further review";
    default:
      return value?.replace(/_/g, " ") ?? "—";
  }
}

export function AdminOrderReturnReplacementPanel({
  ctx,
  onDone,
  showOverride = false
}: {
  ctx: ReturnReplacementAdminContext;
  onDone: () => void;
  /** Show controlled Adjust refund amount UI (Returns desk). */
  showOverride?: boolean;
}) {
  const { orderId, request, currency, paymentProvider } = ctx;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [awb, setAwb] = useState(request.returnShipment?.awb ?? "");
  const [courier, setCourier] = useState(request.returnShipment?.courier ?? "");
  const [codNote, setCodNote] = useState("");
  const [preview, setPreview] = useState<ReturnRefundPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const isCod = paymentProvider === "COD";
  const rs = request.returnShipment;
  const needsReturn = request.returnPhysicalStatus !== "NOT_REQUIRED";
  const received = Boolean(rs?.receivedAt);
  const inspected =
    request.returnPhysicalStatus === "INSPECTED" ||
    Boolean(rs?.disposition && rs.disposition !== "NEEDS_REVIEW");
  const canReceive = needsReturn && rs && !rs.receivedAt;
  const canDisposition = Boolean(rs?.receivedAt && (!rs.disposition || rs.disposition === "NEEDS_REVIEW"));
  const alreadyRefunded =
    request.resolutionStatus === "REFUNDED" ||
    (request.refundTotalInPaise != null && request.refundTotalInPaise > 0);

  async function loadPreview() {
    if (
      !["APPROVED", "PARTIALLY_APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"].includes(
        request.status
      )
    ) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await adminFetchReturnRefundPreview(orderId, request.id);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Could not load refund preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when workflow fields change
  }, [
    orderId,
    request.id,
    request.status,
    request.returnPhysicalStatus,
    request.resolutionStatus,
    rs?.receivedAt,
    rs?.disposition
  ]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage("Saved.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const confirmAmount = preview?.totalRefundNowPaise ?? 0;
  const canShowRefundAction =
    (request.status === "APPROVED" || request.status === "PARTIALLY_APPROVED") &&
    !alreadyRefunded &&
    preview?.executable === true &&
    confirmAmount > 0;

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <AdminConfirmModal
        open={confirmOpen}
        title="Confirm refund"
        danger
        busy={busy === "refund"}
        confirmLabel={`Confirm ${formatMinorFromPaise(confirmAmount, currency)} refund`}
        cancelLabel="Cancel"
        message={`You are about to refund ${formatMinorFromPaise(confirmAmount, currency)} to the customer's original ${preview?.paymentProvider ?? "payment"} method.

This action will initiate a real payment gateway refund.`}
        details={[
          `Order: ${preview?.orderNumber ?? "—"}`,
          `Return case: ${preview?.caseNumber ?? request.caseNumber ?? "—"}`,
          `Approved quantity: ${preview?.approvedQtySelected ?? "—"} of ${preview?.orderedQtyOnLines ?? "—"}`,
          `Merchandise: ${formatMinorFromPaise(preview?.merchandiseRefundPaise ?? 0, currency)}`,
          `Shipping: ${formatMinorFromPaise(preview?.shippingRefundPaise ?? 0, currency)}`,
          ...(preview && preview.otherAdjustmentPaise > 0
            ? [`Other adjustment: ${formatMinorFromPaise(preview.otherAdjustmentPaise, currency)}`]
            : []),
          `Total refund: ${formatMinorFromPaise(confirmAmount, currency)}`
        ]}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          void run("refund", async () => {
            setConfirmOpen(false);
            // Re-fetch authoritative preview immediately before gateway call.
            const fresh = await adminFetchReturnRefundPreview(orderId, request.id);
            if (!fresh.executable || fresh.totalRefundNowPaise <= 0) {
              throw new Error(fresh.blockMessage || "Refund is no longer executable");
            }
            await adminProcessReturnRefund(orderId, request.id, isCod ? codNote : undefined);
          })
        }
      />

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
          Return / replacement workflow
        </p>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
          Physical: {humanPhysicalStatus(request.returnPhysicalStatus)} · Resolution:{" "}
          {humanResolutionStatus(request.resolutionStatus)}
          {request.shippingRefundPolicy || preview?.shippingPolicy
            ? ` · ${humanShippingPolicy(
                preview?.shippingPolicy === "MIXED"
                  ? "MIXED"
                  : preview?.shippingPolicy ?? request.shippingRefundPolicy
              )}`
            : ""}
          {request.caseNumber ? ` · ${request.caseNumber}` : ""}
        </p>
        {needsReturn && request.status === "APPROVED" && !inspected && !alreadyRefunded ? (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs text-amber-950">
            Gateway refund stays locked until warehouse receipt and QC/disposition are recorded.
          </p>
        ) : null}
      </div>

      {request.items?.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900"
        >
          <p className="font-semibold">{item.nameSnapshot}</p>
          <p className="text-xs text-stone-500">
            {(() => {
              const decision = item.reviewDecision ?? "PENDING";
              const ordered = ctx.orderItems?.find((o) => o.id === item.orderItemId)?.qtyOrdered;
              const of = ordered != null ? ` of ${ordered}` : "";
              if (decision === "REJECTED") return `Rejected qty ${item.qtySelected}${of}`;
              if (decision === "MORE_INFO_REQUIRED") {
                return `More info requested for ${item.qtySelected}${of}`;
              }
              if (decision === "PENDING") return `Pending qty ${item.qtySelected}${of}`;
              return `Approved qty ${item.qtySelected}${of}`;
            })()}{" "}
            · {item.reasonLabel}
            {item.requestedResolution
              ? ` · ${RESOLUTION_LABELS[item.requestedResolution] ?? item.requestedResolution}`
              : ""}
          </p>
        </div>
      ))}

      {needsReturn && request.status === "APPROVED" && !received ? (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase text-stone-500">Return logistics</p>
          <input
            className="w-full rounded border px-2 py-1.5 text-sm"
            placeholder="Courier"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
          />
          <input
            className="w-full rounded border px-2 py-1.5 text-sm"
            placeholder="Return AWB"
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
          />
          <button
            type="button"
            disabled={busy != null}
            className="rounded bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void run("shipment", () =>
                adminUpdateReturnShipment(orderId, request.id, {
                  courier,
                  awb,
                  physicalStatus: "IN_TRANSIT"
                })
              )
            }
          >
            Save return tracking
          </button>
          {canReceive ? (
            <button
              type="button"
              disabled={busy != null}
              className="ml-2 rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => void run("received", () => adminMarkReturnReceived(orderId, request.id))}
            >
              Mark return received
            </button>
          ) : null}
        </div>
      ) : null}

      {needsReturn && received ? (
        <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase text-stone-500">Return logistics</p>
          <dl className="mt-2 space-y-1 text-xs text-stone-700 dark:text-stone-300">
            <div className="flex justify-between gap-4">
              <dt>Status</dt>
              <dd className="font-medium">{humanPhysicalStatus(request.returnPhysicalStatus)}</dd>
            </div>
            {rs?.courier ? (
              <div className="flex justify-between gap-4">
                <dt>Courier</dt>
                <dd>{rs.courier}</dd>
              </div>
            ) : null}
            {rs?.awb ? (
              <div className="flex justify-between gap-4">
                <dt>Return AWB</dt>
                <dd className="font-mono">{rs.awb}</dd>
              </div>
            ) : null}
            {rs?.receivedAt ? (
              <div className="flex justify-between gap-4">
                <dt>Received</dt>
                <dd>{new Date(rs.receivedAt).toLocaleString("en-IN")}</dd>
              </div>
            ) : null}
            {rs?.disposition ? (
              <div className="flex justify-between gap-4">
                <dt>Disposition</dt>
                <dd>{humanDisposition(rs.disposition)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {canDisposition ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-stone-500">Inspection / disposition</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["RESTOCKABLE", "Restockable"],
                ["DAMAGED_NON_RESTOCKABLE", "Damaged — do not restock"],
                ["NEEDS_REVIEW", "Needs further review"]
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                disabled={busy != null}
                className="rounded border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800"
                onClick={() =>
                  void run(`disp-${code}`, () => adminMarkReturnDisposition(orderId, request.id, code))
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {request.status === "APPROVED" ||
      request.status === "PARTIALLY_APPROVED" ||
      request.status === "PENDING_APPROVAL" ||
      request.status === "MORE_INFO_REQUIRED" ? (
        <div className="rounded-lg border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-stone-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
              Refund summary
            </p>
            <button
              type="button"
              disabled={previewLoading || busy != null}
              className="text-[11px] font-semibold text-emerald-800 underline disabled:opacity-50"
              onClick={() => void loadPreview()}
            >
              {previewLoading ? "Refreshing…" : "Refresh preview"}
            </button>
          </div>

          {previewLoading && !preview ? (
            <p className="mt-3 text-xs text-stone-500">Loading authoritative refund calculation…</p>
          ) : preview ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="space-y-2">
                {preview.lines.map((line) => (
                  <div
                    key={line.requestItemId}
                    className="rounded border border-stone-100 bg-stone-50/80 px-3 py-2 text-xs dark:border-stone-700 dark:bg-stone-950/40"
                  >
                    <p className="font-semibold text-stone-800 dark:text-stone-100">
                      {line.nameSnapshot} — {line.qtySelected} of {line.qtyOrdered}
                    </p>
                    <p className="text-stone-500">
                      Reason: {line.reasonLabel ?? "—"}
                      {line.reviewDecision ? ` · ${line.reviewDecision}` : ""}
                    </p>
                    <p className="text-stone-500">
                      {line.shippingPolicyLabel ?? humanShippingPolicy(line.shippingPolicy)}
                    </p>
                    <dl className="mt-1 space-y-0.5">
                      <div className="flex justify-between gap-4">
                        <dt>Merchandise refund</dt>
                        <dd>{formatMinorFromPaise(line.merchandiseRefundPaise, preview.currency)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt>Shipping refund</dt>
                        <dd>{formatMinorFromPaise(line.shippingRefundPaise, preview.currency)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 font-semibold">
                        <dt>Line refund</dt>
                        <dd>
                          {formatMinorFromPaise(
                            line.potentialLineTotalPaise ?? line.lineTotalRefundPaise,
                            preview.currency
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <dl className="space-y-1 border-t border-emerald-100 pt-2 text-xs dark:border-emerald-900">
                <div className="flex justify-between gap-4">
                  <dt>Total merchandise</dt>
                  <dd className="font-semibold">
                    {formatMinorFromPaise(preview.merchandiseRefundPaise, preview.currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Total shipping</dt>
                  <dd className="font-semibold">
                    {formatMinorFromPaise(preview.shippingRefundPaise, preview.currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="font-bold">
                    {preview.executable ? "TOTAL REFUND NOW" : "EXPECTED TOTAL (if approved)"}
                  </dt>
                  <dd className="font-bold text-emerald-900 dark:text-emerald-200">
                    {formatMinorFromPaise(
                      preview.executable
                        ? preview.totalRefundNowPaise
                        : preview.requestedRefundPaise ?? preview.calculatedRefundPaise ?? 0,
                      preview.currency
                    )}
                  </dd>
                </div>
              </dl>
              <p className="text-[11px] text-stone-500">
                {humanShippingPolicy(preview.shippingPolicy)}
              </p>
              {!preview.executable ? (
                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                  {preview.blockMessage ?? "Refund not executable yet"}
                </p>
              ) : null}

              {showOverride && !alreadyRefunded ? (
                <div className="mt-3 border-t border-emerald-100 pt-3">
                  {!overrideOpen ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-violet-800 underline"
                      onClick={() => {
                        setOverrideOpen(true);
                        setOverrideAmount(
                          ((preview.calculatedRefundPaise ?? preview.totalRefundNowPaise) / 100).toFixed(2)
                        );
                        setOverrideReason("");
                      }}
                    >
                      Adjust refund amount
                    </button>
                  ) : (
                    <div className="space-y-2 rounded border border-violet-200 bg-violet-50/50 p-3">
                      <p className="text-xs font-semibold text-violet-900">Manual refund adjustment</p>
                      <p className="text-[11px] text-violet-800">
                        System-calculated:{" "}
                        {formatMinorFromPaise(
                          preview.calculatedRefundPaise ?? preview.totalRefundNowPaise,
                          preview.currency
                        )}
                      </p>
                      <label className="block text-[11px]">
                        Adjusted amount ({preview.currency})
                        <input
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                          value={overrideAmount}
                          onChange={(e) => setOverrideAmount(e.target.value)}
                        />
                      </label>
                      <label className="block text-[11px]">
                        Reason (required)
                        <input
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Why is the amount different?"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy != null || !overrideReason.trim()}
                          className="rounded bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          onClick={() =>
                            void run("override", async () => {
                              const rupees = Number(overrideAmount);
                              if (!Number.isFinite(rupees) || rupees < 0) {
                                throw new Error("Enter a valid non-negative amount");
                              }
                              const data = await adminSetReturnRefundOverride(orderId, request.id, {
                                overrideRefundPaise: Math.round(rupees * 100),
                                reason: overrideReason.trim()
                              });
                              setPreview(data);
                              setOverrideOpen(false);
                            })
                          }
                        >
                          Save override
                        </button>
                        {preview.overrideActive ? (
                          <button
                            type="button"
                            disabled={busy != null}
                            className="rounded border border-stone-400 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                            onClick={() =>
                              void run("clear-override", async () => {
                                const data = await adminClearReturnRefundOverride(orderId, request.id);
                                setPreview(data);
                                setOverrideOpen(false);
                              })
                            }
                          >
                            Clear override
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs text-stone-600 underline"
                          onClick={() => setOverrideOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-stone-500">Refund preview unavailable.</p>
          )}

          {alreadyRefunded ? (
            <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
              <p className="font-semibold">Refund processed</p>
              <p className="mt-1">
                Amount:{" "}
                {formatMinorFromPaise(
                  request.refundTotalInPaise ?? preview?.totalRefundNowPaise ?? 0,
                  currency
                )}
              </p>
              {request.refundProviderReference ? (
                <p className="mt-0.5 font-mono">Reference: {request.refundProviderReference}</p>
              ) : null}
              {request.refundProcessedAt ? (
                <p className="mt-0.5">
                  Initiated: {new Date(request.refundProcessedAt).toLocaleString("en-IN")}
                </p>
              ) : null}
              <p className="mt-1 text-stone-600">
                Gateway confirmation means the refund was initiated. Bank credit may take a few business days.
              </p>
            </div>
          ) : null}

          {canShowRefundAction ? (
            <div className="mt-4 space-y-2">
              {isCod ? (
                <textarea
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="COD refund — bank/UPI details for manual transfer"
                  value={codNote}
                  onChange={(e) => setCodNote(e.target.value)}
                />
              ) : null}
              <button
                type="button"
                disabled={busy != null}
                className="rounded bg-brand-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => setConfirmOpen(true)}
              >
                Refund {formatMinorFromPaise(confirmAmount, currency)} to original payment method
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {request.replacementFulfillments?.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <span>
            Replacement ×{f.qty} — {f.status.replace(/_/g, " ")}
          </span>
          {f.status === "REPLACEMENT_PENDING" ? (
            <button
              type="button"
              disabled={busy != null}
              className="rounded bg-stone-800 px-2 py-1 text-xs font-semibold text-white"
              onClick={() =>
                void run(`ship-${f.id}`, () =>
                  adminShipReplacement(f.id, {
                    awb: awb || `REP-${Date.now()}`,
                    courier: courier || "Manual"
                  })
                )
              }
            >
              Mark shipped
            </button>
          ) : null}
        </div>
      ))}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
