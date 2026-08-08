"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquarePlus, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

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

export const ADMIN_CHATS_REFRESH_EVENT = "sarveda-admin-chats-refresh";
export const ADMIN_CHATS_START_EVENT = "sarveda-admin-chats-start";

export type AdminChatsStartDetail = {
  phone?: string | null;
  customerName?: string | null;
};

/** Split E.164 / raw phone into dial code + national digits for the start-chat form. */
export function splitPhoneForStartForm(raw: string | null | undefined): {
  dial: string;
  national: string;
} {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return { dial: "91", national: "" };
  const dials = COUNTRY_DIAL_OPTIONS.map((c) => c.dial).sort((a, b) => b.length - a.length);
  for (const dial of dials) {
    if (digits.startsWith(dial) && digits.length > dial.length) {
      return { dial, national: digits.slice(dial.length) };
    }
  }
  if (digits.length === 10) return { dial: "91", national: digits };
  return { dial: "91", national: digits };
}

export function openAdminStartWhatsAppChat(detail: AdminChatsStartDetail = {}) {
  window.dispatchEvent(new CustomEvent(ADMIN_CHATS_START_EVENT, { detail }));
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("en-IN", { day: "numeric", month: "short" });
}

function previewText(thread: EnquiryThreadListItem) {
  const last = thread.messages[0];
  if (!last) return "—";
  const prefix = last.authorType === "ADMIN" ? "You: " : "";
  return `${prefix}${last.body}`.slice(0, 80);
}

