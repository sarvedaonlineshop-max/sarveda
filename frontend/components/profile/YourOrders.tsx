"use client";

import { useEffect, useMemo, useState } from "react";

import { OrderHistoryCard, orderIsPaid } from "@/components/orders/OrderHistoryCard";
import { isAbandonedCheckoutAttempt } from "@/lib/order-status-display";
import { fetchMyOrders, type OrderSummary } from "@/lib/orders-api";

type Props = {
  accountEmail: string;
  /** Fired once orders load, so the parent can show a live count. */
  onCount?: (count: number) => void;
};

type OrderFilter = "all" | "paid" | "cancelled" | "refunded";

function isCustomerVisibleOrder(order: OrderSummary): boolean {
  return !isAbandonedCheckoutAttempt(
    order.status,
    order.paymentStatus,
    order.paymentProvider,
    order.isCod
  );
}

/** Bucket an order using existing statuses only. Paid covers online + COD. */
function classifyOrder(order: OrderSummary): "paid" | "cancelled" | "refunded" | "other" {
  if (!isCustomerVisibleOrder(order)) return "other";
  if (order.status === "REFUNDED") return "refunded";
  if (order.status === "CANCELLED") return "cancelled";
  if (orderIsPaid(order)) return "paid";
  return "other";
}

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" }
];

export function YourOrders({ accountEmail, onCount }: Props) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>("all");

  useEffect(() => {
    let cancelled = false;
    void fetchMyOrders()
      .then((rows) => {
        if (!cancelled) {
          const visible = rows.filter(isCustomerVisibleOrder);
          setOrders(visible);
          setLoading(false);
          onCount?.(visible.length);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load orders");
          setLoading(false);
          onCount?.(0);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { all: orders.length, paid: 0, cancelled: 0, refunded: 0 };
    for (const order of orders) {
      const bucket = classifyOrder(order);
      if (bucket !== "other") c[bucket] += 1;
    }
    return c;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((order) => classifyOrder(order) === filter);
  }, [orders, filter]);

  if (loading) {
    return <p className="text-sm text-stone-500">Loading your orders…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!orders.length) {
    return (
      <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-6 text-sm text-stone-600">
        You have no orders yet. When you place one, it will appear here with invoice download.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Status sub-tabs ── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-brand-forest text-brand-cream"
                  : "border border-brand-cream-dark bg-white text-brand-ink hover:bg-brand-forest/5"
              }`}
            >
              {label}
              <span
                className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  active ? "bg-[#FAC775] text-[#633806]" : "bg-brand-cream text-brand-muted"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {visibleOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50 p-6 text-sm text-stone-600">
          No {filter} orders yet.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => (
            <OrderHistoryCard key={order.orderNumber} order={order} accountEmail={accountEmail} />
          ))}
        </div>
      )}
    </div>
  );
}
