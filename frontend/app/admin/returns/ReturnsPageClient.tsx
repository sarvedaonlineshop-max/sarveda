"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getApiBase } from "@/lib/api";

type ReturnCaseRow = {
  id: string;
  caseNumber: string;
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  type: string;
  status: string;
  stage?: string;
  stageLabel?: string;
  reasonLabel: string | null;
  returnPhysicalStatus: string;
  resolutionStatus: string;
  refundTotalInPaise: number | null;
  itemSummary?: string;
  qtyRequested?: number;
  ageHours?: number;
  slaOverdue?: boolean;
  createdAt: string;
};

const STAGES: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "MORE_INFO_REQUIRED", label: "More info required" },
  { value: "NEEDS_DISCUSSION", label: "Needs discussion" },
  { value: "APPROVED_AWAITING_RETURN", label: "Approved / awaiting return" },
  { value: "RETURN_IN_TRANSIT", label: "Return in transit" },
  { value: "RECEIVED", label: "Received" },
  { value: "QC_PENDING", label: "Inspection / QC pending" },
  { value: "REFUND_PENDING", label: "Refund pending" },
  { value: "REPLACEMENT_PENDING", label: "Replacement pending" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" }
];

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

export default function AdminReturnsPageInner() {
  const searchParams = useSearchParams();
  const initialStage = searchParams.get("stage") || "all";
  const [rows, setRows] = useState<ReturnCaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(initialStage);
  const [q, setQ] = useState(searchParams.get("q") || "");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (stage !== "all") params.set("stage", stage);
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
  }, [stage, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const s = searchParams.get("stage");
    if (s) setStage(s);
  }, [searchParams]);

  return (
    <div style={{ padding: "24px", maxWidth: 1280, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Returns</h1>
      <p style={{ color: "#6b635b", marginBottom: 20, fontSize: 14 }}>
        Operational workspace for return, refund, and replacement cases. Open a Case ID to manage the
        full workflow.
      </p>

      <div style={{ ...card, padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
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
        <span style={{ alignSelf: "center", fontSize: 13, color: "#6b635b" }}>{total} cases</span>
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
                <th style={{ padding: 12 }}>Customer</th>
                <th style={{ padding: 12 }}>Item(s)</th>
                <th style={{ padding: 12 }}>Qty</th>
                <th style={{ padding: 12 }}>Reason</th>
                <th style={{ padding: 12 }}>Stage</th>
                <th style={{ padding: 12 }}>Age</th>
                <th style={{ padding: 12 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderTop: "1px solid #eee",
                    background: row.slaOverdue ? "#fff7f5" : undefined
                  }}
                >
                  <td style={{ padding: 12 }}>
                    <Link
                      href={`/admin/returns/${encodeURIComponent(row.caseNumber)}`}
                      style={{ fontWeight: 700, color: "#2c2420", textDecoration: "underline" }}
                    >
                      {row.caseNumber}
                    </Link>
                    {row.slaOverdue ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#b45309",
                          textTransform: "uppercase"
                        }}
                      >
                        SLA
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: 12 }}>
                    <Link href={`/admin/orders/${row.orderId}`} style={{ color: "#4a5568" }}>
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td style={{ padding: 12 }}>{row.customerEmail}</td>
                  <td style={{ padding: 12, maxWidth: 220 }}>{row.itemSummary || "—"}</td>
                  <td style={{ padding: 12 }}>{row.qtyRequested ?? "—"}</td>
                  <td style={{ padding: 12 }}>{row.reasonLabel || "—"}</td>
                  <td style={{ padding: 12 }}>{row.stageLabel || row.status}</td>
                  <td style={{ padding: 12 }}>
                    {row.ageHours != null
                      ? row.ageHours < 48
                        ? `${row.ageHours}h`
                        : `${Math.round(row.ageHours / 24)}d`
                      : "—"}
                  </td>
                  <td style={{ padding: 12 }}>
                    {new Date(row.createdAt).toLocaleString("en-IN", { dateStyle: "medium" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
