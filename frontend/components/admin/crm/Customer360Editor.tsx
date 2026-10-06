"use client";

import { useState } from "react";
import { crmApi } from "@/lib/crm-api";
import { crmButton, crmCard, crmInput } from "./CrmPrimitives";

export function Customer360Editor({
  kind,
  entity,
  onSaved
}: {
  kind: "contact" | "account";
  entity: { id: string; displayName?: string; name?: string; email?: string | null; phone?: string | null; notes?: string | null };
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(entity.email ?? "");
  const [phone, setPhone] = useState(entity.phone ?? "");
  const [notes, setNotes] = useState(entity.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const body = { email: email.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null };
      if (kind === "contact") await crmApi.updateContact(entity.id, body);
      else await crmApi.updateAccount(entity.id, body);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...crmCard, padding: 16, marginBottom: 14 }}>
      <strong>Edit contact details</strong>
      {error ? <p style={{ color: "#a94442" }}>{error}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 10 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={crmInput} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={crmInput} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" style={{ ...crmInput, gridColumn: "1 / -1" }} />
      </div>
      <button disabled={busy} onClick={() => void save()} style={{ ...crmButton, marginTop: 10 }}>{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}
