"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WhitelistEntry = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  addedAt: string;
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

export default function ComplaintWhitelistPage() {
  const [list, setList] = useState<WhitelistEntry[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/complaints/admin/whitelist", { credentials: "include" });
    const data = (await res.json()) as { whitelist?: WhitelistEntry[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load whitelist");
    }
    setList(data.whitelist ?? []);
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load whitelist");
    });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    const payload = { email: email.trim(), name: name.trim() || undefined };
    try {
      const res = await fetch("/api/complaints/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => ({}))) as {
        entry?: WhitelistEntry;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to add email");
      }
      setEmail("");
      setName("");
      if (data.entry) {
        setList((prev) => [data.entry!, ...prev.filter((row) => row.id !== data.entry!.id)]);
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this person's access?")) return;
    const res = await fetch(`/api/complaints/admin/whitelist/${id}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Failed to remove email");
      return;
    }
    setList((prev) => prev.map((row) => (row.id === id ? { ...row, isActive: false } : row)));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
      <Link href="/admin/complaints" style={{ fontSize: "13px", color: "#c8960a", textDecoration: "none" }}>
        ← All complaints
      </Link>

      <div>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#2c2420" }}>App Access Whitelist</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          Only these emails can log in to the complaint app
        </p>
      </div>

      <form onSubmit={(e) => void handleAdd(e)} style={{ ...card, padding: "20px 24px" }}>
        {error ? <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "10px" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="employee@gmail.com"
            style={{
              flex: 1,
              minWidth: "200px",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              fontSize: "13px"
            }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            style={{
              flex: 1,
              minWidth: "150px",
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              fontSize: "13px"
            }}
          />
          <button
            type="submit"
            disabled={saving}
            style={{
              height: "38px",
              padding: "0 20px",
              borderRadius: "8px",
              background: "#1e3a2f",
              color: "#fffbf5",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              opacity: saving ? 0.6 : 1
            }}
          >
            Add
          </button>
        </div>
      </form>

      <div style={{ ...card, overflow: "hidden" }}>
        {list
          .filter((l) => l.isActive)
          .map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderBottom: "1px solid #f0ece6"
              }}
            >
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#2c2420" }}>
                  {entry.name ?? entry.email}
                </p>
                <p style={{ fontSize: "12px", color: "#8a7060" }}>{entry.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(entry.id)}
                style={{
                  fontSize: "13px",
                  color: "#dc2626",
                  background: "none",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Remove
              </button>
            </div>
          ))}
        {list.filter((l) => l.isActive).length === 0 && (
          <p style={{ padding: "30px", textAlign: "center", color: "#8a7060", fontSize: "13px" }}>
            No one added yet. Add your team members above.
          </p>
        )}
      </div>
    </div>
  );
}
