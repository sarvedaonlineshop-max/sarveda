"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
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
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.045), 0 8px 24px rgba(15,23,42,0.04)"
};
const thSt: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
  textAlign: "left",
  whiteSpace: "nowrap"
};
const tdSt: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "16px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
};
const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  marginBottom: "4px"
};
const inputSt: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  background: "var(--admin-card-bg, #fff)",
  fontSize: "15px",
  color: "var(--admin-text, #2c2420)"
};

function StageBadge({ label, overdue }: { label: string; overdue?: boolean }) {
  const s = label.toUpperCase();
  let bg = "#f3f4f6";
  let color = "#374151";
  if (s.includes("REFUND") || s.includes("REPLACEMENT")) {
    bg = "#fef3c7";
    color = "#92400e";
  } else if (s.includes("COMPLETE") || s.includes("APPROVED")) {
    bg = "#dcfce7";
    color = "#166534";
  } else if (s.includes("REJECT")) {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (s.includes("TRANSIT") || s.includes("RECEIVED") || s.includes("QC")) {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (s.includes("PENDING") || s.includes("DISCUSSION") || s.includes("MORE INFO")) {
    bg = "#fef3c7";
    color = "#92400e";
  }
  if (overdue) {
    bg = "#fee2e2";
    color = "#991b1b";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: "14px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        border: `1px solid ${color}30`,
        display: "inline-flex",
        alignItems: "center"
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
          marginRight: "5px",
          flexShrink: 0
        }}
      />
      {label}
    </span>
  );
}

export default function AdminReturnsPageInner() {
  const searchParams = useSearchParams();
  const initialStage = searchParams.get("stage") || "all";
  const [rows, setRows] = useState<ReturnCaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(initialStage);
  const [q, setQ] = useState(searchParams.get("q") || "");

  useAdminPageHeader(
    () => ({
      title: "Returns & Refunds",
      subtitle: "Return, refund, and replacement cases — open a Case ID for the full workflow.",
      icon: <RotateCcw size={22} strokeWidth={2.25} color="#e8d5a8" aria-hidden />
    }),
    []
  );

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
    <div className="w-full space-y-4">
      <div
        style={{
          ...card,
          padding: "12px 14px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "8px"
        }}
      >
        <div style={{ flex: "0 1 220px", minWidth: "180px" }}>
          <label style={labelSt} htmlFor="ret-stage">
            Stage
          </label>
          <select
            id="ret-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            style={inputSt}
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 240px", minWidth: "200px" }}>
          <label style={labelSt} htmlFor="ret-q">
            Search
          </label>
          <input
            id="ret-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder="Case / order / email"
            style={inputSt}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid #1e3a2f",
            background: "linear-gradient(135deg, #1c352a, #2d5040)",
            color: "#fffbf5",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => {
            setQ("");
            setStage("all");
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid var(--admin-card-border, #e8e2d9)",
            background: "transparent",
            color: "#6b5c52",
            fontSize: "15px",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flex: "0 0 auto"
          }}
        >
          Clear
        </button>
        <span
          style={{
            alignSelf: "center",
            marginLeft: "auto",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--admin-text-muted, #8a7060)",
            whiteSpace: "nowrap"
          }}
        >
          {total} cases
        </span>
      </div>

      <div style={{ ...card, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 24, fontSize: 16, color: "var(--admin-text-muted, #8a7060)" }}>
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 24, fontSize: 16, color: "var(--admin-text-muted, #8a7060)" }}>
            No return cases match these filters.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {["Case", "Order", "Customer", "Item(s)", "Qty", "Reason", "Stage", "Age", "Created"].map(
                  (h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => {
                    window.location.href = `/admin/returns/${encodeURIComponent(row.caseNumber)}`;
                  }}
                  style={{
                    cursor: "pointer",
                    background: row.slaOverdue ? "#fff7f5" : undefined
                  }}
                  onMouseEnter={(e) => {
                    if (!row.slaOverdue) {
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--admin-row-hover, #faf5ec)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = row.slaOverdue
                      ? "#fff7f5"
                      : "";
                  }}
                >
                  <td style={tdSt}>
                    <Link
                      href={`/admin/returns/${encodeURIComponent(row.caseNumber)}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                        fontWeight: 600,
                        color: "#b98a3e",
                        textDecoration: "none"
                      }}
                    >
                      {row.caseNumber}
                    </Link>
                    {row.slaOverdue ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#b45309",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em"
                        }}
                      >
                        SLA
                      </span>
                    ) : null}
                  </td>
                  <td style={tdSt}>
                    <Link
                      href={`/admin/orders/${row.orderId}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                        fontWeight: 600,
                        color: "#b98a3e",
                        textDecoration: "none"
                      }}
                    >
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td style={tdSt}>
                    <div style={{ fontSize: "14px", color: "var(--admin-text-muted, #8a7060)" }}>
                      {row.customerEmail}
                    </div>
                  </td>
                  <td style={tdSt}>
                    <div
                      title={row.itemSummary || undefined}
                      style={{
                        fontSize: "15px",
                        maxWidth: "240px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {row.itemSummary || "—"}
                    </div>
                  </td>
                  <td style={{ ...tdSt, fontWeight: 700 }}>{row.qtyRequested ?? "—"}</td>
                  <td style={tdSt}>
                    <div
                      title={row.reasonLabel || undefined}
                      style={{
                        fontSize: "15px",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {row.reasonLabel || "—"}
                    </div>
                  </td>
                  <td style={tdSt}>
                    <StageBadge
                      label={row.stageLabel || row.status}
                      overdue={row.slaOverdue}
                    />
                  </td>
                  <td
                    style={{
                      ...tdSt,
                      fontSize: "15px",
                      color: "var(--admin-text-muted, #8a7060)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {row.ageHours != null
                      ? row.ageHours < 48
                        ? `${row.ageHours}h`
                        : `${Math.round(row.ageHours / 24)}d`
                      : "—"}
                  </td>
                  <td
                    style={{
                      ...tdSt,
                      fontSize: "15px",
                      color: "var(--admin-text-muted, #8a7060)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {new Date(row.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
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
