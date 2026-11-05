"use client";

import { useEffect, useState } from "react";

import { crmApi, type CrmLeadPaymentView } from "@/lib/crm-api";
import { formatQuoteMoney } from "@/lib/quote-pricing";

const METHODS = [
  { id: "PREPAID", label: "Prepaid" },
  { id: "PARTIAL", label: "Partial" },
  { id: "COD", label: "COD" },
  { id: "CREDIT", label: "Agreed credit" }
] as const;

const STATUS_LABEL: Record<CrmLeadPaymentView["status"], string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  OVERDUE: "Overdue"
};

const CHANNEL_LABEL: Record<string, string> = {
  GATEWAY: "Payment gateway",
  BANK_UPI: "Bank / UPI",
  COD_COLLECTION: "COD collected",
  COD_SETTLEMENT: "COD settlement"
};

const RECEIPT_LABEL: Record<string, string> = {
  PENDING: "Waiting for finance",
  VERIFIED: "Confirmed",
  REJECTED: "Rejected",
  COLLECTED: "Collected, not settled"
};

function dueInput(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

function statusColor(status: CrmLeadPaymentView["status"]) {
  if (status === "PAID") return "#166534";
  if (status === "OVERDUE") return "#991b1b";
  if (status === "PARTIALLY_PAID") return "#b45309";
  return "#57534e";
}

export function ChatLeadPayment({
  threadId,
  refreshToken = 0,
  onShareBank
}: {
  threadId: string;
  refreshToken?: number;
  onShareBank?: (kind: "qr" | "details") => void;
}) {
  const [payment, setPayment] = useState<CrmLeadPaymentView | null>(null);
  const [method, setMethod] = useState<string>("PREPAID");
  const [dueDate, setDueDate] = useState("");
  const [channel, setChannel] = useState("BANK_UPI");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    crmApi
      .leadPayment(threadId)
      .then((data) => {
        if (cancelled || !data) return;
        setPayment(data);
        setMethod(data.method);
        setDueDate(dueInput(data.dueAt));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load payment");
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, refreshToken]);

  function apply(next: CrmLeadPaymentView | null) {
    if (!next) return;
    setPayment(next);
    setMethod(next.method);
    setDueDate(dueInput(next.dueAt));
  }

  async function run(action: () => Promise<CrmLeadPaymentView | null>) {
    setBusy(true);
    setError(null);
    try {
      apply(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update payment");
    } finally {
      setBusy(false);
    }
  }

  if (!payment) {
    return error ? <p className="text-[12px] text-[#991b1b]">{error}</p> : null;
  }

  const currency = payment.currency;
  const channels = payment.finance
    ? [
        { id: "BANK_UPI", label: "Bank / UPI" },
        { id: "COD_COLLECTION", label: "COD collected" },
        { id: "COD_SETTLEMENT", label: "COD settlement" }
      ]
    : [
        { id: "BANK_UPI", label: "Bank / UPI" },
        { id: "COD_COLLECTION", label: "COD collected" }
      ];

  return (
    <section className="rounded-xl border border-[#1c352a]/10 bg-white p-3">
      <p className="text-[12px] font-semibold">Payment</p>
      <dl className="mt-2 space-y-1 text-[12px]">
        <div className="flex justify-between gap-2">
          <dt>Total</dt>
          <dd className="font-semibold">{formatQuoteMoney(payment.totalInPaise, currency)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Received</dt>
          <dd>{formatQuoteMoney(payment.receivedInPaise, currency)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Balance</dt>
          <dd className="font-semibold">{formatQuoteMoney(payment.balanceInPaise, currency)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Status</dt>
          <dd className="font-semibold" style={{ color: statusColor(payment.status) }}>
            {STATUS_LABEL[payment.status]}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Due</dt>
          <dd>{payment.dueAt ? dueInput(payment.dueAt) : "Not set"}</dd>
        </div>
      </dl>
      {payment.orderNumber ? (
        <p className="mt-2 text-[11px] text-[#4a6b58]">Linked to order {payment.orderNumber}</p>
      ) : (
        <p className="mt-2 text-[11px] text-[#78716c]">Linked to this chat and {payment.quoteNumber}.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#57534e]">
          Method
          <select
            value={method}
            disabled={busy}
            onChange={(event) => setMethod(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-[12px]"
          >
            {METHODS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-[#57534e]">
          Due date
          <input
            type="date"
            value={dueDate}
            disabled={busy}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-[12px]"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        className="mt-2 text-[12px] font-semibold text-[#1d4e89] disabled:opacity-40"
        onClick={() =>
          void run(() => crmApi.saveLeadPayment(threadId, { method, dueDate: dueDate || null }))
        }
      >
        Save payment terms
      </button>

      <div className="mt-3 flex flex-col gap-2">
        {payment.finance ? (
          <button
            type="button"
            disabled={busy || payment.balanceInPaise <= 0 || currency !== "INR"}
            className="rounded-lg bg-[#1d4e89] px-2 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            onClick={() => void run(() => crmApi.shareLeadPaymentLink(threadId))}
          >
            Share payment link
          </button>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px] font-semibold text-[#1c352a]"
            onClick={() => onShareBank?.("qr")}
          >
            Share UPI QR
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px] font-semibold text-[#1c352a]"
            onClick={() => onShareBank?.("details")}
          >
            Share bank details
          </button>
        </div>
      </div>
      {payment.finance && currency === "INR" ? (
        <p className="mt-2 text-[11px] text-[#78716c]">
          Gateway payments confirm themselves. Bank and UPI need you to verify them.
        </p>
      ) : !payment.finance ? (
        <p className="mt-2 text-[11px] text-[#78716c]">
          Payment links stay with Finance. Bank and UPI details here are the approved ones.
        </p>
      ) : null}

      <form
        className="mt-3 space-y-2 border-t border-[#1c352a]/10 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const minor = Math.round(Number(amount) * 100);
          if (!Number.isFinite(minor) || minor <= 0) {
            setError("Enter an amount");
            return;
          }
          void run(async () => {
            const next = await crmApi.recordLeadReceipt(threadId, {
              amountInPaise: minor,
              channel,
              reference: reference || null,
              note: note || null
            });
            setAmount("");
            setReference("");
            setNote("");
            return next;
          });
        }}
      >
        <p className="text-[12px] font-semibold">Record a payment</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            inputMode="decimal"
            value={amount}
            disabled={busy}
            placeholder="Amount"
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px]"
          />
          <select
            value={channel}
            disabled={busy}
            onChange={(event) => setChannel(event.target.value)}
            className="rounded-lg border border-[#d6dde6] bg-white px-2 py-1.5 text-[12px]"
          >
            {channels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={reference}
          disabled={busy}
          placeholder="Reference"
          onChange={(event) => setReference(event.target.value)}
          className="w-full rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px]"
        />
        <input
          value={note}
          disabled={busy}
          placeholder="Note"
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-[#d6dde6] px-2 py-1.5 text-[12px] font-semibold text-[#1c352a] disabled:opacity-40"
        >
          Add to history
        </button>
      </form>

      <div className="mt-3 space-y-2">
        {payment.receipts.length === 0 ? (
          <p className="text-[12px] text-[#4a6b58]">No payments yet.</p>
        ) : (
          payment.receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-lg bg-[#f7f3ea] px-2 py-2 text-[12px]">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{CHANNEL_LABEL[receipt.channel] ?? receipt.channel}</span>
                <span>{formatQuoteMoney(receipt.amountInPaise, currency)}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#57534e]">
                {RECEIPT_LABEL[receipt.status] ?? receipt.status}
                {receipt.reference ? ` · ${receipt.reference}` : ""}
              </p>
              {!receipt.countsAsReceived && receipt.channel === "COD_COLLECTION" ? (
                <p className="mt-1 text-[11px] text-[#78716c]">Not counted as received.</p>
              ) : null}
              {payment.finance && receipt.status === "PENDING" ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[12px] font-semibold text-[#166534] disabled:opacity-40"
                    onClick={() => void run(() => crmApi.verifyLeadReceipt(threadId, receipt.id))}
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[12px] font-semibold text-[#991b1b] disabled:opacity-40"
                    onClick={() => void run(() => crmApi.rejectLeadReceipt(threadId, receipt.id))}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      {error ? <p className="mt-2 text-[12px] text-[#991b1b]">{error}</p> : null}
    </section>
  );
}
