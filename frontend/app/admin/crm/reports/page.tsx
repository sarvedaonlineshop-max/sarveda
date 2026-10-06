"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { crmApi } from "@/lib/crm-api";
import { CrmTabs, DateText, Empty, crmCard } from "@/components/admin/crm/CrmPrimitives";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";

export default function CrmReportsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof crmApi.report>> | null>(null);
  const [error, setError] = useState("");
  useAdminPageHeader(() => ({ title: "CRM Reports", icon: "▤", subtitle: <>Where leads come from, and which follow-ups are late.</> }), []);
  useEffect(() => {
    crmApi.report().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div>
      <CrmTabs active="Reports" />
      {error ? <div style={{ ...crmCard, padding: 14, color: "#a94442" }}>{error}</div> : null}
      {data ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ ...crmCard, padding: 16 }}><small>Leads</small><div style={{ fontSize: 28, fontWeight: 800 }}>{data.totalLeads}</div></div>
            <div style={{ ...crmCard, padding: 16 }}><small>Became customers</small><div style={{ fontSize: 28, fontWeight: 800 }}>{data.convertedLeads}</div></div>
            <div style={{ ...crmCard, padding: 16 }}><small>Overdue follow-ups</small><div style={{ fontSize: 28, fontWeight: 800 }}>{data.overdueCount}</div></div>
          </div>
          <div style={{ ...crmCard, overflowX: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Source", "Leads", "Converted"].map((h) => <th key={h} style={{ textAlign: "left", padding: 12, fontSize: 11, textTransform: "uppercase" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.source} style={{ borderTop: "1px solid var(--admin-card-border)" }}>
                    <td style={{ padding: 12 }}>{s.source.replaceAll("_", " ")}</td>
                    <td style={{ padding: 12 }}>{s.leads}</td>
                    <td style={{ padding: 12 }}>{s.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...crmCard, padding: 16 }}>
            {data.overdueFollowUps.length ? data.overdueFollowUps.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--admin-card-border)" }}>
                <div>
                  <strong>{t.title}</strong>
                  <div style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>
                    {t.lead ? <Link href={`/admin/crm/leads/${t.lead.id}`}>{t.lead.name}</Link> : "No lead"} · {t.assignedTo?.name || "Unassigned"}
                  </div>
                </div>
                <span style={{ color: "#a94442", fontSize: 12 }}><DateText value={t.dueAt} withTime /></span>
              </div>
            )) : <Empty title="No overdue follow-ups" body="Open tasks with a past due time will show here." />}
          </div>
        </>
      ) : !error ? <div style={{ padding: 40, textAlign: "center" }}>Loading report…</div> : null}
    </div>
  );
}
