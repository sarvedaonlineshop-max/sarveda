"use client";

import { useEffect, useState } from "react";

type Coupon = {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrderInPaise: number;
  maxUsageTotal: number | null;
  maxUsagePerUser: number;
  usageCount: number;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  description: string | null;
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

const inputSt: React.CSSProperties = {
  width: "100%",
  height: "38px",
  padding: "0 12px",
  borderRadius: "8px",
  border: "1px solid #e0d8ce",
  fontSize: "13px",
  color: "#2c2420",
  outline: "none",
  boxSizing: "border-box" as const
};

const emptyForm = {
  code: "",
  type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
  value: "",
  minOrderInPaise: "0",
  maxUsageTotal: "",
  maxUsagePerUser: "1",
  validFrom: "",
  validUntil: "",
  isActive: true,
  description: ""
};

function valueForForm(c: Coupon): string {
  return c.type === "FIXED" ? String(c.value / 100) : String(c.value);
}

function valueForApi(type: "PERCENTAGE" | "FIXED", raw: string): number {
  const n = Number(raw);
  return type === "FIXED" ? Math.round(n * 100) : n;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/coupons", { credentials: "include" });
    const data = (await res.json()) as { coupons: Coupon[] };
    setCoupons(data.coupons ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setErr(null);
  }

  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code,
      type: c.type,
      value: valueForForm(c),
      minOrderInPaise: String(c.minOrderInPaise),
      maxUsageTotal: c.maxUsageTotal ? String(c.maxUsageTotal) : "",
      maxUsagePerUser: String(c.maxUsagePerUser),
      validFrom: c.validFrom ? new Date(c.validFrom).toISOString().slice(0, 16) : "",
      validUntil: c.validUntil ? new Date(c.validUntil).toISOString().slice(0, 16) : "",
      isActive: c.isActive,
      description: c.description ?? ""
    });
    setShowForm(true);
    setErr(null);
  }

  async function handleSave() {
    if (!form.code || !form.value) {
      setErr("Code and value are required");
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      code: form.code.toUpperCase(),
      type: form.type,
      value: valueForApi(form.type, form.value),
      minOrderInPaise: Number(form.minOrderInPaise) || 0,
      maxUsageTotal: form.maxUsageTotal ? Number(form.maxUsageTotal) : null,
      maxUsagePerUser: Number(form.maxUsagePerUser) || 1,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
      isActive: form.isActive,
      description: form.description || null
    };
    try {
      const url = editing ? `/api/admin/coupons/${editing.code}` : "/api/admin/coupons";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess(editing ? "Coupon updated!" : "Coupon created!");
      setShowForm(false);
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(code: string) {
    if (!confirm(`Deactivate ${code}?`)) return;
    await fetch(`/api/admin/coupons/${code}`, {
      method: "DELETE",
      credentials: "include"
    });
    await load();
  }

  const thSt: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8a7060",
    background: "#f9f7f4",
    textAlign: "left"
  };
  const tdSt: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: "13px",
    color: "#4a3f38",
    borderBottom: "1px solid #f0ece6"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Coupons</h1>
          <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
            {coupons.length} total · {coupons.filter((c) => c.isActive).length} active
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            height: "40px",
            padding: "0 20px",
            borderRadius: "8px",
            background: "#1e3a2f",
            color: "#fffbf5",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer"
          }}
        >
          + New Coupon
        </button>
      </div>

      {success && (
        <div
          style={{
            background: "#dcfce7",
            color: "#166534",
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "13px"
          }}
        >
          {success}
        </div>
      )}

      {showForm && (
        <div style={{ ...card, padding: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#2c2420", marginBottom: "16px" }}>
            {editing ? `Edit ${editing.code}` : "New Coupon"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Code *
              </span>
              <input
                value={form.code}
                style={inputSt}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="WELCOME5"
                disabled={!!editing}
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Type *
              </span>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as "PERCENTAGE" | "FIXED"
                  }))
                }
                style={{ ...inputSt }}
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </select>
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Value * {form.type === "PERCENTAGE" ? "(%)" : "(₹)"}
              </span>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                style={inputSt}
                placeholder="10"
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Min Order (₹)
              </span>
              <input
                type="number"
                value={String(Number(form.minOrderInPaise) / 100)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    minOrderInPaise: String(Number(e.target.value) * 100)
                  }))
                }
                style={inputSt}
                placeholder="0"
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Max Total Uses
              </span>
              <input
                type="number"
                value={form.maxUsageTotal}
                onChange={(e) => setForm((f) => ({ ...f, maxUsageTotal: e.target.value }))}
                style={inputSt}
                placeholder="Unlimited"
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Max Uses Per User
              </span>
              <input
                type="number"
                value={form.maxUsagePerUser}
                onChange={(e) => setForm((f) => ({ ...f, maxUsagePerUser: e.target.value }))}
                style={inputSt}
                placeholder="1"
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Valid From
              </span>
              <input
                type="datetime-local"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                style={inputSt}
              />
            </label>

            <label style={{ display: "block" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Valid Until
              </span>
              <input
                type="datetime-local"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                style={inputSt}
              />
            </label>

            <label style={{ display: "block", gridColumn: "1/-1" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#8a7060",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  display: "block",
                  marginBottom: "5px"
                }}
              >
                Description (internal note)
              </span>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={inputSt}
                placeholder="e.g. New customer welcome offer"
              />
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "#4a3f38"
              }}
            >
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          {err && (
            <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "12px" }}>{err}</p>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                height: "40px",
                padding: "0 24px",
                borderRadius: "8px",
                background: "#1e3a2f",
                color: "#fffbf5",
                fontWeight: 600,
                fontSize: "13px",
                border: "none",
                cursor: "pointer",
                opacity: saving ? 0.6 : 1
              }}
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Create"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                height: "40px",
                padding: "0 20px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                background: "#fff",
                fontSize: "13px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#8a7060" }}>Loading...</p>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Code", "Type", "Value", "Min Order", "Usage", "Valid Until", "Status", ""].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr
                    key={c.id}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#faf8f5";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={{ ...tdSt, fontWeight: 700, fontFamily: "monospace" }}>{c.code}</td>
                    <td style={tdSt}>{c.type}</td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>
                      {c.type === "PERCENTAGE" ? `${c.value}%` : `₹${c.value / 100}`}
                    </td>
                    <td style={tdSt}>
                      {c.minOrderInPaise > 0 ? `₹${c.minOrderInPaise / 100}` : "—"}
                    </td>
                    <td style={tdSt}>
                      {c.usageCount}
                      {c.maxUsageTotal ? ` / ${c.maxUsageTotal}` : " / ∞"}
                    </td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060" }}>
                      {c.validUntil
                        ? new Date(c.validUntil).toLocaleDateString("en-IN")
                        : "No expiry"}
                    </td>
                    <td style={tdSt}>
                      <span
                        style={{
                          background: c.isActive ? "#dcfce7" : "#f3f4f6",
                          color: c.isActive ? "#166534" : "#6b7280",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: "999px"
                        }}
                      >
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ ...tdSt, whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => openEdit(c)}
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#c8960a",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0
                        }}
                      >
                        Edit
                      </button>
                      {c.isActive && (
                        <button
                          onClick={() => void deactivate(c.code)}
                          style={{
                            fontSize: "13px",
                            color: "#8a7060",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            marginLeft: "14px",
                            padding: 0
                          }}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#8a7060",
                        fontSize: "13px"
                      }}
                    >
                      No coupons yet. Create your first one.
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
