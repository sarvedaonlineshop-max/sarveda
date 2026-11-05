"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { crmApi, type CrmSalesQuote } from "@/lib/crm-api";
import { formatQuoteMoney } from "@/lib/quote-pricing";

const STATUSES = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" }
];

export default function AdminQuotationsPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get("status") || "PENDING";
  const [rows, setRows] = useState<CrmSalesQuote[]>([]);
  const [pending, setPending] = useState(0);
  const [seeAll, setSeeAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void crmApi
      .quoteApprovals(status)
      .then((data) => {
        setRows(data.items);
        setPending(data.pending);
        setSeeAll(Boolean(data.seeAll));
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [status]);

  const columns = seeAll
    ? ["Quotation", "Customer", "Owner", "Items", "Total", "Approved by", "Status"]
    : ["Quotation", "Customer", "Items", "Total", "Approved by", "Status"];

  return (
    <div>
      <p style={{ margin: "0 0 16px", color: "#4a6b58", fontSize: 15 }}>
        {seeAll
          ? "Deepak and Arjun approve a quotation before it can be sent to the customer. You can see every quotation."
          : "These are the quotations on chats you own."}
        {pending > 0 ? ` ${pending} waiting.` : ""}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUSES.map((item) => {
          const on = status === item.value;
          return (
            <Link
              key={item.value}
              href={`/admin/quotations?status=${item.value}`}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: on ? "#1c352a" : "#fff",
                color: on ? "#fff" : "#1c352a",
                border: "1px solid #d6dde6",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {error ? <p style={{ color: "#991b1b" }}>{error}</p> : null}
      <div style={{ background: "#fff", border: "1px solid #e8e2d9", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f7f3ea", textAlign: "left" }}>
              {columns.map((label) => (
                <th key={label} style={{ padding: "12px 16px", fontSize: 13, color: "#4a6b58" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 20, color: "#4a6b58" }}>
                  Nothing in this list.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/admin/quotations/${row.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/admin/quotations/${row.id}`);
                    }
                  }}
                  style={{ borderTop: "1px solid #f0ece6", cursor: "pointer" }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "rgba(29, 78, 137, 0.06)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "";
                  }}
                >
                  <td style={{ padding: "12px 16px", color: "#1d4e89", fontWeight: 700 }}>{row.quoteNumber}</td>
                  <td style={{ padding: "12px 16px" }}>{row.customerName || "—"}</td>
                  {seeAll ? <td style={{ padding: "12px 16px" }}>{row.ownerName || "—"}</td> : null}
                  <td style={{ padding: "12px 16px" }}>{row.items?.length ?? 0}</td>
                  <td style={{ padding: "12px 16px" }}>{formatQuoteMoney(row.grandTotalInPaise, row.currency)}</td>
                  <td style={{ padding: "12px 16px" }}>{row.approvedByName || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>{row.approvalStatus || row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
