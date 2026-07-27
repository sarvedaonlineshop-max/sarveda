"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  fetchAdminEnquiries,
  type EnquiryThreadListItem
} from "@/lib/admin-api";
import { ENQUIRY_SOURCE_LABELS, type EnquirySource } from "@/lib/enquiry-subjects";

const SOURCE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "CONTACT", label: "Contact" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "COURSE", label: "Course" },
  { value: "EVENT", label: "Event" },
  { value: "INSIGHTS", label: "Insights" }
];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function previewText(thread: EnquiryThreadListItem) {
  const last = thread.messages[0];
  if (!last) return "—";
  const prefix = last.authorType === "ADMIN" ? "You: " : "";
  return `${prefix}${last.body}`.slice(0, 120);
}

export default function AdminChatsPage() {
  const [items, setItems] = useState<EnquiryThreadListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminEnquiries({
        page: 1,
        unreadOnly,
        source: source || undefined
      });
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chats");
    } finally {
      setLoading(false);
    }
  }, [source, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-stone-900 dark:text-stone-100">Chats</h1>
          <p className="mt-1 text-sm text-stone-500">
            Customer enquiries from contact, corporate, courses, events, and insights.
            {unreadCount > 0 ? (
              <span className="ml-2 font-semibold text-amber-700">{unreadCount} unread</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setSource(f.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              source === f.value
                ? "border-stone-900 bg-stone-900 text-amber-50 dark:border-stone-200 dark:bg-stone-100 dark:text-stone-900"
                : "border-stone-300 text-stone-600 dark:border-stone-600"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            unreadOnly
              ? "border-amber-600 bg-amber-50 text-amber-900"
              : "border-stone-300 text-stone-600 dark:border-stone-600"
          }`}
        >
          Unread only
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        {loading ? (
          <p className="p-8 text-center text-sm text-stone-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-stone-500">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {items.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/admin/chats/${thread.id}`}
                  className={`flex gap-4 px-4 py-4 transition hover:bg-stone-50 dark:hover:bg-stone-800/50 ${
                    thread.unreadByAdmin ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {thread.unreadByAdmin ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      ) : null}
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {thread.customerName}
                      </span>
                      <span className="text-xs text-stone-500">
                        {thread.source === "WHATSAPP"
                          ? thread.customerPhone ?? ""
                          : thread.customerEmail}
                      </span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        {ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-stone-600 dark:text-stone-400">
                      {previewText(thread)}
                    </p>
                    {thread.orderNumber ? (
                      <p className="mt-1 font-mono text-xs text-stone-500">Order {thread.orderNumber}</p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-xs text-stone-400">{formatWhen(thread.lastMessageAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
