"use client";

import { useEffect, useState } from "react";
import { crmApi } from "@/lib/crm-api";
import { crmButton, crmCard, crmGhostButton, crmInput } from "./CrmPrimitives";

export function CrmNewRecord({ kind, onCreated }: { kind: "Deals" | "Contacts" | "Companies"; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");

  useEffect(() => {
    if (kind !== "Deals" || !open) return;
    crmApi.pipelines().then((rows) => {
      const pipeline = rows.find((p) => p.isDefault) || rows[0];
      const stage = pipeline?.stages.filter((s) => s.isActive).sort((a, b) => a.position - b.position)[0];
      setPipelineId(pipeline?.id || "");
      setStageId(stage?.id || "");
    }).catch((e: Error) => setError(e.message));
  }, [kind, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "Deals") {
        await crmApi.createDeal({
          name: name.trim(),
          pipelineId,
          stageId,
          amountInPaise: amount.trim() ? Math.round(Number(amount) * 100) : 0
        });
      } else if (kind === "Contacts") {
        await crmApi.createContact({ displayName: name.trim(), email: email || undefined, phone: phone || undefined });
      } else {
        await crmApi.createAccount({ name: name.trim(), email: email || undefined, phone: phone || undefined });
      }
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setAmount("");
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <button type="button" style={crmButton} onClick={() => setOpen(true)}>+ New {kind === "Companies" ? "company" : kind === "Contacts" ? "contact" : "deal"}</button>
      {open ? (
        <form onSubmit={submit} style={{ ...crmCard, padding: 16, marginTop: 10, display: "grid", gap: 8 }}>
          {error ? <p style={{ color: "#a94442", margin: 0 }}>{error}</p> : null}
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "Contacts" ? "Contact name" : "Name"} style={crmInput} />
          {kind !== "Deals" ? (
            <>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={crmInput} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={crmInput} />
            </>
          ) : (
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" placeholder="Value ₹" style={crmInput} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} style={crmButton}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" style={crmGhostButton} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
