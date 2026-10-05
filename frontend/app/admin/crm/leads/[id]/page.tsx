"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BadgeIndianRupee, Building2, CalendarClock, Mail, Phone, Sparkles } from "lucide-react";
import { crmApi, type CrmLead } from "@/lib/crm-api";
import {
  DateText,
  Empty,
  Initial,
  Money,
  SectionTitle,
  StatusPill,
  crmButton,
  crmCard,
  crmGhostButton,
  crmInput
} from "@/components/admin/crm/CrmPrimitives";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST"] as const;
const NOTE_TYPES = [
  { id: "CALL", label: "Call" },
  { id: "EMAIL", label: "Email" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "NOTE", label: "Note" }
] as const;

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]["id"]>("CALL");
  const [note, setNote] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [lostReason, setLostReason] = useState("");

  const load = () => crmApi.lead(id).then(setLead).catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, [id]);

  useAdminPageHeader(
    () => ({
      title: lead?.name || "Lead",
      icon: "◎",
      subtitle: <>{lead?.leadNumber || "CRM lead"}</>,
      actions: (
        <Link href="/admin/crm/leads" style={{ ...crmGhostButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          <ArrowLeft size={14} /> Leads
        </Link>
      )
    }),
    [lead]
  );

  if (error) return <div style={{ ...crmCard, padding: 20, color: "#a94442" }}>{error}</div>;
  if (!lead) return <div style={{ padding: 40, textAlign: "center", color: "var(--admin-text-muted)" }}>Loading lead…</div>;

  const convert = async () => {
    if (!confirm("Convert this lead into an account, contact and deal?")) return;
    setBusy(true);
    try {
      await crmApi.convertLead(lead.id);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not convert");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    if (status === "LOST" && !lostReason.trim() && !confirm("Mark this lead lost without a reason?")) return;
    setBusy(true);
    try {
      await crmApi.updateLead(lead.id, {
        status,
        ...(status === "LOST" && lostReason.trim() ? { lostReason: lostReason.trim() } : {})
      });
      setLostReason("");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    const body = note.trim();
    if (!body) return;
    setBusy(true);
    try {
      await crmApi.createActivity({
        type: noteType,
        subject: NOTE_TYPES.find((t) => t.id === noteType)?.label || "Note",
        body,
        leadId: lead.id,
        ...(lead.enquiryThread?.id ? { enquiryThreadId: lead.enquiryThread.id } : {})
      });
      if (lead.status === "NEW" && noteType !== "NOTE") {
        await crmApi.updateLead(lead.id, { status: "CONTACTED" });
      }
      setNote("");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not save the note");
    } finally {
      setBusy(false);
    }
  };

  const saveTask = async () => {
    const title = taskTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      await crmApi.createTask({
        title,
        leadId: lead.id,
        priority: "MEDIUM",
        ...(taskDue ? { dueAt: new Date(taskDue).toISOString() } : {})
      });
      setTaskTitle("");
      setTaskDue("");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not add the follow-up");
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[ReactNode, string, ReactNode]> = [
    [<Building2 key="company" size={15} />, "Company", lead.companyName || "—"],
    [<Mail key="email" size={15} />, "Email", lead.email || "—"],
    [<Phone key="phone" size={15} />, "Phone", lead.phone || "—"],
    [<BadgeIndianRupee key="potential" size={15} />, "Potential", <Money key="potential-money" paise={lead.estimatedValueInPaise} currency={lead.currency} />],
    [<CalendarClock key="follow" size={15} />, "Next follow-up", <DateText key="follow-date" value={lead.nextFollowUpAt} withTime />]
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Initial name={lead.name} />
          <div>
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>{lead.name}</h2>
              <StatusPill value={lead.status} />
            </div>
            <div style={{ fontSize: 12, color: "var(--admin-text-muted)", marginTop: 4 }}>
              {lead.companyName || "Individual lead"} · {lead.source}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {lead.enquiryThread?.id ? (
            <Link href={`/admin/chats/${lead.enquiryThread.id}`} style={{ ...crmGhostButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Open chat
            </Link>
          ) : null}
          {lead.status !== "CONVERTED" ? (
            <button disabled={busy} onClick={() => void convert()} style={crmButton}>
              <Sparkles size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
              {busy ? "Converting…" : "Convert lead"}
            </button>
          ) : lead.convertedDeal ? (
            <Link href="/admin/crm/pipeline" style={{ ...crmButton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              View converted deal
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,.7fr) minmax(0,1.5fr)", gap: 14 }} className="crm-detail-grid">
        <aside style={{ ...crmCard, padding: 16 }}>
          <SectionTitle>Lead summary</SectionTitle>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 90px 1fr", gap: 7, padding: "10px 0", borderBottom: "1px solid var(--admin-card-border,#d8e3dc)", fontSize: 12, alignItems: "center" }}>
              <span style={{ color: "#6d8577" }}>{r[0]}</span>
              <span style={{ color: "var(--admin-text-muted)" }}>{r[1]}</span>
              <strong style={{ overflowWrap: "anywhere" }}>{r[2]}</strong>
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <small style={{ color: "var(--admin-text-muted)", textTransform: "uppercase", fontWeight: 800 }}>Owner</small>
            <div style={{ marginTop: 5, fontSize: 13, fontWeight: 700 }}>{lead.owner?.name || lead.owner?.email || "Unassigned"}</div>
          </div>
          {lead.interestSummary ? (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 11, background: "rgba(28,53,42,.05)", fontSize: 13, lineHeight: 1.5 }}>{lead.interestSummary}</div>
          ) : null}
        </aside>
        <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {lead.status !== "CONVERTED" ? (
            <div style={{ ...crmCard, padding: 16 }}>
              <SectionTitle>Status</SectionTitle>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUSES.map((status) => (
                  <button key={status} disabled={busy || lead.status === status} onClick={() => void setStatus(status)} style={lead.status === status ? crmButton : crmGhostButton}>
                    {status.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
              <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Reason if marking lost" style={{ ...crmInput, width: "100%", marginTop: 10 }} />
            </div>
          ) : null}
          <div style={{ ...crmCard, padding: 16 }}>
            <SectionTitle>Log a conversation</SectionTitle>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--admin-text-muted)" }}>This saves a note on the lead. It does not send an email or WhatsApp.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {NOTE_TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => setNoteType(t.id)} style={noteType === t.id ? crmButton : crmGhostButton}>{t.label}</button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was said" style={{ ...crmInput, width: "100%", height: 80, paddingTop: 10 }} />
            <button disabled={busy || !note.trim()} onClick={() => void saveNote()} style={{ ...crmButton, marginTop: 8 }}>Save note</button>
          </div>
          <div style={{ ...crmCard, padding: 16 }}>
            <SectionTitle>Add follow-up</SectionTitle>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow-up title" style={{ ...crmInput, flex: "1 1 180px" }} />
              <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={crmInput} />
              <button disabled={busy || !taskTitle.trim()} onClick={() => void saveTask()} style={crmButton}>Add</button>
            </div>
          </div>
          <div style={{ ...crmCard, padding: 16 }}>
            <SectionTitle>Timeline</SectionTitle>
            {lead.activities?.length ? lead.activities.map((a, i) => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, padding: "8px 0" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ display: "block", width: 10, height: 10, borderRadius: 99, background: i === 0 ? "#b98a3e" : "#6f9580", marginTop: 4 }} />
                </div>
                <div>
                  <strong style={{ fontSize: 13 }}>{a.subject}</strong>
                  {a.body ? <p style={{ fontSize: 12, color: "var(--admin-text-muted)", margin: "3px 0" }}>{a.body}</p> : null}
                  <small style={{ color: "var(--admin-text-muted)" }}><DateText value={a.occurredAt} withTime /> · {a.type}</small>
                </div>
              </div>
            )) : <Empty title="No activity yet" body="Calls, notes and status changes will appear here." />}
          </div>
          <div style={{ ...crmCard, padding: 16 }}>
            <SectionTitle>Open follow-ups</SectionTitle>
            {lead.tasks?.length ? lead.tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--admin-card-border)" }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{t.title}</strong>
                  <div style={{ fontSize: 11, color: "var(--admin-text-muted)", marginTop: 3 }}>{t.priority} · {t.status}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--admin-text-muted)" }}><DateText value={t.dueAt} withTime /></span>
              </div>
            )) : <Empty title="No open tasks" body="This lead has no pending follow-ups." />}
          </div>
        </main>
      </div>
      <style jsx global>{`@media(max-width:800px){.crm-detail-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
