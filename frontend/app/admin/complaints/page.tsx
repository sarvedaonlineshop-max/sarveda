"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Complaint = {
  id: string;
  raisedByEmail: string;
  raisedByName: string | null;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REOPENED";
  createdAt: string;
  attachments: Array<{ type: string; s3Url: string }>;
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: "#fee2e2", color: "#991b1b" },
  MEDIUM: { bg: "#fef3c7", color: "#92400e" },
  LOW: { bg: "#f3f4f6", color: "#6b7280" }
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  OPEN: { bg: "#fee2e2", color: "#991b1b" },
  IN_PROGRESS: { bg: "#dbeafe", color: "#1e40af" },
  RESOLVED: { bg: "#dcfce7", color: "#166534" },
  REOPENED: { bg: "#fef3c7", color: "#92400e" }
};

function Badge({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span
      style={{
        background: style.bg,
        color: style.color,
        fontSize: "11px",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: "999px",
        whiteSpace: "nowrap"
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);

    const res = await fetch(`/api/complaints/admin/all?${params.toString()}`, {
      credentials: "include"
    });
    const data = (await res.json()) as { complaints: Complaint[] };
    setComplaints(data.complaints ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [statusFilter, priorityFilter]);

  const counts = {
    open: complaints.filter((c) => c.status === "OPEN").length,
    inProgress: complaints.filter((c) => c.status === "IN_PROGRESS").length,
    high: complaints.filter((c) => c.priority === "HIGH" && c.status !== "RESOLVED").length
  };

  const thSt: React.CSSProperties = {
    padding: "11px 16px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8a7060",
    background: "#f9f7f4",
    textAlign: "left"
  };
  const tdSt: React.CSSProperties = {
    padding: "13px 16px",
    fontSize: "13px",
    color: "#4a3f38",
    borderBottom: "1px solid #f0ece6"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Complaints &amp; Bug Reports</h1>
          <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
            Reported by team members from the mobile app
          </p>
        </div>
        <Link
          href="/admin/complaints/whitelist"
          style={{
            height: "38px",
            padding: "0 18px",
            borderRadius: "8px",
            border: "1px solid #e0d8ce",
            background: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            color: "#6b5c52",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          Manage Whitelist
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px"
        }}
      >
        {[
          { label: "Open", value: counts.open, bg: "#fee2e2", color: "#991b1b" },
          { label: "In Progress", value: counts.inProgress, bg: "#dbeafe", color: "#1e40af" },
          { label: "High Priority (unresolved)", value: counts.high, bg: "#fef3c7", color: "#92400e" },
          { label: "Total", value: complaints.length, bg: "#f4f1ec", color: "#2c2420" }
        ].map((s) => (
          <div key={s.label} style={{ ...card, padding: "16px 18px", background: s.bg }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: s.color,
                marginBottom: "6px"
              }}
            >
              {s.label}
            </p>
            <p style={{ fontSize: "1.6rem", fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {["all", "OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "7px 16px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid",
              borderColor: statusFilter === s ? "#1e3a2f" : "#e0d8ce",
              background: statusFilter === s ? "#1e3a2f" : "#fff",
              color: statusFilter === s ? "#fffbf5" : "#6b5c52"
            }}
          >
            {s === "all" ? "All Status" : s.replace(/_/g, " ")}
          </button>
        ))}
        <span style={{ width: "1px", background: "#e0d8ce" }} />
        {["all", "HIGH", "MEDIUM", "LOW"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriorityFilter(p)}
            style={{
              padding: "7px 16px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid",
              borderColor: priorityFilter === p ? "#c8960a" : "#e0d8ce",
              background: priorityFilter === p ? "#c8960a" : "#fff",
              color: priorityFilter === p ? "#fff" : "#6b5c52"
            }}
          >
            {p === "all" ? "All Priority" : p}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#8a7060" }}>Loading...</p>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Title", "Raised By", "Priority", "Status", "Files", "Date", ""].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#faf8f5";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={{ ...tdSt, fontWeight: 600, color: "#2c2420", maxWidth: "280px" }}>{c.title}</td>
                    <td style={tdSt}>
                      <div>{c.raisedByName ?? c.raisedByEmail}</div>
                      <div style={{ fontSize: "11px", color: "#8a7060" }}>{c.raisedByEmail}</div>
                    </td>
                    <td style={tdSt}>
                      <Badge label={c.priority} style={PRIORITY_STYLE[c.priority]} />
                    </td>
                    <td style={tdSt}>
                      <Badge label={c.status} style={STATUS_STYLE[c.status]} />
                    </td>
                    <td style={tdSt}>{c.attachments.length > 0 ? `📎 ${c.attachments.length}` : "—"}</td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060", whiteSpace: "nowrap" }}>
                      {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td style={tdSt}>
                      <Link
                        href={`/admin/complaints/${c.id}`}
                        style={{ fontSize: "13px", fontWeight: 600, color: "#c8960a", textDecoration: "none" }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {complaints.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8a7060" }}>
                      No complaints found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
