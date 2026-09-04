"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

export default function AdminReturnAnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Array<{ key: string; valueJson: unknown }>>([]);
  const [overdue, setOverdue] = useState<Array<{ caseNumber: string; orderNumber: string; status: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, c, o] = await Promise.all([
      fetch(`${getApiBase()}/api/admin/return-analytics`, { credentials: "include" }).then((r) =>
        r.json()
      ),
      fetch(`${getApiBase()}/api/admin/return-policy-config`, { credentials: "include" }).then((r) =>
        r.json()
      ),
      fetch(`${getApiBase()}/api/admin/return-cases/overdue`, { credentials: "include" }).then((r) =>
        r.json()
      )
    ]);
    setData((a as { data?: Record<string, unknown> }).data ?? null);
    setConfigs(((c as { data?: { configs: Array<{ key: string; valueJson: unknown }> } }).data?.configs) ?? []);
    setOverdue(((o as { data?: { rows: typeof overdue } }).data?.rows) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div style={{ padding: 24 }}>Loading return analytics…</div>;
  if (!data) return <div style={{ padding: 24 }}>No analytics data.</div>;

  const counts = data.counts as Record<string, { value: number; key: string }>;
  const flags = (data.flags as Array<{ code: string; message: string }>) ?? [];
  const returnRate = data.returnRate as { value: number | null; status: string; note?: string };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Returns intelligence</h1>
      <p style={{ color: "#6b635b", fontSize: 13, marginBottom: 16 }}>
        Lookback {String(data.lookbackDays)} days · metrics document numerator/denominator · no invented rates
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        {Object.values(counts).map((c) => (
          <Link
            key={c.key}
            href={`/admin/returns?stage=${encodeURIComponent(
              c.key === "pending_approval"
                ? "PENDING_APPROVAL"
                : c.key === "more_info"
                  ? "MORE_INFO_REQUIRED"
                  : c.key === "refund_pending"
                    ? "REFUND_PENDING"
                    : c.key === "rejected"
                      ? "REJECTED"
                      : "all"
            )}`}
            style={{
              background: "#fff",
              border: "1px solid #e8e2d9",
              borderRadius: 10,
              padding: 14,
              textDecoration: "none",
              color: "inherit"
            }}
          >
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase" }}>
              {c.key.replace(/_/g, " ")}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </Link>
        ))}
        <div style={{ background: "#fff", border: "1px solid #e8e2d9", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#888" }}>RETURN RATE %</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {returnRate.status === "OK" ? returnRate.value : "n/a"}
          </div>
          {returnRate.note ? <div style={{ fontSize: 11, color: "#a00" }}>{returnRate.note}</div> : null}
        </div>
      </div>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Overdue / attention</h2>
      {overdue.length === 0 ? (
        <p style={{ color: "#888", fontSize: 13 }}>No overdue cases.</p>
      ) : (
        <ul style={{ fontSize: 13 }}>
          {overdue.map((r) => (
            <li key={r.caseNumber}>
              <Link href={`/admin/returns/${encodeURIComponent(r.caseNumber)}`}>
                {r.caseNumber}
              </Link>{" "}
              · {r.orderNumber} · {r.status}
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Flags</h2>
      {flags.length === 0 ? (
        <p style={{ color: "#888", fontSize: 13 }}>No alert flags.</p>
      ) : (
        <ul style={{ fontSize: 13 }}>
          {flags.map((f) => (
            <li key={f.code + f.message}>{f.message}</li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Policy config</h2>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <tbody>
          {configs.map((c) => (
            <tr key={c.key} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 8, fontWeight: 600 }}>{c.key}</td>
              <td style={{ padding: 8 }}>{JSON.stringify(c.valueJson)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Inventory recovery</h2>
      <pre style={{ background: "#f7f4ef", padding: 12, borderRadius: 8, fontSize: 12, overflow: "auto" }}>
        {JSON.stringify(data.inventoryRecovery, null, 2)}
      </pre>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Claims</h2>
      <pre style={{ background: "#f7f4ef", padding: 12, borderRadius: 8, fontSize: 12, overflow: "auto" }}>
        {JSON.stringify({ courier: data.courierClaims, vendor: data.vendorClaims }, null, 2)}
      </pre>
    </div>
  );
}
