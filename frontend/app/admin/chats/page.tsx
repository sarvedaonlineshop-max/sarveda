"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  fetchAdminEnquiries,
  startAdminWhatsAppChat,
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

/** Common dial codes for Sarveda’s India + international customers. */
const COUNTRY_DIAL_OPTIONS: Array<{ dial: string; label: string }> = [
  { dial: "91", label: "India (+91)" },
  { dial: "1", label: "USA / Canada (+1)" },
  { dial: "44", label: "United Kingdom (+44)" },
  { dial: "971", label: "UAE (+971)" },
  { dial: "61", label: "Australia (+61)" },
  { dial: "65", label: "Singapore (+65)" },
  { dial: "49", label: "Germany (+49)" },
  { dial: "33", label: "France (+33)" },
  { dial: "81", label: "Japan (+81)" },
  { dial: "94", label: "Sri Lanka (+94)" },
  { dial: "977", label: "Nepal (+977)" }
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
  const router = useRouter();
  const [items, setItems] = useState<EnquiryThreadListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [startOpen, setStartOpen] = useState(false);
  const [dialCode, setDialCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [sendOutreach, setSendOutreach] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

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

  function resetStartForm() {
    setDialCode("91");
    setPhone("");
    setCustomerName("");
    setFirstMessage("");
    setSendOutreach(true);
    setStartError(null);
  }

  async function handleStartChat(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setStartError(null);
    try {
      const result = await startAdminWhatsAppChat({
        countryDialCode: dialCode,
        phone: phone.trim(),
        customerName: customerName.trim() || undefined,
        message: firstMessage.trim() || undefined,
        sendOutreachTemplate: sendOutreach
      });
      setStartOpen(false);
      resetStartForm();
      if (result.warning) {
        window.alert(result.warning);
      } else if (result.outreachSent) {
        window.alert("Outreach template sent. Free chat unlocks after they reply.");
      }
      router.push(`/admin/chats/${result.threadId}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start chat");
    } finally {
      setStarting(false);
    }
  }

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetStartForm();
              setStartOpen(true);
            }}
            className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-amber-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            Start new chat
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
          >
            Refresh
          </button>
        </div>
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

      {startOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-chat-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget && !starting) {
              setStartOpen(false);
            }
          }}
        >
          <form
            onSubmit={(e) => void handleStartChat(e)}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-900"
          >
            <h2
              id="start-chat-title"
              className="text-lg font-semibold text-stone-900 dark:text-stone-50"
            >
              Start new WhatsApp chat
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Opens a WhatsApp conversation. For a new number, keep “Send outreach template”
              on — that uses your approved Meta template (works outside the 24-hour window).
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="start-chat-country"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Country code
                </label>
                <select
                  id="start-chat-country"
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                >
                  {COUNTRY_DIAL_OPTIONS.map((c) => (
                    <option key={c.dial} value={c.dial}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="start-chat-phone"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Mobile number
                </label>
                <div className="mt-1 flex overflow-hidden rounded-lg border border-stone-300 dark:border-stone-600">
                  <span className="flex items-center bg-stone-100 px-3 text-sm font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    +{dialCode}
                  </span>
                  <input
                    id="start-chat-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    required
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                    className="min-w-0 flex-1 bg-white px-3 py-2 text-sm outline-none dark:bg-stone-950"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="start-chat-name"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Customer name <span className="font-normal normal-case">(used in template)</span>
                </label>
                <input
                  id="start-chat-name"
                  type="text"
                  maxLength={120}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Partha"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-950">
                <input
                  type="checkbox"
                  checked={sendOutreach}
                  onChange={(e) => setSendOutreach(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold text-stone-800 dark:text-stone-100">
                    Send outreach template
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    Sends <code className="text-[11px]">admin_support_outreach</code> now
                    (Marketing). Required to message a number that has not written to you yet.
                  </span>
                </span>
              </label>

              <div>
                <label
                  htmlFor="start-chat-message"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                >
                  Extra free-form message{" "}
                  <span className="font-normal normal-case">(only if 24h window is open)</span>
                </label>
                <textarea
                  id="start-chat-message"
                  rows={3}
                  maxLength={4096}
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="Optional — only delivers if they already messaged you recently"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </div>
            </div>

            {startError ? <p className="mt-3 text-sm text-red-600">{startError}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={starting}
                onClick={() => setStartOpen(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={starting || !phone.trim()}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-50 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                {starting ? "Opening…" : "Open chat"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
