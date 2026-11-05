"use client";

import { Calendar, ChevronDown, Clock, Download, Mail, MapPin, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getApiBase } from "@/lib/api";
import {
  createAdminEnquiryFollowUp,
  fetchAdminEnquiryFollowUps,
  type EnquiryFollowUpRow
} from "@/lib/admin-api";
import { ADMIN_CHATS_PATCH_EVENT, ADMIN_CHATS_REFRESH_EVENT } from "@/components/admin/AdminChatsInbox";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { canAssignChatOwner } from "@/lib/crm-team-access";
import { COUNTRIES } from "@/lib/countries";
import { crmApi, type CrmAssignee, type CrmChatPipeline, type CrmSalesQuote } from "@/lib/crm-api";
import { formatQuoteMoney } from "@/lib/quote-pricing";
import { ChatLeadPayment } from "@/components/admin/ChatLeadPayment";
import { ChatQuoteDialog } from "@/components/admin/ChatQuoteDialog";
import { ChatOrderPanel } from "@/components/admin/ChatOrderPanel";
import {
  CHAT_CATEGORIES,
  CHAT_CATEGORY_COLORS,
  CHAT_PIPELINE_MENU_LABELS,
  CHAT_PIPELINE_PILLS,
  CHAT_PIPELINE_STATUSES,
  chatCategoryLabel,
  defaultFollowUpLocalValue,
  detectCountryLabel,
  followUpLocalFromDate,
  formatFollowUpDate,
  formatFollowUpTime,
  joinFollowUpLocal,
  normalizeChatPipeline,
  ownerTagColor,
  splitFollowUpLocal,
  type ChatCategory
} from "@/lib/chat-pipeline";

type Props = {
  threadId: string;
  customerName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  orderNumber?: string | null;
  lastOwner?: { id: string; name: string } | null;
  refreshToken?: number;
  onShared?: () => void;
  onSharePayment?: (kind: "qr" | "details") => void;
};

const FOLLOW_UP_TIMES = Array.from({ length: 28 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const DETECTED_COUNTRY_NAME: Record<string, string> = {
  India: "India",
  USA: "United States",
  "United Kingdom": "United Kingdom",
  UAE: "United Arab Emirates"
};

function detectedCountryName(phone?: string | null) {
  const label = detectCountryLabel(phone);
  return label ? DETECTED_COUNTRY_NAME[label] ?? null : null;
}

function quotePill(quote: CrmSalesQuote) {
  if (quote.status === "SENT") return { label: "Sent", bg: "#dcfce7", color: "#166534" };
  if (quote.approvalStatus === "PENDING") return { label: "Waiting", bg: "#fef3c7", color: "#92400e" };
  if (quote.approvalStatus === "APPROVED") return { label: "Approved", bg: "#dcfce7", color: "#166534" };
  if (quote.approvalStatus === "REJECTED") return { label: "Rejected", bg: "#fee2e2", color: "#991b1b" };
  return { label: "Draft", bg: "#ffedd5", color: "#c2410c" };
}

function personName(person: { id: string; name?: string | null; email?: string | null }, selfId?: string | null) {
  if (selfId && person.id === selfId) return "you";
  return person.name?.trim() || person.email?.split("@")[0] || "them";
}

function notifySentence(
  people: Array<{ id: string; name?: string | null; email?: string | null }>,
  selfId: string | null | undefined,
  when: string
) {
  const labels = people.map((person) => personName(person, selfId));
  const unique = Array.from(new Set(labels));
  const ordered = unique.includes("you") ? ["you", ...unique.filter((label) => label !== "you")] : unique;
  let who = "You";
  if (ordered.length === 1) who = ordered[0] === "you" ? "You" : ordered[0];
  else if (ordered.length === 2) who = `${ordered[0] === "you" ? "You" : ordered[0]} and ${ordered[1]}`;
  else if (ordered.length > 2) {
    const head = ordered.slice(0, -1).map((label, index) => (index === 0 && label === "you" ? "You" : label));
    who = `${head.join(", ")} and ${ordered[ordered.length - 1]}`;
  }
  return `${who} will be notified on ${when}.`;
}

function WhatsAppMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fill="#25d366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10.1 10.1 0 0 0 4.65 1.12h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.88c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.63-.61-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.27.64-.39 1.02-.39.12 0 .23 0 .33.01.3.01.45-.05.7.53.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.37-.42.5-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.54.73 1.8.86.27.14.44.2.51.31.06.12.06.67-.18 1.35z"
      />
    </svg>
  );
}

