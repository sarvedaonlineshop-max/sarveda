"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CircleCheckBig, Clock3, UserRoundPlus } from "lucide-react";
import { crmApi, type CrmSummary } from "@/lib/crm-api";
import { CrmTabs, DateText, Empty, Money, SectionTitle, crmButton, crmCard, StatusPill } from "@/components/admin/crm/CrmPrimitives";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";

export default function CrmOverviewPage() {
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; dueAt?: string | null }>>([]);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; subject: string; occurredAt: string }>>([]);
  const [error, setError] = useState("");

  useAdminPageHeader(
    () => ({
      title: "CRM",
      icon: "✦",
      subtitle: <>Turn conversations into lasting relationships.</>,
      actions: (
        <Link href="/admin/crm/leads?new=1" style={{ ...crmButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          + New lead
        </Link>
      )
    }),
    []
  );

  useEffect(() => {
    Promise.all([
      crmApi.summary(),
      crmApi.tasks({ page: 1, limit: 8, status: "OPEN" }),
      crmApi.activities({ page: 1, limit: 8 })
    ])
      .then(([s, t, a]) => {
        setSummary(s);
        setTasks(t.items || []);
        setActivities(a.items || []);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const overdue = summary?.followUpOverdueCount ?? 0;
  const kpis = [
    {
      label: "Open pipeline",
      value: <Money paise={summary?.openPipelineInPaise ?? 0} />,
      sub: `${summary?.openDealCount ?? 0} active deals`,
      icon: <BriefcaseBusiness size={18} />
    },
    {
      label: "Active leads",
      value: summary?.activeLeadCount ?? 0,
      sub: summary?.unassignedLeadCount ? `${summary.unassignedLeadCount} unassigned` : "Awaiting your team",
      icon: <UserRoundPlus size={18} />
    },
    {
      label: "Follow-ups",
      value: summary?.followUpOpenCount ?? 0,
      sub: overdue ? `${overdue} overdue` : "Nothing overdue",
      icon: <Clock3 size={18} />
    },
    {
      label: "Won deals",
      value: <Money paise={summary?.wonInPaise ?? 0} />,
      sub: `${summary?.wonDealCount ?? 0} closed won`,
      icon: <CircleCheckBig size={18} />
    }
  ];
  const stages = summary?.stages ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <CrmTabs active="Overview" />
      {error ? <div style={{ ...crmCard, padding: 16, color: "#a94442" }}>{error}</div> : null}
      {overdue > 0 ? (
        <Link href="/admin/crm/tasks?overdue=1" style={{ ...crmCard, padding: 14, color: "#a94442", fontWeight: 700, textDecoration: "none" }}>
          {overdue} follow-up{overdue === 1 ? " is" : "s are"} overdue. Open the task list.
        </Link>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ ...crmCard, padding: 17 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--admin-text-muted,#4a6b58)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
              <span>{k.label}</span>
              <span style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(28,53,42,.08)", color: "#1c352a" }}>{k.icon}</span>
            </div>
            <div style={{ fontSize: 27, fontWeight: 850, marginTop: 10, color: "var(--admin-text,#143026)", letterSpacing: "-.04em" }}>{k.value}</div>
            <div style={{ fontSize: 12, color: "var(--admin-text-muted,#4a6b58)", marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(280px,.75fr)", gap: 14 }} className="crm-overview-grid">
        <div style={{ ...crmCard, padding: 16 }}>
          <SectionTitle action={<Link href="/admin/crm/pipeline" style={{ fontSize: 12, fontWeight: 800, color: "#1c6a49" }}>View full pipeline →</Link>}>
            Sales pipeline
          </SectionTitle>
          {stages.length ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(stages.length, 4)}, minmax(170px,1fr))`, gap: 10, overflowX: "auto" }}>
              {stages.slice(0, 4).map((stage) => (
                <div key={stage.id} style={{ background: "rgba(28,53,42,.035)", border: "1px solid var(--admin-card-border,#c5d9cc)", borderRadius: 12, padding: 10, minWidth: 170 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
                    <strong style={{ fontSize: 12 }}>{stage.name}</strong>
                    <span style={{ fontSize: 11, color: "var(--admin-text-muted,#4a6b58)" }}>{stage.count}</span>
                  </div>
                  {stage.deals.map((d) => (
                    <Link key={d.id} href={`/admin/crm/deals/${d.id}`} style={{ display: "block", background: "var(--admin-card-bg,#fff)", border: "1px solid var(--admin-card-border,#d8e3dc)", borderRadius: 10, padding: 10, marginTop: 7, textDecoration: "none", color: "inherit" }}>
                      <strong style={{ display: "block", fontSize: 13 }}>{d.name}</strong>
                      <span style={{ fontSize: 12, color: "#1c6a49", fontWeight: 800 }}><Money paise={d.amountInPaise} currency={d.currency} /></span>
                      <div style={{ fontSize: 11, color: "var(--admin-text-muted,#4a6b58)", marginTop: 5 }}>{d.who}</div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Your pipeline is ready" body="Add your first deal to see the sales flow here." />
          )}
        </div>
        <div style={{ ...crmCard, padding: 16 }}>
          <SectionTitle>Upcoming follow-ups</SectionTitle>
          {tasks.length ? tasks.slice(0, 6).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--admin-card-border,#e3ece6)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: t.dueAt && new Date(t.dueAt) < new Date() ? "#b4534c" : "#b98a3e" }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</strong>
                <span style={{ fontSize: 11, color: "var(--admin-text-muted,#4a6b58)" }}><DateText value={t.dueAt} withTime /></span>
              </div>
            </div>
          )) : <Empty title="No follow-ups due" body="Your open CRM tasks will appear here." />}
        </div>
      </div>
      <div style={{ ...crmCard, padding: 16 }}>
        <SectionTitle>Recent CRM activity</SectionTitle>
        {activities.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 8 }}>
            {activities.slice(0, 8).map((a) => (
              <div key={a.id} style={{ padding: 11, borderRadius: 11, background: "rgba(28,53,42,.035)", border: "1px solid var(--admin-card-border,#d8e3dc)" }}>
                <StatusPill value={a.type} />
                <strong style={{ display: "block", fontSize: 13, marginTop: 8 }}>{a.subject}</strong>
                <span style={{ fontSize: 11, color: "var(--admin-text-muted,#4a6b58)" }}><DateText value={a.occurredAt} withTime /></span>
              </div>
            ))}
          </div>
        ) : <Empty title="No activity yet" body="Calls, notes, conversions and deal changes will build this timeline." />}
      </div>
      <style jsx global>{`@media(max-width:900px){.crm-overview-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
