"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchLegacyOrderDetail } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

export default function AdminOldOrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setOrder(await fetchLegacyOrderDetail(params.id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [params.id]);

  if (err) {
    return (
      <div style={{ padding: "24px", color: "#991b1b" }}>
        {err}{" "}
        <Link href="/admin/old-orders" style={{ color: "#1c352a" }}>
          ← Back
        </Link>
      </div>
    );
  }

  if (!order) return <div style={{ padding: "24px" }}>Loading…</div>;

  const items = (order.items as Array<Record<string, unknown>>) ?? [];
  const payments = (order.payments as Array<Record<string, unknown>>) ?? [];
  const currency = String(order.currency ?? "INR");
  const grandTotal = Number(order.grandTotalInPaise ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "960px" }}>
      <Link href="/admin/old-orders" style={{ fontSize: "13px", color: "#1c352a" }}>
        ← Old Orders
      </Link>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e8e2d9",
          padding: "24px"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", color: "#1c352a" }}>
          {String(order.orderNumber ?? order.externalOrderId ?? "Archived order")}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#8a7060" }}>
          {String(order.source)}
          {order.channelCode ? ` · ${String(order.channelCode)}` : ""} ·{" "}
          {order.orderDate ? new Date(String(order.orderDate)).toLocaleString("en-IN") : ""}
        </p>

        <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <h2 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>
              Customer
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "14px" }}>{String(order.customerName ?? "—")}</p>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#8a7060" }}>{String(order.customerEmail ?? "")}</p>
            <p style={{ margin: "2px 0 0", fontSize: "13px" }}>{String(order.customerPhone ?? "")}</p>
          </div>
          <div>
            <h2 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>
              Payment
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "14px" }}>
              {String(order.paymentProvider ?? "—")} · {String(order.paymentStatus ?? order.status ?? "")}
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "18px", fontWeight: 700, color: "#1c352a" }}>
              {formatMinorFromPaise(grandTotal, currency)}
            </p>
          </div>
        </div>

        {order.shippingAddress ? (
          <div style={{ marginTop: "20px" }}>
            <h2 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>
              Shipping
            </h2>
            <pre
              style={{
                margin: "8px 0 0",
                fontSize: "12px",
                background: "#faf8f5",
                padding: "12px",
                borderRadius: "8px",
                overflow: "auto"
              }}
            >
              {JSON.stringify(order.shippingAddress, null, 2)}
            </pre>
          </div>
        ) : null}

        <div style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>
            Items
          </h2>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {items.map((item, i) => (
              <li
                key={i}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid #f0ece6",
                  fontSize: "13px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px"
                }}
              >
                <span>
                  {String(item.name ?? item.productNameSnapshot ?? item.sku ?? "Item")} × {Number(item.qty ?? item.quantity ?? 1)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {formatMinorFromPaise(Number(item.lineTotalInPaise ?? 0), currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {payments.length > 0 ? (
          <div style={{ marginTop: "24px" }}>
            <h2 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a7060" }}>
              Payment records
            </h2>
            <pre
              style={{
                margin: "8px 0 0",
                fontSize: "11px",
                background: "#faf8f5",
                padding: "12px",
                borderRadius: "8px",
                overflow: "auto",
                maxHeight: "240px"
              }}
            >
              {JSON.stringify(payments, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
