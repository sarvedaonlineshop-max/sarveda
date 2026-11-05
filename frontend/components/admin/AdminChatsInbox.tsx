"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Filter, MessageSquarePlus, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import {
  fetchAdminEnquiries,
  startAdminWhatsAppChat,
  type EnquiryThreadListItem
} from "@/lib/admin-api";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import { SarvedaSignatureLoader } from "@/components/brand/SarvedaSignatureLoader";
import { ENQUIRY_SOURCE_LABELS, type EnquirySource } from "@/lib/enquiry-subjects";
import { whatsAppPreviewLabel } from "@/lib/whatsapp-message-body";
import {
  CHAT_CATEGORIES,
  CHAT_CATEGORY_COLORS,
  CHAT_PIPELINE_COLORS,
  CHAT_PIPELINE_STATUSES,
  chatCategoryLabel,
  chatPipelineShort,
  normalizeChatPipeline,
  ownerTagColor,
  type ChatCategory
} from "@/lib/chat-pipeline";

const LEAD_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ONGOING", label: "Ongoing" },
  { value: "QUOTATION_SENT", label: "Quotation" },
  { value: "FOLLOWUP", label: "Follow Up" },
  { value: "COMPLETED", label: "Completed" },
  { value: "NOT_INTERESTED", label: "Not Interested" },
  { value: "UNQUALIFIED", label: "Unqualified" }
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
export const ADMIN_CHATS_PATCH_EVENT = "sarveda-admin-chats-patch";
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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayDiff = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (dayDiff <= 0) {
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function previewText(thread: EnquiryThreadListItem) {
  const last = thread.messages[0];
  if (!last) return "—";
  const prefix = last.authorType === "ADMIN" ? "You: " : "";
  return `${prefix}${whatsAppPreviewLabel(last.body)}`.slice(0, 80);
}

export function AdminChatsInbox() {
  const router = useRouter();
  const nav = useAdminNavOptional();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/admin/chats/")
    ? pathname.split("/")[3] ?? null
    : null;

  const [items, setItems] = useState<EnquiryThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState("");
  const [filterMenu, setFilterMenu] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest">("recent");
  const [leadStatusCounts, setLeadStatusCounts] = useState<Record<string, number>>({ ALL: 0 });
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
  const [refreshing, setRefreshing] = useState(false);

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
        limit: 2000,
        q: debouncedQ || undefined
      });
      setItems(data.items);
      const next: Record<string, number> = { ALL: data.items.length };
      for (const status of CHAT_PIPELINE_STATUSES) next[status] = 0;
      for (const thread of data.items) {
        const status = normalizeChatPipeline(thread.crmPipeline);
        next[status] = (next[status] ?? 0) + 1;
      }
      setLeadStatusCounts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chats");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    const onPatch = (event: Event) => {
      const row = (event as CustomEvent<EnquiryThreadListItem>).detail;
      if (!row?.id) return;
      setItems((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                customerName: row.customerName || item.customerName,
                customerEmail: row.customerEmail ?? item.customerEmail,
                customerPhone: row.customerPhone ?? item.customerPhone,
                crmPipeline: row.crmPipeline ?? item.crmPipeline,
                crmCategory: row.crmCategory === undefined ? item.crmCategory : row.crmCategory,
                crmCategories: row.crmCategories ?? item.crmCategories,
                crmOwner: row.crmOwner === undefined ? item.crmOwner : row.crmOwner,
                unreadByAdmin: typeof row.unreadByAdmin === "boolean" ? row.unreadByAdmin : item.unreadByAdmin,
                unreadCount: typeof row.unreadCount === "number" ? row.unreadCount : item.unreadCount
              }
            : item
        )
      );
    };
    window.addEventListener(ADMIN_CHATS_REFRESH_EVENT, onRefresh);
    window.addEventListener(ADMIN_CHATS_PATCH_EVENT, onPatch);
    const timer = setInterval(() => void load(), 45_000);
    return () => {
      window.removeEventListener(ADMIN_CHATS_REFRESH_EVENT, onRefresh);
      window.removeEventListener(ADMIN_CHATS_PATCH_EVENT, onPatch);
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

  useEffect(() => {
    if (!filterMenu) return;
    function onPointer(event: MouseEvent) {
      if (!filterMenuRef.current?.contains(event.target as Node)) setFilterMenu(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [filterMenu]);

  const filtered = useMemo(() => {
    const byStatus = leadStatus
      ? items.filter((t) => normalizeChatPipeline(t.crmPipeline) === leadStatus)
      : [...items];
    const byCategory = categoryFilter
      ? byStatus.filter((t) => {
          const cats = t.crmCategories?.length
            ? t.crmCategories
            : t.crmCategory
              ? [t.crmCategory]
              : [];
          return cats.includes(categoryFilter);
        })
      : byStatus;
    const needle = q.trim().toLowerCase();
    const tokens = needle.split(/\s+/).filter(Boolean);
    const needleDigits = needle.replace(/\D/g, "");
    const serverMatched = needle.length > 0 && needle === debouncedQ.trim().toLowerCase();
    const searched =
      !needle || serverMatched
        ? byCategory
        : byCategory.filter((t) => {
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
            return tokens.every((token) => hay.includes(token));
          });
    return [...searched].sort((a, b) => {
      const av = new Date(a.lastMessageAt ?? 0).getTime();
      const bv = new Date(b.lastMessageAt ?? 0).getTime();
      return sortBy === "oldest" ? av - bv : bv - av;
    });
  }, [items, q, debouncedQ, leadStatus, categoryFilter, sortBy]);

  const onListView = pathname === "/admin/chats" || pathname === "/admin/chats/";

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    try {
      await load();
    } finally {
      // Keep the Sarveda mark visible briefly so a fast refresh still feels intentional.
      const wait = Math.max(0, 700 - (Date.now() - started));
      window.setTimeout(() => setRefreshing(false), wait);
    }
  }

  useAdminPageHeader(
    () => ({
      title: "Chats",
      subtitle: undefined,
      actions: onListView ? (
        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] text-[#faf5ec]/90 hover:bg-white/10 disabled:opacity-60"
            title="Refresh"
            aria-label="Refresh chats"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      ) : undefined
    }),
    [onListView, refreshing, load]
  );

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
      const href = `/admin/chats/${result.threadId}${qs}`;
      nav?.beginNavigation(href);
      router.push(href);
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
                Sends Meta template <code className="text-[11px]">sarveda_support_followup</code>{" "}
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
    <div className="admin-chat-list-root relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="admin-chat-list-chrome shrink-0 bg-white px-3 pt-3 md:border-b md:border-[#e7edf3] md:py-3">
        {/* Desktop keeps the in-card title + actions; mobile moves them to the top nav. */}
        <div className="mb-3 hidden items-center justify-between gap-2 md:flex">
          <div>
            <h1 className="text-[17px] font-semibold text-[#1c352a]">Chats</h1>
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

        <div className="flex items-center gap-2">
          <div className="flex h-9 min-w-0 flex-1 items-center rounded-xl border border-[#e2e8f0] bg-white">
            <Search size={16} className="ml-3 shrink-0 text-[#94a3b8]" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone or message..."
              className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 text-[13px] leading-9 text-[#1c352a] shadow-none outline-none placeholder:text-[#94a3b8] focus:!border-0 focus:!shadow-none focus:!outline-none focus-visible:!border-0 focus-visible:!shadow-none focus-visible:!outline-none"
            />
            {q.trim() ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-stone-800"
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2.25} />
              </button>
            ) : (
              <span className="w-2 shrink-0" aria-hidden />
            )}
          </div>
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              aria-label="Filter by lead status"
              aria-expanded={filterMenu}
              onClick={() => setFilterMenu((open) => !open)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-black ${
                leadStatus ? "border-black" : "border-[#e2e8f0]"
              }`}
            >
              <Filter size={16} strokeWidth={2.25} className="text-black" />
            </button>
            {filterMenu ? (
              <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[#e2e8f0] bg-white py-1 shadow-lg">
                {LEAD_STATUS_FILTERS.map((f) => {
                  const active = leadStatus === f.value;
                  const count = f.value === "" ? leadStatusCounts.ALL ?? 0 : leadStatusCounts[f.value] ?? 0;
                  return (
                    <button
                      key={f.value || "all"}
                      type="button"
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${
                        active ? "bg-[#f1f5f9] font-semibold text-[#1c352a]" : "text-[#334155] hover:bg-[#f8fafc]"
                      }`}
                      onClick={() => {
                        setLeadStatus(f.value);
                        setFilterMenu(false);
                      }}
                    >
                      <span>{f.label}</span>
                      <span className="text-[12px] text-[#64748b]">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="admin-mobile-pill-row flex flex-wrap gap-1.5 py-3.5 md:mt-2.5 md:py-0">
          {LEAD_STATUS_FILTERS.map((f) => {
            const active = leadStatus === f.value;
            const tone =
              f.value && f.value in CHAT_PIPELINE_COLORS
                ? CHAT_PIPELINE_COLORS[f.value as keyof typeof CHAT_PIPELINE_COLORS]
                : { bg: "#3d8b4f", text: "#ffffff" };
            const count = f.value === "" ? leadStatusCounts.ALL ?? 0 : leadStatusCounts[f.value] ?? 0;
            return (
              <button
                key={f.value || "all"}
                type="button"
                onClick={() => setLeadStatus(f.value)}
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition ${
                  active ? "ring-2 ring-offset-1 ring-[#1c352a]/40" : ""
                }`}
                style={{ background: tone.bg, color: tone.text }}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            aria-label="Category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="min-w-0 rounded-lg border border-[#d9d1c4] bg-white px-2 py-1.5 text-[12px] text-[#1c352a] outline-none"
          >
            <option value="">All categories</option>
            {CHAT_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value === "oldest" ? "oldest" : "recent")}
            className="min-w-0 rounded-lg border border-[#d9d1c4] bg-white px-2 py-1.5 text-[12px] text-[#1c352a] outline-none"
          >
            <option value="recent">Last message</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {error ? <p className="shrink-0 px-3 py-2 text-xs text-red-600">{error}</p> : null}

      <div className="admin-chat-list-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24 md:pb-0">
        {refreshing ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-[#f0ebe3]/75 backdrop-blur-[1px] md:hidden"
            role="status"
            aria-live="polite"
            aria-label="Refreshing chats"
          >
            <SarvedaSignatureLoader label="Refreshing…" />
          </div>
        ) : null}
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
              const selected = activeId === thread.id;
              const pipeline = normalizeChatPipeline(thread.crmPipeline);
              const tone = CHAT_PIPELINE_COLORS[pipeline];
              const ownerName =
                thread.crmOwner?.name?.trim() ||
                thread.crmOwner?.email?.split("@")[0] ||
                null;
              const cats = (thread.crmCategories?.length
                ? thread.crmCategories
                : thread.crmCategory
                  ? [thread.crmCategory]
                  : []) as ChatCategory[];
              return (
                <li key={thread.id} className="border-b border-[#eef2f6]">
                  <Link
                    href={`/admin/chats/${thread.id}`}
                    className={`flex min-w-0 gap-2.5 px-3 py-3 font-sans transition ${
                      selected ? "bg-[#e8f3ff]" : "bg-white hover:bg-[#f8fafc]"
                    }`}
                    style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
                  >
                    <span
                      className="my-1 w-1 shrink-0 self-stretch rounded-full"
                      style={{ background: tone.bg }}
                      aria-hidden
                    />
                    <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2">
                      <span
                        className="row-span-2 flex items-center justify-center self-stretch rounded-lg px-2 text-[11px] font-bold uppercase leading-none tracking-wide"
                        style={{ background: tone.bg, color: tone.text, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
                      >
                        {chatPipelineShort(pipeline)}
                      </span>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-5 text-[#1f2937]">
                          {thread.customerName}
                        </span>
                        <time className="shrink-0 text-[11px] font-normal leading-5 text-[#b0b8c4]">
                          {formatWhen(thread.lastMessageAt)}
                        </time>
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-normal leading-5 text-[#8b95a3]">
                          {previewText(thread)}
                        </span>
                        {(thread.unreadCount ?? 0) > 0 ? (
                          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold leading-none text-white">
                            {(thread.unreadCount ?? 0) > 99 ? "99+" : thread.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      {cats.length > 0 || ownerName ? (
                        <div className="col-start-2 mt-2 flex min-w-0 items-center gap-1.5">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {cats.map((cat) => (
                              <span
                                key={cat}
                                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                                style={{ background: CHAT_CATEGORY_COLORS[cat] ?? "#57534e" }}
                              >
                                {chatCategoryLabel(cat)}
                              </span>
                            ))}
                          </div>
                          {ownerName ? (
                            <span
                              className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                color: ownerTagColor(thread.crmOwner?.id || ownerName),
                                border: `1px solid ${ownerTagColor(thread.crmOwner?.id || ownerName)}`
                              }}
                            >
                              {ownerName}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Mobile FAB — fixed to the list viewport, not the scroll content */}
      {onListView ? (
        <button
          type="button"
          onClick={() => {
            resetStartForm();
            setStartOpen(true);
          }}
          className="admin-chat-fab absolute bottom-5 right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_4px_14px_rgba(18,140,126,0.45)] md:hidden"
          style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
          title="Start new chat"
          aria-label="Start new chat"
        >
          <MessageSquarePlus size={26} strokeWidth={2} />
        </button>
      ) : null}

      {startModal}
    </div>
  );
}
