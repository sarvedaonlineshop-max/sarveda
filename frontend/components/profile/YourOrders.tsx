"use client";

import { useEffect, useMemo, useState } from "react";

import { OrderHistoryCard } from "@/components/orders/OrderHistoryCard";
import { isAbandonedCheckoutAttempt } from "@/lib/order-status-display";
import { fetchMyOrders, type OrderSummary } from "@/lib/orders-api";

type Props = {
  accountEmail: string;
  /** Fired once orders load, so the parent can show a live count. */
  onCount?: (count: number) => void;
};

type OrderFilter = "all" | "live" | "closed";

function isCustomerVisibleOrder(order: OrderSummary): boolean {
  return !isAbandonedCheckoutAttempt(
    order.status,
    order.paymentStatus,
    order.paymentProvider,
    order.isCod
  );
}

function classifyOrder(order: OrderSummary): "live" | "closed" {
  return order.status === "CANCELLED" || order.status === "REFUNDED" ? "closed" : "live";
}

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live & delivered" },
  { key: "closed", label: "Cancelled & refunded" }
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
    const c = { all: orders.length, live: 0, closed: 0 };
    for (const order of orders) c[classifyOrder(order)] += 1;
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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-all ${
                active
                  ? "bg-brand-forest text-brand-cream shadow-sm"
                  : "border border-brand-cream-dark bg-white text-brand-ink hover:-translate-y-0.5 hover:bg-brand-forest/5 hover:shadow-sm"
              }`}
            >
              {label}
              <span
                className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
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
          No orders in this section yet.
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
