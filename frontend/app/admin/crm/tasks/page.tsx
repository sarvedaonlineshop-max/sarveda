"use client";

import { useCallback, useEffect, useState } from "react";
import { crmApi } from "@/lib/crm-api";
import { CrmTabs, DateText, Empty, StatusPill, crmButton, crmCard, crmGhostButton } from "@/components/admin/crm/CrmPrimitives";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import { useAdminUser } from "@/components/admin/AdminUserContext";

export default function Page() {
  const admin = useAdminUser();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [mine, setMine] = useState(false);

  useAdminPageHeader(() => ({ title: "CRM Tasks", icon: "✓", subtitle: <>Follow-ups that keep opportunities moving.</> }), []);

  const load = useCallback(() => {
    crmApi.tasks({
      page: 1,
      limit: 100,
      overdue: overdue || undefined,
      assignedToUserId: mine && admin?.id ? admin.id : undefined
    }).then((r) => setItems(r.items || [])).catch((e: Error) => setError(e.message));
  }, [overdue, mine, admin?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("overdue") === "1") setOverdue(true);
  }, []);

  const complete = async (id: string, status: string) => {
    await crmApi.updateTask(id, { status: status === "COMPLETED" ? "OPEN" : "COMPLETED" });
    load();
  };

  return (
    <div>
      <CrmTabs active="Tasks" />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setOverdue(false)} style={overdue ? crmGhostButton : crmButton}>Open tasks</button>
        <button type="button" onClick={() => setOverdue(true)} style={overdue ? crmButton : crmGhostButton}>Overdue</button>
        <button type="button" onClick={() => setMine((v) => !v)} style={mine ? crmButton : crmGhostButton}>Mine</button>
      </div>
      {error ? <div style={{ ...crmCard, padding: 14, color: "#a94442" }}>{error}</div> : null}
      <div style={{ ...crmCard, padding: 14 }}>
        {items.length ? items.map((t) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 12, padding: "12px 2px", borderBottom: "1px solid var(--admin-card-border)" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{t.title}</strong>
              <div style={{ fontSize: 11, color: t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "COMPLETED" ? "#a94442" : "var(--admin-text-muted)", marginTop: 3 }}>
                {t.priority} · <DateText value={t.dueAt} withTime />
              </div>
            </div>
            <StatusPill value={t.status} />
            <button onClick={() => complete(t.id, t.status)} style={crmGhostButton}>{t.status === "COMPLETED" ? "Reopen" : "Complete"}</button>
          </div>
        )) : <Empty title={overdue ? "Nothing overdue" : "No CRM tasks"} body="Follow-up calls, meetings and reminders will appear here." />}
      </div>
    </div>
  );
}
