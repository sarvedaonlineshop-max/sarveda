"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatINRFromPaise } from "@/lib/money";
import { fetchMyOrders, orderInvoiceDownloadUrl, type OrderSummary } from "@/lib/orders-api";

function formatOrderDate(value: string | null): string {
  if (!value) return "Order placed";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function statusLabel(order: OrderSummary): string {
  if (order.paymentStatus === "CAPTURED" || order.status === "PAID") {
    return "Paid";
  }
  if (order.status === "CANCELLED") {
    return "Cancelled";
  }
  if (order.status === "PENDING_PAYMENT") {
    return "Payment pending";
  }
  return order.status.replaceAll("_", " ");
}

type Props = {
  email: string;
};

export function YourOrders({ email }: Props) {
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
      <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-5 text-sm text-stone-600">
        You have no orders yet. When you place one, it will appear here with invoice download.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const paid = order.paymentStatus === "CAPTURED" || order.status === "PAID";
        const confirmationHref = `/order/confirmed?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(email)}`;
        return (
          <article key={order.orderNumber} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900">{statusLabel(order)}</p>
                <p className="mt-1 line-clamp-2 text-sm text-stone-700">{order.headline}</p>
                <p className="mt-1 text-xs text-stone-500">
                  {formatOrderDate(order.placedAt ?? order.createdAt)} · {order.itemCount} item
                  {order.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-stone-900">
                {formatINRFromPaise(order.grandTotalInPaise)}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={confirmationHref}
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-stone-300 px-4 text-sm font-medium text-stone-800"
              >
                View order
              </Link>
              {paid ? (
                <a
                  href={orderInvoiceDownloadUrl(order.orderNumber, email)}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-amber-400"
                >
                  Download GST invoice
                </a>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
