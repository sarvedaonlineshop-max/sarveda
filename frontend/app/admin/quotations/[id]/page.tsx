"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAdminUser } from "@/components/admin/AdminUserContext";
import { crmApi, type CrmSalesQuote } from "@/lib/crm-api";
import { canApproveQuote, formatQuoteMoney } from "@/lib/quote-pricing";

const ACTION_LABEL: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Edited",
  SUBMITTED: "Submitted for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT: "Sent to the customer"
};

export default function AdminQuotationDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAdminUser();
  const [quote, setQuote] = useState<CrmSalesQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const canDecide = canApproveQuote(me?.email);

  const load = useCallback(async () => {
    const row = await crmApi.salesQuote(params.id);
    setQuote(row);
  }, [params.id]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED" && !note.trim()) {
      setError("Add a note so the team knows what to change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setQuote(await crmApi.decideSalesQuote(params.id, { decision, note: note.trim() || undefined }));
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the decision");
    } finally {
      setBusy(false);
    }
  }

  if (!quote) {
    return <p style={{ color: "#4a6b58" }}>{error || "Loading quotation…"}</p>;
  }

  const money = (minor: number) => formatQuoteMoney(minor, quote.currency);
  const waiting = quote.approvalStatus === "PENDING";

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 880 }}>
      <Link href="/admin/quotations?status=PENDING" style={{ color: "#1d4e89", fontWeight: 600 }}>
        ← Quotations
      </Link>
      <div style={{ background: "#fff", border: "1px solid #e8e2d9", borderRadius: 12, padding: 20 }}>
        <p style={{ margin: 0, color: "#4a6b58", fontSize: 13 }}>
          {quote.quoteNumber} · {quote.currency || "INR"} · {quote.approvalStatus || "NONE"}
        </p>
        <h2 style={{ margin: "6px 0 0", color: "#1c352a" }}>{quote.customerName || "Customer"}</h2>
        {quote.enquiryThreadId ? (
          <Link href={`/admin/chats/${quote.enquiryThreadId}`} style={{ color: "#1d4e89", fontWeight: 600 }}>
            Open the chat
          </Link>
        ) : null}
        {quote.approvalNote ? <p style={{ color: "#991b1b" }}>{quote.approvalNote}</p> : null}
        <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", fontSize: 13 }}>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(quote.items ?? []).map((item) => (
              <tr key={item.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                <td style={{ padding: "8px 0" }}>{item.productName}</td>
                <td>{item.quantity}</td>
                <td>{money(item.unitPriceInPaise)}</td>
                <td>{money(item.quantity * item.unitPriceInPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl style={{ marginTop: 12, display: "grid", gap: 6, maxWidth: 320, marginLeft: "auto" }}>
          <Row label="Subtotal" value={money(quote.subtotalInPaise ?? 0)} />
          <Row label="Discount" value={money(quote.discountInPaise ?? 0)} />
          <Row label="Shipping" value={money(quote.shippingInPaise ?? 0)} />
          <Row label="Packing" value={money(quote.packingInPaise ?? 0)} />
          <Row label="GST" value={money(quote.taxInPaise ?? 0)} />
          <Row label={`Total (${quote.currency || "INR"})`} value={money(quote.grandTotalInPaise)} strong />
        </dl>
      </div>

      {waiting ? (
        <div style={{ background: "#fff", border: "1px solid #e8e2d9", borderRadius: 12, padding: 20 }}>
          {canDecide ? (
            <>
              <label style={{ display: "block", fontWeight: 600, color: "#1c352a" }}>
                Note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Required when rejecting"
                  style={{ display: "block", width: "100%", marginTop: 6, borderRadius: 8, border: "1px solid #d6dde6", padding: 8 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("APPROVED")}
                  style={{ background: "#166534", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 700 }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("REJECTED")}
                  style={{ background: "#fff", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 14px", fontWeight: 700 }}
                >
                  Reject
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, color: "#4a6b58" }}>Deepak or Arjun still need to approve this quotation.</p>
          )}
          {error ? <p style={{ color: "#991b1b" }}>{error}</p> : null}
        </div>
      ) : null}

      <div style={{ background: "#fff", border: "1px solid #e8e2d9", borderRadius: 12, padding: 20 }}>
        <h3 style={{ marginTop: 0, color: "#1c352a" }}>Approval and revision history</h3>
        {(quote.revisions ?? []).length === 0 ? <p style={{ color: "#4a6b58" }}>No history yet.</p> : null}
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10 }}>
          {(quote.revisions ?? []).map((row) => (
            <li key={row.id}>
              <strong>{ACTION_LABEL[row.action] ?? row.action}</strong>
              <span style={{ color: "#4a6b58" }}>
                {" "}
                · revision {row.revision}
                {row.actorName || row.actorEmail ? ` · ${row.actorName || row.actorEmail}` : ""}
                {" · "}
                {new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </span>
              {row.note ? <div style={{ color: "#1c352a" }}>{row.note}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 700 : 500 }}>
      <dt>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}
