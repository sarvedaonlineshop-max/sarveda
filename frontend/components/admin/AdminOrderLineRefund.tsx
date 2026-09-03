"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  executeFullOrderRefund,
  executeLineRefund,
  fetchLineRefundOptions,
  type LineRefundOptions,
  type RestockDisposition
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const DISPOSITION_LABEL: Record<RestockDisposition, string> = {
  SELLABLE: "Return to sellable stock",
  DAMAGED: "Damaged — not sellable",
  NON_RESTOCKABLE: "Not returnable to stock"
};

type Props = {
  orderId: string;
  currency: string;
  /** Bump after a refund so amounts reload from server truth. */
  refreshKey?: string | number;
  onRefunded?: () => void;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `line-refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminOrderLineRefund({ orderId, currency, refreshKey = 0, onRefunded }: Props) {
  const [options, setOptions] = useState<LineRefundOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [refundShipping, setRefundShipping] = useState(false);
  const [restock, setRestock] = useState(true);
  const [disposition, setDisposition] = useState<RestockDisposition>("SELLABLE");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLineRefundOptions(orderId);
      setOptions(data);
      setQuantities(Object.fromEntries(data.lines.map((l) => [l.orderItemId, 0])));
      setRestock(data.restockAvailable);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load refund options");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const fmt = (paise: number) => formatMinorFromPaise(paise, currency);

  const selected = useMemo(
    () => (options?.lines ?? []).filter((l) => (quantities[l.orderItemId] ?? 0) > 0),
    [options, quantities]
  );

  const merchandiseInPaise = selected.reduce(
    (sum, l) => sum + l.perUnitRefundInPaise * (quantities[l.orderItemId] ?? 0),
    0
  );
  const totalUnits = selected.reduce((sum, l) => sum + (quantities[l.orderItemId] ?? 0), 0);
  const orderedUnits = (options?.lines ?? []).reduce((sum, l) => sum + l.qtyOrdered, 0);
  const shippingRefundInPaise =
    refundShipping && options
      ? totalUnits >= orderedUnits
        ? options.shippingInPaise
        : Math.round((options.shippingInPaise * totalUnits) / Math.max(1, orderedUnits))
      : 0;
  const thisRefundInPaise = merchandiseInPaise + shippingRefundInPaise;
  const netAfterInPaise = options
    ? Math.max(
        0,
        options.originallyCollectedInPaise - options.alreadyRefundedInPaise - thisRefundInPaise
      )
    : 0;
  const isWholeRemaining =
    options !== null && thisRefundInPaise > 0 && thisRefundInPaise >= options.remainingRefundableInPaise;

  async function submit() {
    if (!options) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isWholeRemaining) {
        const full = await executeFullOrderRefund(orderId, reason.trim() || undefined);
        setDone(
          `Full refund of ${fmt(full.amountInPaise ?? options.remainingRefundableInPaise)} sent. Order marked refunded and stock restored.`
        );
        setConfirming(false);
        onRefunded?.();
        await load();
        return;
      }
      const result = await executeLineRefund(orderId, {
        lines: selected.map((l) => ({
          orderItemId: l.orderItemId,
          quantity: quantities[l.orderItemId] ?? 0
        })),
        refundShipping,
        restock: restock && options.restockAvailable,
        disposition,
        reason: reason.trim() || undefined,
        idempotencyKey: newIdempotencyKey()
      });
      setDone(
        `Refunded ${fmt(result.refundedInPaise)}${
          result.returnedUnits
            ? ` · ${result.returnedUnits} unit(s) recorded as ${DISPOSITION_LABEL[disposition].toLowerCase()}`
            : ""
        }`
      );
      setConfirming(false);
      onRefunded?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm text-stone-500">Loading refund options…</p>
      </div>
    );
  }

  if (!options) {
    return error ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">{error}</p>
      </div>
    ) : null;
  }

  if (!options.eligible) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Refund a product</p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{options.ineligibleReason}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-700">
        <p className="text-sm font-bold text-[#1c352a] dark:text-stone-100">Refund a product</p>
        <p className="mt-0.5 text-xs text-stone-500">
          Choose how many units to refund. The rest of the order stays sold.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-3">
          {options.lines.map((line) => {
            const qty = quantities[line.orderItemId] ?? 0;
            return (
              <div
                key={line.orderItemId}
                className="flex flex-col gap-3 rounded-lg border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-stone-700"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {line.name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-stone-500">{line.sku}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Purchased: {line.qtyOrdered} · Unit price: {fmt(line.unitPriceInPaise)}
                    {line.perUnitRefundInPaise !== line.unitPriceInPaise
                      ? ` · Refund per unit: ${fmt(line.perUnitRefundInPaise)}`
                      : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                  Refund quantity
                  <select
                    value={qty}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [line.orderItemId]: Number(e.target.value)
                      }))
                    }
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800"
                  >
                    {Array.from({ length: line.maxRefundQty + 1 }, (_, i) => i).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Shipping</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              Original shipping: {fmt(options.shippingInPaise)}
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
              <input
                type="checkbox"
                checked={refundShipping}
                disabled={options.shippingInPaise <= 0}
                onChange={(e) => setRefundShipping(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300"
              />
              Refund shipping ({fmt(shippingRefundInPaise)})
            </label>
          </div>

          <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7060]">Inventory</p>
            {options.restockAvailable ? (
              <>
                <label className="mt-2 flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                  <input
                    type="checkbox"
                    checked={restock}
                    onChange={(e) => setRestock(e.target.checked)}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  Record the refunded units as returned
                </label>
                <label className="mt-2 block text-xs text-stone-600 dark:text-stone-300">
                  Return condition
                  <select
                    value={disposition}
                    disabled={!restock}
                    onChange={(e) => setDisposition(e.target.value as RestockDisposition)}
                    className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800"
                  >
                    {options.restockDispositions.map((d) => (
                      <option key={d} value={d}>
                        {DISPOSITION_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-1 text-[11px] text-stone-500">
                  {disposition === "SELLABLE"
                    ? "Adds the units back to sellable stock."
                    : "Recorded as returned; sellable stock is not increased."}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-stone-500">
                {options.restockUnavailableReason ?? "Stock cannot be returned for this order."}
              </p>
            )}
          </div>
        </div>

        <label className="block text-xs text-stone-600 dark:text-stone-300">
          Reason (optional)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. One unit damaged in packing"
            className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800"
          />
        </label>

        <dl className="rounded-lg bg-[#faf7f2] p-4 text-sm dark:bg-stone-800">
          <div className="flex justify-between py-1">
            <dt className="text-stone-500">Originally collected</dt>
            <dd>{fmt(options.originallyCollectedInPaise)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-stone-500">Already refunded</dt>
            <dd>{fmt(options.alreadyRefundedInPaise)}</dd>
          </div>
          <div className="flex justify-between py-1">
            <dt className="text-stone-500">This refund</dt>
            <dd className="font-semibold">{fmt(thisRefundInPaise)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-stone-200 pt-2 text-base font-bold text-[#1c352a] dark:border-stone-700 dark:text-stone-100">
            <dt>Net collected after</dt>
            <dd>{fmt(netAfterInPaise)}</dd>
          </div>
        </dl>

        {isWholeRemaining ? (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            This covers the entire remaining payment, so it will be processed as a full refund: the
            order is marked refunded and all stock is restored.
          </p>
        ) : null}
        {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
        {done ? <p className="text-xs font-medium text-emerald-800">{done}</p> : null}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={thisRefundInPaise <= 0 || submitting}
            onClick={() => setConfirming(true)}
            className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
              isWholeRemaining ? "bg-red-700" : "bg-[#1c352a]"
            }`}
          >
            {isWholeRemaining
              ? `Refund ${fmt(thisRefundInPaise)} — full refund`
              : `Refund ${fmt(thisRefundInPaise)} to customer`}
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900">
            <p className="text-base font-bold text-[#1c352a] dark:text-stone-100">
              {isWholeRemaining ? "Confirm full refund" : "Confirm refund"}
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-stone-700 dark:text-stone-200">
              <li>
                Refund amount: <span className="font-semibold">{fmt(thisRefundInPaise)}</span>
              </li>
              {selected.map((l) => (
                <li key={l.orderItemId}>
                  {l.name}: {quantities[l.orderItemId]} of {l.qtyOrdered} unit(s)
                </li>
              ))}
              <li>
                Shipping:{" "}
                {isWholeRemaining
                  ? "included in the full refund"
                  : refundShipping
                    ? `refunding ${fmt(shippingRefundInPaise)}`
                    : "not refunded"}
              </li>
              <li>
                Inventory:{" "}
                {isWholeRemaining
                  ? "all units returned to sellable stock"
                  : restock && options.restockAvailable
                    ? `${totalUnits} unit(s) — ${DISPOSITION_LABEL[disposition].toLowerCase()}`
                    : "stock unchanged"}
              </li>
              <li>
                Net collected after: <span className="font-semibold">{fmt(netAfterInPaise)}</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-stone-500">
              {isWholeRemaining
                ? "The order will be marked Refunded."
                : "The remaining units stay sold. This does not cancel the order."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {submitting ? "Refunding…" : `Refund ${fmt(thisRefundInPaise)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