export function AdminChatsInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/admin/chats/")
    ? pathname.split("/")[3] ?? null
    : null;

  const [items, setItems] = useState<EnquiryThreadListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [startOpen, setStartOpen] = useState(false);
  const [dialCode, setDialCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminEnquiries({
        page: 1,
        limit: 100,
        unreadOnly,
        source: source || undefined,
        q: debouncedQ || undefined
      });
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chats");
    } finally {
      setLoading(false);
    }
  }, [source, unreadOnly, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(ADMIN_CHATS_REFRESH_EVENT, onRefresh);
    const timer = setInterval(() => void load(), 45_000);
    return () => {
      window.removeEventListener(ADMIN_CHATS_REFRESH_EVENT, onRefresh);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    const onStart = (ev: Event) => {
      const detail = (ev as CustomEvent<AdminChatsStartDetail>).detail ?? {};
      const split = splitPhoneForStartForm(detail.phone);
      setDialCode(split.dial);
      setPhone(split.national);
      setCustomerName((detail.customerName ?? "").trim());
      setFirstMessage("");
      setStartError(null);
      setStartOpen(true);
    };
    window.addEventListener(ADMIN_CHATS_START_EVENT, onStart);
    return () => window.removeEventListener(ADMIN_CHATS_START_EVENT, onStart);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    const needleDigits = needle.replace(/\D/g, "");
    return items.filter((t) => {
      const phoneDigits = (t.customerPhone ?? "").replace(/\D/g, "");
      const waDigits = (t.waPhone ?? "").replace(/\D/g, "");
      if (
        needleDigits.length >= 3 &&
        (phoneDigits.includes(needleDigits) || waDigits.includes(needleDigits))
      ) {
        return true;
      }
      const hay = [
        t.customerName,
        t.customerEmail,
        t.customerPhone,
        t.waPhone,
        t.orderNumber,
        t.contextTitle,
        previewText(t),
        ENQUIRY_SOURCE_LABELS[t.source as EnquirySource] ?? t.source
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q]);

  function resetStartForm() {
    setDialCode("91");
    setPhone("");
    setCustomerName("");
    setFirstMessage("");
    setStartError(null);
  }

  async function handleStartChat(e: FormEvent) {
    e.preventDefault();
    if (!firstMessage.trim()) {
      setStartError("Message is required");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const result = await startAdminWhatsAppChat({
        countryDialCode: dialCode,
        phone: phone.trim(),
        customerName: customerName.trim() || undefined,
        message: firstMessage.trim()
      });
      setStartOpen(false);
      resetStartForm();
      const qs = result.outreachSent
        ? "?notice=outreach"
        : result.warning
          ? `?notice=${encodeURIComponent(result.warning.slice(0, 120))}`
          : "";
      await load();
      router.push(`/admin/chats/${result.threadId}${qs}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Could not start chat");
    } finally {
      setStarting(false);
    }
  }

  const startModal =
    startOpen && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-chat-title"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget && !starting) setStartOpen(false);
            }}
          >
            <form
              onSubmit={(e) => void handleStartChat(e)}
              className="w-full max-w-md overflow-hidden rounded-xl border border-stone-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="start-chat-title" className="text-lg font-semibold text-stone-900">
                  Start new WhatsApp chat
                </h2>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => setStartOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} strokeWidth={2.25} />
                </button>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Sends Meta template <code className="text-[11px]">sarveda_support_outreach</code>{" "}
                (name + your message).
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
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
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
                  <div className="mt-1 flex overflow-hidden rounded-lg border border-stone-300">
                    <span className="flex items-center bg-stone-100 px-3 text-sm font-medium text-stone-600">
                      +{dialCode}
                    </span>
                    <input
                      id="start-chat-phone"
                      type="tel"
                      inputMode="numeric"
                      required
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                      className="min-w-0 flex-1 bg-white px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="start-chat-name"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                  >
                    Customer name
                  </label>
                  <input
                    id="start-chat-name"
                    type="text"
                    maxLength={120}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Partha"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="start-chat-message"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500"
                  >
                    Message
                  </label>
                  <textarea
                    id="start-chat-message"
                    rows={3}
                    required
                    maxLength={1024}
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    placeholder="enter your message here"
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {startError ? <p className="mt-3 text-sm text-red-600">{startError}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => setStartOpen(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={starting || !phone.trim() || !firstMessage.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #b98a3e, #c8960a)" }}
                >
                  {starting ? "Sending…" : "Send & open chat"}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f0ebe3]">
      <div className="shrink-0 border-b border-[#d9d1c4] bg-[#efe8dc] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[17px] font-semibold text-[#1c352a]">Chats</h1>
            {unreadCount > 0 ? (
              <p className="text-[11px] font-medium text-[#b98a3e]">{unreadCount} unread</p>
            ) : (
              <p className="text-[11px] text-stone-500">Customer enquiries</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-[#1c352a]"
              title="Refresh"
              aria-label="Refresh chats"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => {
                resetStartForm();
                setStartOpen(true);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#1c352a] hover:bg-black/5"
              title="Start new chat"
              aria-label="Start new chat"
            >
              <MessageSquarePlus size={18} />
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or start a new chat"
            className="w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm text-stone-800 outline-none ring-1 ring-[#d9d1c4] focus:ring-[#25d366]"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map((f) => {
            const active = source === f.value;
            return (
              <button
                key={f.value || "all"}
                type="button"
                onClick={() => setSource(f.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  active
                    ? "bg-[#1c352a] text-[#faf5ec]"
                    : "bg-white text-stone-600 ring-1 ring-[#d9d1c4] hover:bg-[#faf5ec]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              unreadOnly
                ? "bg-[#b98a3e] text-white"
                : "bg-white text-stone-600 ring-1 ring-[#d9d1c4] hover:bg-[#faf5ec]"
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {error ? <p className="px-3 py-2 text-xs text-red-600">{error}</p> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="p-6 text-center text-sm text-stone-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-stone-600">No conversations</p>
            <p className="mt-1 text-xs text-stone-400">Start a WhatsApp chat or wait for enquiries</p>
          </div>
        ) : (
          <ul>
            {filtered.map((thread) => {
              const initial = (thread.customerName?.trim()?.[0] || "?").toUpperCase();
              const isWa = thread.source === "WHATSAPP";
              const selected = activeId === thread.id;
              return (
                <li key={thread.id}>
                  <Link
                    href={`/admin/chats/${thread.id}`}
                    className={`flex gap-3 border-b border-[#e8e2d9] px-3 py-3 transition ${
                      selected ? "bg-[#e7e0d4]" : "hover:bg-[#e9e3d8]/80"
                    } ${thread.unreadByAdmin && !selected ? "bg-[#faf6ee]" : ""}`}
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                      style={{
                        background: isWa
                          ? "linear-gradient(135deg, #128c7e, #25d366)"
                          : "linear-gradient(135deg, #1c352a, #2d5040)"
                      }}
                      aria-hidden
                    >
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-[15px] ${
                            thread.unreadByAdmin
                              ? "font-bold text-[#1c352a]"
                              : "font-semibold text-stone-800"
                          }`}
                        >
                          {thread.customerName}
                        </span>
                        <time className="shrink-0 text-[11px] text-stone-400">
                          {formatWhen(thread.lastMessageAt)}
                        </time>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`truncate text-[13px] ${
                            thread.unreadByAdmin
                              ? "font-medium text-stone-700"
                              : "text-stone-500"
                          }`}
                        >
                          {previewText(thread)}
                        </span>
                        {thread.unreadByAdmin ? (
                          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[#25d366]" />
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-stone-400">
                        {ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source}
                        {thread.orderNumber ? ` · ${thread.orderNumber}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {startModal}
    </div>
  );
}
