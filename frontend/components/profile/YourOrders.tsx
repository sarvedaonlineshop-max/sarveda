"use client";

import { useEffect, useState } from "react";

import { OrderHistoryCard } from "@/components/orders/OrderHistoryCard";
import { fetchMyOrders, type OrderSummary } from "@/lib/orders-api";

type Props = {
  accountEmail: string;
};

export function YourOrders({ accountEmail }: Props) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyOrders()
      .then((rows) => {
        if (!cancelled) {
          setOrders(rows);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load orders");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <p className="text-sm text-stone-600">
        {orders.length} order{orders.length === 1 ? "" : "s"}
      </p>
      {orders.map((order) => (
        <OrderHistoryCard key={order.orderNumber} order={order} accountEmail={accountEmail} />
      ))}
    </div>
  );
}
