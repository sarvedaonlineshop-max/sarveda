"use client";

import { Download, Pencil, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getApiBase } from "@/lib/api";
import {
  completeAdminEnquiryFollowUp,
  createAdminEnquiryFollowUp,
  fetchAdminEnquiryFollowUps,
  type EnquiryFollowUpRow
} from "@/lib/admin-api";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { crmApi, type CrmAssignee, type CrmChatPipeline, type CrmSalesQuote } from "@/lib/crm-api";
import { ChatQuoteDialog } from "@/components/admin/ChatQuoteDialog";
import { ChatOrderPanel } from "@/components/admin/ChatOrderPanel";
import {
  CHAT_CATEGORIES,
  CHAT_CATEGORY_COLORS,
  CHAT_PIPELINE_COLORS,
  CHAT_PIPELINE_STATUSES,
  chatPipelineLabel,
  defaultFollowUpLocalValue,
  detectCountryLabel,
  normalizeChatPipeline,
  ownerTagColor,
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
  onShared?: () => void;
};

function rupees(paise?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format((paise ?? 0) / 100);
}

export function ChatCrmRail({
  threadId,
  customerName,
  email,
  phone,
  orderNumber,
  lastOwner,
  onShared
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
  const [followNote, setFollowNote] = useState("");
  const [note, setNote] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editing, setEditing] = useState<CrmSalesQuote | null>(null);
  const [savedQuote, setSavedQuote] = useState(false);

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
    setQuotes(needle && needle.length >= 3 ? await crmApi.listSalesQuotes(needle) : []);
  }, [threadId, customerName, email, phone]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const status = normalizeChatPipeline(card?.crmPipeline);
  const categories = (card?.crmCategories?.length ? card.crmCategories : card?.crmCategory ? [card.crmCategory] : []) as ChatCategory[];
  const openFollowUps = followUps.filter((row) => row.status === "OPEN");
  const latestNote = card?.crmNotes[0] ?? null;
  const owner = card?.crmOwner;
  const ownerName =
    owner?.name?.trim() ||
    owner?.email?.split("@")[0] ||
    lastOwner?.name?.trim() ||
    "Unassigned";
  const ownerColor = ownerTagColor(owner?.id || ownerName);
  const country = detectCountryLabel(phone || card?.waPhone);
  const quoteTotal = quotes[0]?.grandTotalInPaise ?? 0;

  const paymentStatus = useMemo(() => {
    if (quotes.length === 0) return null;
    return { label: "Unpaid", received: 0, balance: quoteTotal };
  }, [quotes.length, quoteTotal]);

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

  return (
    <aside className="flex h-full min-h-0 w-[340px] shrink-0 flex-col overflow-hidden border-l border-[#1c352a]/15 bg-[#f4eee4] text-[#1c352a]">
      <div className="flex shrink-0 gap-1 border-b border-[#1c352a]/10 bg-white px-2 py-2">
        {(["lead", "order"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
              tab === item ? "bg-[#1c352a] text-white" : "text-[#4a6b58] hover:bg-[#efe8dc]"
            }`}
          >
            {item === "lead" ? "Lead" : "Order"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? <p className="mb-2 text-[12px] text-red-700">{error}</p> : null}

        {tab === "order" ? (
          <ChatOrderPanel orderNumber={orderNumber || card?.orderNumber} customerEmail={email} />
        ) : (
          <div className="space-y-3">
            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4a6b58]">Customer details</p>
              </div>
              <p className="mt-1 text-[15px] font-semibold">{customerName}</p>
              {phone ? <p className="mt-0.5 text-[12px] text-[#1c352a]">{phone}</p> : null}
              {email && !email.includes("whatsapp.invalid") ? (
                <p className="text-[12px] text-[#4a6b58]">{email}</p>
              ) : null}
              {country ? (
                <p className="mt-1 text-[11px] font-semibold text-[#0f766e]">{country} (detected)</p>
              ) : null}
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Category</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {CHAT_CATEGORIES.map(([value, name]) => {
                  const on = categories.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          crmApi
                            .setChatCategories(
                              threadId,
                              on ? categories.filter((item) => item !== value) : [...categories, value]
                            )
                            .then(() => undefined)
                        )
                      }
                      className="rounded-full px-2 py-1 text-[11px] font-semibold"
                      style={
                        on
                          ? { background: CHAT_CATEGORY_COLORS[value], color: "#fff" }
                          : { background: "#efe8dc", color: "#1c352a" }
                      }
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Lead owner</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: ownerColor, border: `1px solid ${ownerColor}`, background: "transparent" }}
                >
                  {ownerName}
                </span>
                {(card?.crmCollaborators ?? []).map((person) => (
                  <span
                    key={person.id}
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ background: ownerTagColor(person.id) }}
                  >
                    {person.name || person.email?.split("@")[0]}
                  </span>
                ))}
              </div>
              <select
                disabled={busy}
                value={owner?.id ?? ""}
                onChange={(event) =>
                  void run(() => crmApi.setChatOwner(threadId, event.target.value || null).then(() => undefined))
                }
                className="mt-2 w-full rounded-lg border border-[#1c352a]/15 bg-white px-2 py-1.5 text-[12px]"
              >
                <option value="">Unassigned</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name || person.email}
                  </option>
                ))}
              </select>
              <label className="mt-2 block text-[11px] font-semibold text-[#4a6b58]">Collaborators</label>
              <select
                disabled={busy || !assignees.length}
                value=""
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) return;
                  const ids = Array.from(
                    new Set([...(card?.crmCollaborators ?? []).map((row) => row.id), id])
                  );
                  void run(() => crmApi.setChatCollaborators(threadId, ids).then(() => undefined));
                }}
                className="mt-1 w-full rounded-lg border border-[#1c352a]/15 bg-white px-2 py-1.5 text-[12px]"
              >
                <option value="">Add collaborator</option>
                {assignees
                  .filter((person) => person.id !== owner?.id && !(card?.crmCollaborators ?? []).some((row) => row.id === person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name || person.email}
                    </option>
                  ))}
              </select>
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Pipeline status</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {CHAT_PIPELINE_STATUSES.map((value) => {
                  const on = status === value;
                  const tone = CHAT_PIPELINE_COLORS[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy || on}
                      onClick={() => void run(() => crmApi.setChatPipeline(threadId, value).then(() => undefined))}
                      className="rounded-full px-2 py-1 text-[11px] font-semibold"
                      style={{
                        background: on ? tone.bg : "#efe8dc",
                        color: on ? tone.text : "#1c352a"
                      }}
                    >
                      {chatPipelineLabel(value)}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Follow-up</p>
              <ul className="mt-2 space-y-1">
                {openFollowUps.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-2 text-[12px]">
                    <span>
                      {new Date(row.dueAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                      {row.notes ? ` · ${row.notes}` : ""}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold"
                      onClick={() => void run(() => completeAdminEnquiryFollowUp(row.id).then(() => undefined))}
                    >
                      Done
                    </button>
                  </li>
                ))}
              </ul>
              <input
                type="datetime-local"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                className="mt-2 w-full rounded-lg border border-[#1c352a]/15 px-2 py-1.5 text-[12px]"
              />
              <input
                value={followNote}
                onChange={(event) => setFollowNote(event.target.value)}
                placeholder="Reminder note"
                className="mt-1 w-full rounded-lg border border-[#1c352a]/15 px-2 py-1.5 text-[12px]"
              />
              <button
                type="button"
                disabled={busy || !due || !me?.id}
                className="mt-2 rounded-lg bg-[#1c352a] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                onClick={() =>
                  void run(async () => {
                    if (!me?.id) return;
                    await createAdminEnquiryFollowUp(threadId, {
                      notes: followNote.trim() || "Follow-up",
                      dueAt: new Date(due).toISOString(),
                      assignedAdminId: me.id
                    });
                    setDue(defaultFollowUpLocalValue());
                    setFollowNote("");
                  })
                }
              >
                Set
              </button>
            </section>

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">Quotation</p>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full bg-[#1c352a] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  onClick={() => {
                    setEditing(null);
                    setQuoteOpen(true);
                  }}
                >
                  + Quote
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {quotes.length === 0 ? <li className="text-[12px] text-[#4a6b58]">No quotations yet.</li> : null}
                {quotes.map((quote) => (
                  <li key={quote.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
                    <p className="font-semibold">
                      {quote.quoteNumber} · {rupees(quote.grandTotalInPaise)}
                    </p>
                    <p className="text-[11px] text-[#4a6b58]">{quote.status}</p>
                    <div className="mt-2 flex gap-2">
                      <IconAction
                        label="Share"
                        tone="#1f7a4d"
                        onClick={() =>
                          void run(async () => {
                            await crmApi.shareSalesQuote(quote.id, threadId);
                            onShared?.();
                          })
                        }
                      >
                        <Send size={14} />
                      </IconAction>
                      <IconAction
                        label="Download"
                        tone="#1d4e89"
                        onClick={() => void downloadQuote(quote).catch((err: Error) => setError(err.message))}
                      >
                        <Download size={14} />
                      </IconAction>
                      <IconAction
                        label="Edit"
                        tone="#8a5a12"
                        onClick={() => {
                          setEditing(quote);
                          setQuoteOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </IconAction>
                      <IconAction
                        label="Delete"
                        tone="#a12626"
                        onClick={() => {
                          if (!window.confirm(`Delete ${quote.quoteNumber} permanently?`)) return;
                          void run(() => crmApi.deleteSalesQuote(quote.id).then(() => undefined));
                        }}
                      >
                        <Trash2 size={14} />
                      </IconAction>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {paymentStatus ? (
              <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
                <p className="text-[12px] font-semibold">Payment</p>
                <dl className="mt-2 space-y-1 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <dt>Total</dt>
                    <dd className="font-semibold">{rupees(quoteTotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Received</dt>
                    <dd>{rupees(paymentStatus.received)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Balance</dt>
                    <dd className="font-semibold">{rupees(paymentStatus.balance)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Status</dt>
                    <dd className="font-semibold text-[#b45309]">{paymentStatus.label}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-[#78716c]">
                  Share Bank / UPI from the message box. Payment links stay with Finance in the next slice.
                </p>
              </section>
            ) : null}

            <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
              <p className="text-[12px] font-semibold">Notes</p>
              {latestNote ? (
                <div className="mt-2 rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
                  <p>{latestNote.body}</p>
                  <p className="mt-1 text-[11px] text-[#4a6b58]">
                    {new Date(latestNote.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                    {latestNote.author?.name ? ` · ${latestNote.author.name}` : ""}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-[#4a6b58]">No notes yet.</p>
              )}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Add note"
                className="mt-2 w-full rounded-lg border border-[#1c352a]/15 px-2 py-1.5 text-[12px]"
              />
              <button
                type="button"
                disabled={busy || !note.trim()}
                className="mt-2 rounded-lg bg-[#1c352a] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                onClick={() =>
                  void run(async () => {
                    await crmApi.addChatNote(threadId, note.trim());
                    setNote("");
                  })
                }
              >
                Add note
              </button>
              {card && card.crmNotes.length > 1 ? (
                <ul className="mt-2 space-y-2">
                  {card.crmNotes.slice(1, 6).map((row) => (
                    <li key={row.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px] text-[#4a6b58]">
                      {row.body}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        )}
      </div>

      {quoteOpen ? (
        <ChatQuoteDialog
          customerName={customerName}
          email={email}
          phone={phone}
          existing={editing}
          onClose={() => setQuoteOpen(false)}
          onSaved={(created) => {
            setQuoteOpen(false);
            if (created) {
              setSavedQuote(true);
              void run(() => crmApi.setChatPipeline(threadId, "QUOTATION_SENT").then(() => undefined));
            } else {
              void load();
            }
          }}
        />
      ) : null}
      {savedQuote ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#f7f3ea] px-5 py-5 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#8a5a12]">Quotation ready</p>
            <p className="mt-2 text-[15px] font-semibold text-[#1c352a]">Saved. Share it from the quotation card.</p>
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
  );
}

function IconAction({
  label,
  tone,
  onClick,
  children
}: {
  label: string;
  tone: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white"
      style={{ color: tone }}
    >
      {children}
    </button>
  );
}