export function ChatCrmRail({
  threadId,
  customerName,
  email,
  phone,
  lastOwner,
  refreshToken = 0,
  onShared,
  onSharePayment
}: Props) {
  const me = useAdminUser();
  const [tab, setTab] = useState<"lead" | "order">("lead");
  const [card, setCard] = useState<CrmChatPipeline | null>(null);
  const [followUps, setFollowUps] = useState<EnquiryFollowUpRow[]>([]);
  const [quotes, setQuotes] = useState<CrmSalesQuote[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [due, setDue] = useState(defaultFollowUpLocalValue);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const followDateRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editing, setEditing] = useState<CrmSalesQuote | null>(null);
  const [savedQuote, setSavedQuote] = useState(false);
  const [categoryMenu, setCategoryMenu] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [timeOpen, setTimeOpen] = useState(false);
  const [confirmFollowUp, setConfirmFollowUp] = useState(false);
  const [submitQuote, setSubmitQuote] = useState<CrmSalesQuote | null>(null);
  const [submitDone, setSubmitDone] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [countryMenu, setCountryMenu] = useState(false);

  const load = useCallback(async () => {
    const [row, ups, people] = await Promise.all([
      crmApi.chatPipeline(threadId),
      fetchAdminEnquiryFollowUps(threadId),
      crmApi.assignees()
    ]);
    setCard(row);
    setFollowUps(ups.items);
    setAssignees(people);
    const needle = email || phone || customerName;
    setQuotes(await crmApi.listSalesQuotes(needle && needle.length >= 3 ? needle : "", threadId));
    return row;
  }, [threadId, customerName, email, phone]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load, refreshToken]);

  useEffect(() => {
    const open = followUps
      .filter((row) => row.status === "OPEN")
      .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
    const next = open[0];
    if (!next) return;
    setDue(followUpLocalFromDate(next.dueAt));
  }, [followUps]);

  useEffect(() => {
    if (!pipelineOpen) return;
    function onPointer(event: MouseEvent) {
      if (!pipelineRef.current?.contains(event.target as Node)) setPipelineOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [pipelineOpen]);

  async function run(work: () => Promise<void>, options?: { refreshThread?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await work();
      const row = await load();
      if (row) {
        window.dispatchEvent(new CustomEvent(ADMIN_CHATS_PATCH_EVENT, { detail: row }));
      }
      window.dispatchEvent(new Event(ADMIN_CHATS_REFRESH_EVENT));
      if (options?.refreshThread) onShared?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const status = normalizeChatPipeline(card?.crmPipeline);
  const categories = (card?.crmCategories?.length ? card.crmCategories : card?.crmCategory ? [card.crmCategory] : []) as ChatCategory[];
  const owner = card?.crmOwner;
  const ownerName =
    owner?.name?.trim() ||
    owner?.email?.split("@")[0] ||
    lastOwner?.name?.trim() ||
    "Unassigned";
  const ownerColor = ownerTagColor(owner?.id || ownerName);
  const country = detectCountryLabel(phone || card?.waPhone);
  const visibleEmail =
    email && !email.includes("whatsapp.invalid") && !email.includes("instagram.invalid") ? email : null;
  const canAssign = canAssignChatOwner(me?.email);
  const ownerSelectColor = owner?.id ? ownerColor : "#1d4e89";
  const followParts = splitFollowUpLocal(due);
  const pipelinePill = CHAT_PIPELINE_PILLS[status];
  const detectedCountry = detectedCountryName(phone || card?.waPhone);
  const countryOptions = useMemo(() => {
    if (!detectedCountry) return COUNTRIES;
    const hit = COUNTRIES.find((row) => row.name === detectedCountry);
    if (!hit) return COUNTRIES;
    return [hit, ...COUNTRIES.filter((row) => row.code !== hit.code)];
  }, [detectedCountry]);
  const savedCountry = useMemo(() => {
    const text = card?.crmLocation?.trim() || "";
    const hit = COUNTRIES.find((row) => text === row.name || text.endsWith(`, ${row.name}`));
    return hit?.name || detectedCountry || "";
  }, [card?.crmLocation, detectedCountry]);
  function saveCountry(next: string) {
    if (!next || !customerName.trim()) return;
    const current = card?.crmLocation?.trim() || "";
    const previous = COUNTRIES.find((row) => current.endsWith(`, ${row.name}`));
    const city = previous ? current.slice(0, -(previous.name.length + 2)).trim() : "";
    const crmLocation = city ? `${city}, ${next}` : next;
    void run(
      () =>
        crmApi
          .setChatCustomer(threadId, {
            customerName: customerName.trim(),
            customerEmail: visibleEmail,
            customerPhone: phone,
            crmLocation
          })
          .then(() => undefined),
      { refreshThread: true }
    );
  }
  const notifyPeople = [
    ...(owner ? [owner] : []),
    ...(card?.crmCollaborators ?? []).filter((person) => person.id !== owner?.id)
  ];
  const followWhen = `${formatFollowUpDate(followParts.date)} at ${formatFollowUpTime(followParts.time || "10:00")}`;
  const followNotice = notifySentence(
    notifyPeople.length > 0 ? notifyPeople : me ? [{ id: me.id, name: me.name, email: me.email }] : [],
    me?.id,
    followWhen
  );
  async function downloadQuote(quote: CrmSalesQuote) {
    const res = await fetch(`${getApiBase()}/api/admin/crm/sales-quotes/${quote.id}/pdf`, {
      credentials: "include"
    });
    if (!res.ok) throw new Error("Could not download the quotation");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${quote.quoteNumber.replace(/\//g, "-")}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const confirmDialog =
    confirmFollowUp && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-confirm-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
              <h2 id="follow-up-confirm-title" className="text-[15px] font-semibold text-[#1e3a8a]">
                Follow-up
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-[#1c352a]">{followNotice}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#64748b]"
                  onClick={() => setConfirmFollowUp(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !me?.id}
                  className="rounded-lg bg-[#1f9d4a] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                  onClick={() =>
                    void run(async () => {
                      if (!me?.id || !followParts.date) return;
                      await createAdminEnquiryFollowUp(threadId, {
                        notes: "Follow-up",
                        dueAt: new Date(due).toISOString(),
                        assignedAdminId: owner?.id || me.id
                      });
                      setConfirmFollowUp(false);
                    })
                  }
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const submitDialog =
    submitQuote && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-submit-confirm-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
              <h2 id="quote-submit-confirm-title" className="text-[15px] font-semibold text-[#1e3a8a]">
                {submitDone ? "Submitted for approval" : "Submit for approval"}
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-[#1c352a]">
                {submitDone
                  ? `${submitQuote.quoteNumber} is waiting for Deepak or Arjun. The customer will not receive it until one of them approves it.`
                  : `Submit ${submitQuote.quoteNumber} for approval? It stays with you until Deepak or Arjun approves it.`}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                {submitDone ? (
                  <button
                    type="button"
                    className="rounded-lg bg-[#1d4e89] px-3 py-1.5 text-[13px] font-semibold text-white"
                    onClick={() => {
                      setSubmitQuote(null);
                      setSubmitDone(false);
                    }}
                  >
                    OK
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#64748b]"
                      onClick={() => setSubmitQuote(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg bg-[#1d4e89] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                      onClick={() =>
                        void run(async () => {
                          await crmApi.submitSalesQuote(submitQuote.id);
                          setSubmitDone(true);
                        })
                      }
                    >
                      Submit
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
    {confirmDialog}
    {submitDialog}
    <aside className="flex h-full min-h-0 w-[min(100vw,440px)] shrink-0 flex-col overflow-hidden border-l border-[#1c352a]/15 bg-[#f4eee4] text-[#1c352a] lg:w-[440px]">
      <div className="flex shrink-0 border-b border-[#e2e8f0] bg-white">
        {(["lead", "order"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`flex-1 border-b-2 px-3 py-2.5 text-[14px] font-semibold ${
              tab === item
                ? "border-[#16a34a] text-[#166534]"
                : "border-transparent text-[#94a3b8] hover:text-[#64748b]"
            }`}
          >
            {item === "lead" ? "Lead" : "Order"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? <p className="mb-2 text-[12px] text-red-700">{error}</p> : null}

        {tab === "order" ? (
          <ChatOrderPanel threadId={threadId} />
        ) : (
          <div className="space-y-3">
            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-[#1e3a8a]">Customer Details</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#d6dde6] bg-white px-2 py-1 text-[12px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
                  onClick={() => {
                    setDraftName(customerName);
                    setDraftPhone(phone ?? "");
                    setDraftEmail(visibleEmail ?? "");
                    setDraftLocation(card?.crmLocation?.trim() || country || "");
                    setEditingCustomer(true);
                  }}
                >
                  <Pencil size={13} />
                  Edit
                </button>
              </div>
              {editingCustomer ? (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="Name"
                    className="w-full rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[13px]"
                  />
                  <input
                    value={draftPhone}
                    onChange={(event) => setDraftPhone(event.target.value)}
                    placeholder="Phone"
                    className="w-full rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[13px]"
                  />
                  <input
                    value={draftEmail}
                    onChange={(event) => setDraftEmail(event.target.value)}
                    placeholder="Email"
                    className="w-full rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[13px]"
                  />
                  <select
                    aria-label="Country"
                    value={
                      COUNTRIES.find(
                        (row) => draftLocation === row.name || draftLocation.endsWith(`, ${row.name}`)
                      )?.name || ""
                    }
                    onChange={(event) => {
                      const next = event.target.value;
                      const current = draftLocation.trim();
                      const previous = COUNTRIES.find((row) => current.endsWith(`, ${row.name}`));
                      const city = previous
                        ? current.slice(0, -(previous.name.length + 2)).trim()
                        : COUNTRIES.some((row) => row.name === current)
                          ? ""
                          : current;
                      setDraftLocation(city && next ? `${city}, ${next}` : next);
                    }}
                    className="w-full rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-[13px]"
                  >
                    <option value="">Select country</option>
                    {countryOptions.map((row) => (
                      <option key={row.code} value={row.name}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#64748b]"
                      onClick={() => setEditingCustomer(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || !draftName.trim()}
                      className="rounded-lg bg-[#1c352a] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                      onClick={() =>
                        void run(
                          () =>
                            crmApi
                              .setChatCustomer(threadId, {
                                customerName: draftName.trim(),
                                customerEmail: draftEmail.trim() || null,
                                customerPhone: draftPhone.trim() || null,
                                crmLocation: draftLocation.trim() || null
                              })
                              .then(() => {
                                setEditingCustomer(false);
                              }),
                          { refreshThread: true }
                        )
                      }
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[15px] font-semibold text-[#1c352a]">{customerName}</p>
                  <div className="mt-3 space-y-3">
                  <p className="flex items-center gap-2.5 text-[13px] text-[#1c352a]">
                    <WhatsAppMark />
                    <span>{phone || "—"}</span>
                  </p>
                  <p className="flex items-center gap-2.5 text-[13px] text-[#334155]">
                    <Mail size={16} className="shrink-0 text-[#25d366]" aria-hidden />
                    <span className="min-w-0 truncate">{visibleEmail ?? "—"}</span>
                  </p>
                  <div className="flex items-center gap-2.5 text-[13px] text-[#334155]">
                    <MapPin size={16} className="shrink-0 text-[#25d366]" aria-hidden />
                    {savedCountry ? (
                      <select
                        aria-label="Country"
                        value={savedCountry}
                        disabled={busy}
                        onChange={(event) => saveCountry(event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-[13px] text-[#1c352a] outline-none"
                      >
                        {countryOptions.map((row) => (
                          <option key={row.code} value={row.name}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          disabled={busy}
                          aria-expanded={countryMenu}
                          aria-haspopup="listbox"
                          className="flex w-full items-center justify-between rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-left text-[13px] text-[#64748b] disabled:opacity-40"
                          onClick={() => setCountryMenu((open) => !open)}
                        >
                          Select country
                          <ChevronDown size={14} />
                        </button>
                        {countryMenu ? (
                          <div
                            role="listbox"
                            aria-label="Country"
                            className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#d6dde6] bg-white shadow-lg"
                          >
                            {countryOptions.map((row) => (
                              <button
                                key={row.code}
                                type="button"
                                role="option"
                                className="block w-full px-2 py-1.5 text-left text-[13px] text-[#1c352a] hover:bg-[#f8fafc]"
                                onClick={() => {
                                  setCountryMenu(false);
                                  saveCountry(row.name);
                                }}
                              >
                                {row.name}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[13px] font-semibold text-[#1e3a8a]">
                Categories <span className="font-normal text-[#64748b]">(multi-select)</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {categories.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
                    style={{ background: CHAT_CATEGORY_COLORS[value] }}
                  >
                    {chatCategoryLabel(value)}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${chatCategoryLabel(value)}`}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"
                      onClick={() =>
                        void run(() =>
                          crmApi
                            .setChatCategories(
                              threadId,
                              categories.filter((item) => item !== value)
                            )
                            .then(() => undefined)
                        )
                      }
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    disabled={busy || categories.length >= CHAT_CATEGORIES.length}
                    onClick={() => setCategoryMenu((open) => !open)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#cbd5e1] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#334155] hover:bg-[#f8fafc] disabled:opacity-40"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                  {categoryMenu ? (
                    <div className="absolute left-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-[#e2e8f0] bg-white py-1 shadow-lg">
                      {CHAT_CATEGORIES.filter(([value]) => !categories.includes(value)).map(([value, name]) => (
                        <button
                          key={value}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-[#1c352a] hover:bg-[#f8fafc]"
                          onClick={() => {
                            setCategoryMenu(false);
                            void run(() =>
                              crmApi.setChatCategories(threadId, [...categories, value]).then(() => undefined)
                            );
                          }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: CHAT_CATEGORY_COLORS[value] }}
                          />
                          {name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
              <label className="shrink-0 text-[13px] font-semibold text-[#1e3a8a]" htmlFor="lead-owner-select">
                Lead Owner
              </label>
              <select
                id="lead-owner-select"
                disabled={busy || !canAssign || assignees.length === 0}
                value={owner?.id ?? ""}
                onChange={(event) => {
                  const id = event.target.value || null;
                  void run(() => crmApi.setChatOwner(threadId, id).then(() => undefined));
                }}
                className="max-w-[14rem] rounded-full border bg-white px-3 py-1.5 text-[13px] font-semibold outline-none disabled:opacity-70"
                style={{ color: ownerSelectColor, borderColor: ownerSelectColor }}
              >
                <option value="">Unassigned</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name || person.email}
                  </option>
                ))}
              </select>
              </div>
              {(card?.crmCollaborators ?? []).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(card?.crmCollaborators ?? []).map((person) => (
                    <span
                      key={person.id}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        color: ownerTagColor(person.id),
                        border: `1px solid ${ownerTagColor(person.id)}`
                      }}
                    >
                      {person.name || person.email?.split("@")[0]}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="shrink-0 text-[13px] font-semibold text-[#1e3a8a]">Pipeline Status</p>
                <div className="relative" ref={pipelineRef}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPipelineOpen((open) => !open)}
                    className="inline-flex items-center gap-1.5 disabled:opacity-60"
                    aria-haspopup="listbox"
                    aria-expanded={pipelineOpen}
                  >
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={{ background: pipelinePill.bg, color: pipelinePill.text }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: pipelinePill.text }} />
                      {CHAT_PIPELINE_MENU_LABELS[status]}
                    </span>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#d6dde6] bg-white text-[#64748b]">
                      <ChevronDown size={14} />
                    </span>
                  </button>
                  {pipelineOpen ? (
                    <div
                      role="listbox"
                      className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-[#e2e8f0] bg-white p-1.5 shadow-lg"
                    >
                      {CHAT_PIPELINE_STATUSES.map((value) => {
                        const tone = CHAT_PIPELINE_PILLS[value];
                        const on = status === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="option"
                            aria-selected={on}
                            className="mb-1 flex w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-[12px] font-semibold last:mb-0"
                            style={{ background: tone.bg, color: tone.text }}
                            onClick={() => {
                              setPipelineOpen(false);
                              if (on) return;
                              void run(() => crmApi.setChatPipeline(threadId, value).then(() => undefined));
                            }}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: tone.text }} />
                            {CHAT_PIPELINE_MENU_LABELS[value]}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex items-start justify-between gap-3">
                <p className="shrink-0 pt-1.5 text-[13px] font-semibold text-[#1e3a8a]">Follow Up</p>
                <div className="shrink-0">
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    <label className="relative inline-flex items-center whitespace-nowrap rounded-lg border border-[#d6dde6] bg-white">
                      <span className="pointer-events-none px-2 text-[12px] font-medium text-[#1c352a]">
                        {formatFollowUpDate(followParts.date)}
                      </span>
                      <Calendar size={13} className="pointer-events-none mr-1.5 text-[#64748b]" />
                      <input
                        ref={followDateRef}
                        type="date"
                        lang="en-GB"
                        value={followParts.date}
                        onChange={(event) =>
                          setDue(joinFollowUpLocal(event.target.value, followParts.time || "10:00"))
                        }
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label="Follow-up date"
                      />
                    </label>
                    <button
                      type="button"
                      className="whitespace-nowrap px-0.5 text-[12px] font-medium text-[#1c352a]"
                      onClick={() => setTimeOpen((open) => !open)}
                    >
                      {formatFollowUpTime(followParts.time || "10:00")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d6dde6] bg-white text-[#64748b]"
                      aria-label="Follow-up time"
                      aria-expanded={timeOpen}
                      onClick={() => setTimeOpen((open) => !open)}
                    >
                      <Clock size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || !followParts.date || !me?.id}
                      className="rounded-md bg-[#1f9d4a] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                      onClick={() => {
                        setTimeOpen(false);
                        setConfirmFollowUp(true);
                      }}
                    >
                      Set
                    </button>
                  </div>
                  {timeOpen ? (
                    <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-1.5">
                      {FOLLOW_UP_TIMES.map((slot) => {
                        const on = (followParts.time || "10:00") === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            className="rounded-md px-1 py-1 text-[11px] font-semibold"
                            style={
                              on
                                ? { background: "#1e3a8a", color: "#fff" }
                                : { background: "#fff", color: "#1c352a" }
                            }
                            onClick={() => {
                              setDue(joinFollowUpLocal(followParts.date, slot));
                              setTimeOpen(false);
                            }}
                          >
                            {formatFollowUpTime(slot)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="mt-1 whitespace-nowrap text-right text-[10px] text-[#94a3b8]">
                    Default: next day 10:00 AM (24 hrs)
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              {quotes.length === 0 ? (
                <div className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold text-[#1e3a8a]">Quotation</p>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[12px] font-semibold text-[#1d4e89] disabled:opacity-40"
                      onClick={() => {
                        setEditing(null);
                        setQuoteOpen(true);
                      }}
                    >
                      + Quote
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] text-[#4a6b58]">No quotations yet.</p>
                </div>
              ) : null}
              {quotes.map((quote) => {
                const items = quote.items ?? [];
                const shown = expandedQuoteId === quote.id ? items : items.slice(0, 3);
                const hidden = Math.max(0, items.length - 3);
                const subtotal = quote.subtotalInPaise ?? 0;
                const discount = quote.discountInPaise ?? 0;
                const shipping = quote.shippingInPaise ?? 0;
                const packing = quote.packingInPaise ?? 0;
                const tax = quote.taxInPaise ?? 0;
                const discountPct = subtotal > 0 ? Math.round((discount * 100) / subtotal) : 0;
                const taxable = Math.max(0, subtotal - discount);
                const gstPct = taxable > 0 ? Math.round((tax * 100) / taxable) : 0;
                const money = (paise: number) => formatQuoteMoney(paise, quote.currency);
                const pill = quotePill(quote);
                const approved = quote.approvalStatus === "APPROVED";
                const sent = quote.status === "SENT" || quote.status === "CONVERTED" || Boolean(quote.convertedOrderNumber);
                return (
                  <div key={quote.id} className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="text-[14px] font-semibold text-[#1e3a8a]">Quotation</p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: pill.bg, color: pill.color }}
                        >
                          {pill.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="text-[12px] font-semibold text-[#1d4e89]"
                          onClick={() => {
                            setEditing(quote);
                            setQuoteOpen(true);
                          }}
                        >
                          View / Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#a12626] hover:bg-[#fef2f2]"
                          aria-label={`Delete ${quote.quoteNumber}`}
                          onClick={() => {
                            if (!window.confirm(`Delete ${quote.quoteNumber} permanently?`)) return;
                            void run(() => crmApi.deleteSalesQuote(quote.id).then(() => undefined));
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] font-semibold text-[#1c352a]">
                      {quote.quoteNumber} · {items.length} item{items.length === 1 ? "" : "s"}
                    </p>
                    <table className="mt-2 w-full text-left text-[11px]">
                      <thead>
                        <tr className="text-[#64748b]">
                          <th className="py-1 font-medium">Item</th>
                          <th className="py-1 text-right font-medium">Qty</th>
                          <th className="py-1 text-right font-medium">Price</th>
                          <th className="py-1 text-right font-medium">Disc %</th>
                          <th className="py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((item) => {
                          const gross = item.quantity * item.unitPriceInPaise;
                          const off = Math.round((gross * (item.discountPercent ?? 0)) / 100);
                          return (
                            <tr key={item.id} className="border-t border-[#f1f5f9] text-[#1c352a]">
                              <td className="max-w-[7rem] truncate py-1">{item.productName}</td>
                              <td className="py-1 text-right">{item.quantity}</td>
                              <td className="py-1 text-right">{money(item.unitPriceInPaise)}</td>
                              <td className="py-1 text-right">{item.discountPercent ?? 0}%</td>
                              <td className="py-1 text-right">{money(gross - off)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className="mt-1 text-[12px] font-semibold text-[#1d4e89]"
                        onClick={() =>
                          setExpandedQuoteId((current) => (current === quote.id ? null : quote.id))
                        }
                      >
                        {expandedQuoteId === quote.id ? "Show less" : `Show ${hidden} more item${hidden === 1 ? "" : "s"}`}
                      </button>
                    ) : null}
                    <dl className="mt-2 space-y-1 border-t border-[#e2e8f0] pt-2 text-[12px] text-[#334155]">
                      <div className="flex justify-between gap-2">
                        <dt>Subtotal</dt>
                        <dd>{money(subtotal)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Discount{discountPct ? ` (${discountPct}%)` : ""}</dt>
                        <dd>- {money(discount)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Shipping</dt>
                        <dd>{money(shipping)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Packing</dt>
                        <dd>{money(packing)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>GST{gstPct ? ` (${gstPct}%)` : ""}</dt>
                        <dd>{money(tax)}</dd>
                      </div>
                      <div className="flex justify-between gap-2 text-[13px] font-semibold text-[#1c352a]">
                        <dt>Total ({quote.currency || "INR"})</dt>
                        <dd>{money(quote.grandTotalInPaise)}</dd>
                      </div>
                    </dl>
                    {quote.approvalStatus === "REJECTED" && quote.approvalNote ? (
                      <p className="mt-2 text-[12px] text-[#991b1b]">{quote.approvalNote}</p>
                    ) : null}
                    <Link href={`/admin/quotations/${quote.id}`} className="mt-2 inline-block text-[12px] font-semibold text-[#1d4e89]">
                      Approval history
                    </Link>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px] font-semibold text-[#1c352a]"
                        onClick={() => void downloadQuote(quote).catch((err: Error) => setError(err.message))}
                      >
                        <Download size={13} />
                        View Quotation (PDF)
                      </button>
                      {sent ? (
                        <span className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#dcfce7] px-2 py-1.5 text-[12px] font-semibold text-[#166534]">
                          Sent to customer
                        </span>
                      ) : approved ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#1f9d4a] px-2 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                          onClick={() =>
                            void run(async () => {
                              await crmApi.shareSalesQuote(quote.id, threadId);
                              onShared?.();
                            })
                          }
                        >
                          <Send size={13} />
                          Send to Customer
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || quote.approvalStatus === "PENDING"}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#1d4e89] px-2 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                          onClick={() => {
                            setSubmitDone(false);
                            setSubmitQuote(quote);
                          }}
                        >
                          {quote.approvalStatus === "PENDING" ? "Waiting for approval" : "Submit for approval"}
                        </button>
                      )}
                    </div>
                    {approved && !quote.convertedOrderNumber ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-2 w-full rounded-lg border border-[#1d4e89] px-2 py-1.5 text-[12px] font-semibold text-[#1d4e89] disabled:opacity-40"
                        onClick={() =>
                          void run(async () => {
                            await crmApi.createQuoteOrder(quote.id, threadId);
                          })
                        }
                      >
                        Create order
                      </button>
                    ) : quote.convertedOrderNumber ? (
                      <p className="mt-2 text-[12px] font-semibold text-[#166534]">Order {quote.convertedOrderNumber}</p>
                    ) : null}
                  </div>
                );
              })}
              {quotes.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  className="text-[12px] font-semibold text-[#1d4e89] disabled:opacity-40"
                  onClick={() => {
                    setEditing(null);
                    setQuoteOpen(true);
                  }}
                >
                  + Quote
                </button>
              ) : null}
            </section>

            {quotes.length > 0 ? (
              <ChatLeadPayment
                threadId={threadId}
                refreshToken={quotes[0]?.grandTotalInPaise ?? 0}
                onShareBank={onSharePayment}
              />
            ) : null}

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Calls & notes</p>
              {card && card.crmNotes.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {card.crmNotes.slice(0, 6).map((row) => (
                    <li key={row.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
                      <p className="text-[11px] font-semibold text-[#1d4e89]">{row.kind === "CALL" ? "Call" : "Note"}</p>
                      <p>{row.body}</p>
                      <p className="mt-1 text-[11px] text-[#4a6b58]">
                        {new Date(row.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                        {row.author?.name ? ` · ${row.author.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-[#4a6b58]">No notes yet.</p>
              )}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder=""
                className="mt-2 w-full rounded-lg border border-[#1c352a]/15 px-2 py-1.5 text-[12px]"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  className="rounded-lg bg-[#1c352a] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  onClick={() =>
                    void run(async () => {
                      await crmApi.addChatNote(threadId, note.trim(), "NOTE");
                      setNote("");
                    })
                  }
                >
                  Add note
                </button>
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  className="rounded-lg border border-[#d6dde6] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  onClick={() =>
                    void run(async () => {
                      await crmApi.addChatNote(threadId, note.trim(), "CALL");
                      setNote("");
                    })
                  }
                >
                  Log call
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {quoteOpen ? (
        <ChatQuoteDialog
          customerName={customerName}
          email={email}
          phone={phone}
          threadId={threadId}
          suggestedCountryCode={COUNTRIES.find((row) => row.name === savedCountry)?.code || "IN"}
          existing={editing}
          onClose={() => setQuoteOpen(false)}
          onSaved={(created) => {
            setQuoteOpen(false);
            if (created) setSavedQuote(true);
            void load();
          }}
        />
      ) : null}
      {savedQuote ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#f7f3ea] px-5 py-5 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#8a5a12]">Quotation ready</p>
            <p className="mt-2 text-[15px] font-semibold text-[#1c352a]">
              Saved as a draft. Submit it for approval before it can be sent.
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-[#1c352a] px-4 py-2 text-[13px] font-semibold text-white"
              onClick={() => setSavedQuote(false)}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </aside>
    </>
  );
}
