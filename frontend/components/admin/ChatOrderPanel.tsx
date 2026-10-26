"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdminOrders, fetchAdminShipments } from "@/lib/admin-api";
import { getApiBase } from "@/lib/api";

type Props = {
  orderNumber?: string | null;
  customerEmail?: string | null;
};

const DELIVERY_STEPS = [
  ["AWAITING_DISPATCH", "Awaiting Dispatch"],
  ["PACKING", "Packing"],
  ["DISPATCHED", "Dispatched"],
  ["IN_TRANSIT", "In Transit"],
  ["DELIVERED", "Delivered"]
] as const;

function rupees(paise?: number | null) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(
    (paise ?? 0) / 100
  );
}

function mapOrderStatus(status?: string | null, shipment?: string | null): (typeof DELIVERY_STEPS)[number][0] {
  const ship = (shipment ?? "").toUpperCase();
  if (ship === "DELIVERED" || status === "DELIVERED") return "DELIVERED";
  if (ship === "INTRANSIT" || ship === "OUT_FOR_DELIVERY") return "IN_TRANSIT";
  if (ship === "PICKED" || status === "SHIPPED") return "DISPATCHED";
  if (status === "PACKED") return "PACKING";
  return "AWAITING_DISPATCH";
}

function stepIndex(current: string) {
  return Math.max(0, DELIVERY_STEPS.findIndex(([id]) => id === current));
}

export function ChatOrderPanel({ orderNumber, customerEmail }: Props) {
  const [order, setOrder] = useState<Awaited<ReturnType<typeof fetchAdminOrders>>["items"][number] | null>(null);
  const [shipment, setShipment] = useState<Awaited<ReturnType<typeof fetchAdminShipments>>["items"][number] | null>(
    null
  );
  const [returnCase, setReturnCase] = useState<{ caseNumber?: string; stageLabel?: string; reason?: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const orders = await fetchAdminOrders({
          channel: "all",
          bucket: "all",
          page: 1,
          limit: 1,
          orderNumber: orderNumber || undefined,
          customerName: !orderNumber && customerEmail ? customerEmail : undefined
        });
        const hit =
          orders.items.find((row) => row.orderNumber === orderNumber) ??
          orders.items[0] ??
          null;
        if (cancelled) return;
        setOrder(hit);
        if (!hit) {
          setShipment(null);
          setReturnCase(null);
          return;
        }
        const ships = await fetchAdminShipments({
          page: 1,
          limit: 5,
          orderNumber: hit.orderNumber
        });
        if (cancelled) return;
        setShipment(ships.items.find((row) => row.orderNumber === hit.orderNumber) ?? ships.items[0] ?? null);
        const res = await fetch(
          `${getApiBase()}/api/admin/return-cases?orderNumber=${encodeURIComponent(hit.orderNumber)}&limit=1`,
          { credentials: "include" }
        );
        if (res.ok) {
          const json = (await res.json()) as { data?: { items?: Array<Record<string, string>> }; items?: Array<Record<string, string>> };
          const item = json.data?.items?.[0] ?? json.items?.[0] ?? null;
          if (!cancelled && item) {
            setReturnCase({
              caseNumber: item.caseNumber || item.number,
              stageLabel: item.stageLabel || item.status || item.stage,
              reason: item.reason || item.customerReason
            });
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load order");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, customerEmail]);

  if (error) return <p className="text-[12px] text-red-700">{error}</p>;
  if (!order) {
    return (
      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Order</p>
        <p className="mt-2 text-[12px] text-[#4a6b58]">No confirmed order yet. It will appear here after payment.</p>
      </section>
    );
  }

  const current = mapOrderStatus(order.status, shipment?.shipmentStatus ?? order.shipmentStatuses?.at(-1));
  const active = stepIndex(current);
  const delivered = current === "DELIVERED";
  const feedbackDue = delivered
    ? "Scheduled 2 days after delivery"
    : "Sends automatically 2 days after delivery";

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4a6b58]">Order details</p>
            <p className="mt-1 text-[15px] font-semibold">#{order.orderNumber}</p>
          </div>
          <Link href={`/admin/orders?orderNumber=${encodeURIComponent(order.orderNumber)}`} className="text-[12px] font-semibold text-[#1d4e89]">
            View
          </Link>
        </div>
        <ul className="mt-2 space-y-1 text-[12px] text-[#1c352a]">
          {order.linePreview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] font-semibold">{rupees(order.grandTotalInPaise)}</p>
      </section>

      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Delivery & tracking</p>
        <p className="mt-1 text-[12px] text-[#4a6b58]">
          {shipment?.courier || "Courier pending"}
          {shipment?.awb ? ` · ${shipment.awb}` : ""}
        </p>
        <ol className="mt-3 space-y-2">
          {DELIVERY_STEPS.map(([id, label], index) => (
            <li key={id} className="flex items-center gap-2 text-[12px]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: index <= active ? "#16a34a" : "#d6d3d1" }}
              />
              <span className={index <= active ? "font-semibold text-[#1c352a]" : "text-[#78716c]"}>{label}</span>
            </li>
          ))}
        </ol>
        {shipment?.trackingUrl ? (
          <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-[#1d4e89]">
            Track shipment
          </a>
        ) : null}
      </section>

      {returnCase ? (
        <section className="rounded-xl border border-[#be185d]/20 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#be185d]">Return / refund</p>
              <p className="mt-1 text-[13px] font-semibold">{returnCase.caseNumber || "Open case"}</p>
            </div>
            {returnCase.caseNumber ? (
              <Link href={`/admin/returns/${encodeURIComponent(returnCase.caseNumber)}`} className="text-[12px] font-semibold text-[#1d4e89]">
                Full case
              </Link>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] text-[#4a6b58]">{returnCase.stageLabel || "Requested"}</p>
          {returnCase.reason ? <p className="mt-1 text-[12px]">{returnCase.reason}</p> : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Post-delivery feedback</p>
        <p className="mt-2 text-[12px] text-[#4a6b58]">{feedbackDue}</p>
        <p className="mt-1 text-[11px] text-[#78716c]">
          Rating, Google review link and negative-feedback tasks ship in the next slice.
        </p>
      </section>
    </div>
  );
}
