"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type ReturnCaseRow = {
  id: string;
  caseNumber: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  type: string;
  status: string;
  channel: string;
  reasonLabel: string | null;
  rootCause: string | null;
  responsibleTeam: string | null;
  returnPhysicalStatus: string;
  resolutionStatus: string;
  refundTotalInPaise: number | null;
  createdAt: string;
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnCaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`${getApiBase()}/api/admin/return-cases?${params}`, {
      credentials: "include"
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { rows: ReturnCaseRow[]; total: number };
    };
    setRows(json.data?.rows ?? []);
    setTotal(json.data?.total ?? 0);
    setLoading(false);
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Return cases</h1>
      <p style={{ color: "#6b635b", marginBottom: 20, fontSize: 14 }}>
        Operational queue for cancellations, returns, replacements, and missing-part cases.
      </p>

      <div style={{ ...card, padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        >
          <option value="all">All statuses</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="MORE_INFO_REQUIRED">More info required</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="NEEDS_DISCUSSION">Needs discussion</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search case / order / email"
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        />
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "#2c2420",
            color: "#fff",
            border: "none",
            fontWeight: 600
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 24 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 24, color: "#6b635b" }}>No return cases match these filters.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f7f4ef", textAlign: "left" }}>
                <th style={{ padding: 12 }}>Case</th>
                <th style={{ padding: 12 }}>Order</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Reason</th>
                <th style={{ padding: 12 }}>Physical</th>
                <th style={{ padding: 12 }}>Resolution</th>
                <th style={{ padding: 12 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 12, fontWeight: 600 }}>{row.caseNumber}</td>
                  <td style={{ padding: 12 }}>
                    <Link href={`/admin/orders/${row.orderId}`} style={{ color: "#8b5a2b" }}>
                      {row.orderNumber}
                    </Link>
                    <div style={{ color: "#888", fontSize: 11 }}>{row.customerEmail}</div>
                  </td>
                  <td style={{ padding: 12 }}>{row.status.replace(/_/g, " ")}</td>
                  <td style={{ padding: 12, maxWidth: 220 }}>{row.reasonLabel ?? "—"}</td>
                  <td style={{ padding: 12 }}>{row.returnPhysicalStatus.replace(/_/g, " ")}</td>
                  <td style={{ padding: 12 }}>{row.resolutionStatus.replace(/_/g, " ")}</td>
                  <td style={{ padding: 12 }}>{new Date(row.createdAt).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ marginTop: 12, color: "#888", fontSize: 12 }}>{total} case(s)</p>
    </div>
  );
}
