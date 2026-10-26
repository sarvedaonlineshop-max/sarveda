"use client";

import { Download, Pencil, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getApiBase } from "@/lib/api";
import {
  completeAdminEnquiryFollowUp,
  createAdminEnquiryFollowUp,
  fetchAdminEnquiryFollowUps,
  type EnquiryFollowUpRow
} from "@/lib/admin-api";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { crmApi, type CrmChatPipeline, type CrmSalesQuote } from "@/lib/crm-api";
import { ChatQuoteDialog } from "@/components/admin/ChatQuoteDialog";

const PIPELINE = ["NEW", "CONTACTED", "ONGOING", "FOLLOWUP", "WON", "LOST", "UNQUALIFIED"] as const;
const CATEGORIES = [
  ["PRODUCTS", "Products"],
  ["COURSES", "Courses"],
  ["DELIVERY", "Delivery"],
  ["PAYMENT", "Payment"],
  ["REFUND", "Refund"],
  ["B2B", "B2B"],
  ["OTHERS", "Others"]
] as const;

type Props = {
  threadId: string;
  customerName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
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

function label(status: string) {
  if (status === "FOLLOWUP") return "Followup";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function ChatCrmRail({ threadId, customerName, email, phone, lastOwner, onShared }: Props) {
  const me = useAdminUser();
  const [card, setCard] = useState<CrmChatPipeline | null>(null);
  const [followUps, setFollowUps] = useState<EnquiryFollowUpRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [quotes, setQuotes] = useState<CrmSalesQuote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [followNote, setFollowNote] = useState("");
  const [note, setNote] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editing, setEditing] = useState<CrmSalesQuote | null>(null);
  const [quotesOpen, setQuotesOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savedQuote, setSavedQuote] = useState(false);

  const load = useCallback(async () => {
    const row = await crmApi.chatPipeline(threadId);
    setCard(row);
    const ups = await fetchAdminEnquiryFollowUps(threadId);
    setFollowUps(ups.items);
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

  const status = card?.crmPipeline ?? "NEW";
  const openFollowUps = followUps.filter((row) => row.status === "OPEN");
  const pastFollowUps = followUps.filter((row) => row.status !== "OPEN");
  const rawOwner =
    card?.crmOwner?.name?.trim() ||
    card?.crmOwner?.email?.split("@")[0] ||
    lastOwner?.name?.trim() ||
    "Unassigned";
  const ownerName = rawOwner === "Unassigned" ? rawOwner : rawOwner.replace(/\b\w/g, (letter) => letter.toUpperCase());

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

  function chooseStatus(next: string) {
    if (next === status) return;
    void run(() => crmApi.setChatPipeline(threadId, next).then(() => undefined));
  }

  return (
    <aside className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-y-auto border-l border-[#1c352a]/15 bg-[#f7f3ea] px-3 py-3 text-[#1c352a]">
      <div className="rounded-xl border border-[#1c352a]/10 bg-white px-3 py-2.5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#4a6b58]">Lead owner</div>
        <div className="mt-1 text-[16px] font-semibold leading-5 text-[#1c352a]">{ownerName}</div>
      </div>
      {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}

      <section className="mt-3 rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Category</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORIES.map(([value, name]) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  crmApi.setChatCategory(threadId, card?.crmCategory === value ? null : value).then(() => undefined)
                )
              }
              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                card?.crmCategory === value ? "bg-[#1c352a] text-white" : "bg-[#efe8dc] text-[#1c352a]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold">Pipeline</p>
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
        <div className="mt-2 flex flex-wrap gap-1">
          {PIPELINE.map((value) => {
            const on = status === value;
            return (
              <button
                key={value}
                type="button"
                disabled={busy || on}
                onClick={() => chooseStatus(value)}
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                  on ? "bg-[#1c352a] text-white" : "bg-[#efe8dc] text-[#1c352a]"
                }`}
              >
                {label(value)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="mt-3 text-[12px] font-semibold"
          onClick={() => setQuotesOpen((open) => !open)}
        >
          {quotesOpen ? "Hide quotations" : `Quotations (${quotes.length})`}
        </button>
        {quotesOpen ? (
          <ul className="mt-2 space-y-2">
            {quotes.length === 0 ? <li className="text-[12px] text-[#4a6b58]">No quotations yet.</li> : null}
            {quotes.map((quote) => (
              <li key={quote.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
                <p className="font-semibold">
                  {quote.quoteNumber} · {rupees(quote.grandTotalInPaise)}
                </p>
                <div className="mt-2 flex gap-2">
                  <IconAction label="Share" tone="#1f7a4d" onClick={() => void run(async () => { await crmApi.shareSalesQuote(quote.id, threadId); onShared?.(); })}>
                    <Send size={14} />
                  </IconAction>
                  <IconAction label="Download" tone="#1d4e89" onClick={() => void downloadQuote(quote).catch((err: Error) => setError(err.message))}>
                    <Download size={14} />
                  </IconAction>
                  <IconAction label="Edit" tone="#8a5a12" onClick={() => { setEditing(quote); setQuoteOpen(true); }}>
                    <Pencil size={14} />
                  </IconAction>
                  <IconAction label="Delete" tone="#a12626" onClick={() => { if (!window.confirm(`Delete ${quote.quoteNumber} permanently?`)) return; void run(() => crmApi.deleteSalesQuote(quote.id).then(() => undefined)); }}>
                    <Trash2 size={14} />
                  </IconAction>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-3 rounded-xl border border-[#1c352a]/10 bg-white p-3">
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
          placeholder="Note (optional)"
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
                notes: followNote.trim(),
                dueAt: new Date(due).toISOString(),
                assignedAdminId: me.id
              });
              setDue("");
              setFollowNote("");
            })
          }
        >
          Set follow-up
        </button>
        <button
          type="button"
          className="mt-2 block text-[12px] font-semibold text-[#1c352a]"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? "Hide history" : `History (${pastFollowUps.length})`}
        </button>
        {historyOpen ? (
          <ul className="mt-2 space-y-1 text-[12px] text-[#4a6b58]">
            {pastFollowUps.length === 0 ? <li>No earlier follow-ups.</li> : null}
            {pastFollowUps.map((row) => (
              <li key={row.id}>
                {new Date(row.dueAt).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
                {row.notes ? ` · ${row.notes}` : ""} · Done
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-3 rounded-xl border border-[#1c352a]/10 bg-white p-3">
        <p className="text-[12px] font-semibold">Notes</p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Write a note"
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
          Add
        </button>
        <button
          type="button"
          className="mt-2 block text-[12px] font-semibold"
          onClick={() => setNotesOpen((open) => !open)}
        >
          {notesOpen ? "Hide notes" : `Notes history (${card?.crmNotes.length ?? 0})`}
        </button>
        {notesOpen ? <ul className="mt-2 space-y-2">
          {(card?.crmNotes ?? []).map((row) => (
            <li key={row.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
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
        </ul> : null}
      </section>

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
              setQuotesOpen(true);
            }
            void load();
          }}
        />
      ) : null}
      {savedQuote ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#f7f3ea] px-5 py-5 text-center shadow-2xl">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[#8a5a12]">Quotation ready</p>
            <p className="mt-2 text-[15px] font-semibold text-[#1c352a]">
              The quotation is saved. Send it from Quotation history.
            </p>
            <button
              type="button"
              className="mt-4 rounded-full bg-[#1c352a] px-4 py-2 text-[13px] font-semibold text-white"
              onClick={() => setSavedQuote(false)}
            >
              Open history
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
      style={{ color: tone, boxShadow: "0 2px 8px rgba(28,53,42,0.18)" }}
    >
      {children}
    </button>
  );
}
