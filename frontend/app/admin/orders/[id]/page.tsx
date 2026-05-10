"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminOrderDetail,
  fetchAdminOrderInvoice,
  patchAdminOrderStatus
} from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

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

type OrderLoaded = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  grandTotalInPaise: number;
  subtotalInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  discountInPaise: number;
  createdAt: string;
  items: OrderItemRow[];
  addresses: AddressRow[];
};

function asOrder(raw: Record<string, unknown>): OrderLoaded {
  const items = (raw.items as OrderItemRow[]) ?? [];
  const addresses = (raw.addresses as AddressRow[]) ?? [];
  return {
    id: String(raw.id),
    orderNumber: String(raw.orderNumber),
    email: String(raw.email),
    phone: String(raw.phone),
    status: String(raw.status),
    paymentStatus: String(raw.paymentStatus),
    grandTotalInPaise: Number(raw.grandTotalInPaise),
    subtotalInPaise: Number(raw.subtotalInPaise),
    shippingInPaise: Number(raw.shippingInPaise),
    taxInPaise: Number(raw.taxInPaise),
    discountInPaise: Number(raw.discountInPaise ?? 0),
    createdAt: String(raw.createdAt),
    items,
    addresses
  };
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderLoaded | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [invoice, setInvoice] = useState<{ pdfUrl: string | null; invoiceNo: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const raw = (await fetchAdminOrderDetail(id)) as Record<string, unknown>;
      setOrder(asOrder(raw));
      const inv = await fetchAdminOrderInvoice(id);
      setInvoice(inv);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load order");
      setOrder(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusChange(nextStatus: string) {
    if (!id || !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) return;
    setStatusSaving(true);
    try {
      await patchAdminOrderStatus(id, nextStatus);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setStatusSaving(false);
    }
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

  return (
    <div className="space-y-8">
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
                onChange={(e) => void handleStatusChange(e.target.value)}
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
              Payment: {order.paymentStatus.replace(/_/g, " ")}
            </p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Totals</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Subtotal</dt>
              <dd>{formatINRFromPaise(order.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Shipping</dt>
              <dd>{formatINRFromPaise(order.shippingInPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Tax</dt>
              <dd>{formatINRFromPaise(order.taxInPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Discount</dt>
              <dd>{formatINRFromPaise(order.discountInPaise)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 font-semibold dark:border-stone-700">
              <dt>Grand total</dt>
              <dd>{formatINRFromPaise(order.grandTotalInPaise)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            Created {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Addresses</h2>
          {order.addresses.map((a) => (
            <div
              key={`${a.type}-${a.fullName}`}
              className="rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                {a.type}
              </p>
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
                  <td className="px-4 py-3">{formatINRFromPaise(item.unitPriceInPaise)}</td>
                  <td className="px-4 py-3">{formatINRFromPaise(item.lineTotalInPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
