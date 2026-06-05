"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { deleteAdminPickupLocation, fetchAdminPickupLocations, patchAdminPickupLocation, postAdminPickupLocation, type AdminPickupLocationRow } from "@/lib/admin-api";

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)", padding: "20px 24px" };
const inputSt: React.CSSProperties = { width: "100%", height: "38px", padding: "0 12px", borderRadius: "8px", border: "1px solid #e0d8ce", fontSize: "13px", background: "#fff", color: "#2c2420", outline: "none", boxSizing: "border-box" as const };
const labelSt: React.CSSProperties = { fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#8a7060", display: "block", marginBottom: "6px" };
const thSt: React.CSSProperties = { padding: "10px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#8a7060", background: "#f9f7f4", textAlign: "left" as const };
const tdSt: React.CSSProperties = { padding: "12px 14px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

export default function AdminPickupLocationsPage() {
  const [items, setItems] = useState<AdminPickupLocationRow[]>([]);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [label, setLabel] = useState(""); const [shiprocketPickupName, setShiprocketPickupName] = useState("");
  const [city, setCity] = useState(""); const [state, setState] = useState(""); const [postalCode, setPostalCode] = useState("");
  const [line1, setLine1] = useState(""); const [isPrimaryNew, setIsPrimaryNew] = useState(false); const [sortOrderNew, setSortOrderNew] = useState(0);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems(await fetchAdminPickupLocations()); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !shiprocketPickupName.trim()) return;
    setBusy(true); setErr(null);
    try {
      await postAdminPickupLocation({ label: label.trim(), shiprocketPickupName: shiprocketPickupName.trim(), city: city.trim() || undefined, state: state.trim() || undefined, postalCode: postalCode.trim() || undefined, line1: line1.trim() || undefined, isPrimary: isPrimaryNew, sortOrder: sortOrderNew });
      setLabel(""); setShiprocketPickupName(""); setCity(""); setState(""); setPostalCode(""); setLine1(""); setIsPrimaryNew(false); setSortOrderNew(0);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function setPrimary(id: string) {
    setBusy(true); setErr(null);
    try { await patchAdminPickupLocation(id, { isPrimary: true, isActive: true }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  }

  async function confirmDeactivate() {
    const id = deactivateId; if (!id) return;
    setBusy(true); setErr(null);
    try { await deleteAdminPickupLocation(id); setDeactivateId(null); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Deactivate failed"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <AdminConfirmModal open={deactivateId !== null} title="Deactivate warehouse?" message="It will no longer appear for new shipments. Existing shipment records keep their label." confirmLabel="Deactivate" danger busy={busy} onClose={() => setDeactivateId(null)} onConfirm={() => void confirmDeactivate()} />

      <div>
        <Link href="/admin" style={{ fontSize: "13px", color: "#c8960a", textDecoration: "none" }}>← Dashboard</Link>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420", marginTop: "8px" }}>Warehouses</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px", maxWidth: "560px" }}>
          The <strong>Shiprocket warehouse name</strong> must match the pickup name in your Shiprocket dashboard exactly.
        </p>
      </div>

      {err && <p style={{ color: "#dc2626", fontSize: "13px", padding: "10px 14px", background: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca" }} role="alert">{err}</p>}

      {/* Add form */}
      <form onSubmit={(e) => void handleAdd(e)} style={card}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#2c2420", marginBottom: "16px" }}>Add Warehouse</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <label style={{ display: "block" }}><span style={labelSt}>Display label</span><input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mysore (primary)" style={inputSt} /></label>
          <label style={{ display: "block" }}><span style={labelSt}>Shiprocket pickup name</span><input required value={shiprocketPickupName} onChange={(e) => setShiprocketPickupName(e.target.value)} placeholder="Primary" style={{ ...inputSt, fontFamily: "monospace" }} /></label>
          <label style={{ display: "block", gridColumn: "1/-1" }}><span style={labelSt}>Address line</span><input value={line1} onChange={(e) => setLine1(e.target.value)} style={inputSt} /></label>
          <label style={{ display: "block", gridColumn: "1/-1" }}>
            <span style={labelSt}>City / State / PIN</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={inputSt} />
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" style={inputSt} />
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="PIN" style={{ ...inputSt, width: "120px", flex: "0 0 120px" }} />
            </div>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#4a3f38" }}>
            <input type="checkbox" checked={isPrimaryNew} onChange={(e) => setIsPrimaryNew(e.target.checked)} />
            Set as primary default
          </label>
        </div>
        <button type="submit" disabled={busy} style={{ marginTop: "16px", height: "40px", padding: "0 24px", borderRadius: "8px", background: "#1e3a2f", color: "#fffbf5", fontSize: "13px", fontWeight: 600, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving..." : "Add Warehouse"}
        </button>
      </form>

      {/* Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e8e2d9" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420" }}>All Locations</h2>
        </div>
        {items.length === 0 ? (
          <p style={{ padding: "32px 20px", textAlign: "center", fontSize: "13px", color: "#8a7060" }}>No warehouses yet — add Mysore as primary first.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {["Label","Shiprocket Name","City","Primary","Active","Actions"].map((h) => <th key={h} style={thSt}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ opacity: row.isActive ? 1 : 0.5 }}>
                    <td style={{ ...tdSt, fontWeight: 600, color: "#2c2420" }}>{row.label}</td>
                    <td style={{ ...tdSt, fontFamily: "monospace", fontSize: "12px" }}>{row.shiprocketPickupName}</td>
                    <td style={tdSt}>{[row.city, row.state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={tdSt}>{row.isPrimary ? <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>Primary</span> : "—"}</td>
                    <td style={tdSt}>{row.isActive ? <span style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>Active</span> : <span style={{ background: "#f3f4f6", color: "#6b7280", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>Inactive</span>}</td>
                    <td style={tdSt}>
                      <div style={{ display: "flex", gap: "12px" }}>
                        {row.isActive && !row.isPrimary && <button type="button" disabled={busy} onClick={() => void setPrimary(row.id)} style={{ fontSize: "13px", fontWeight: 600, color: "#c8960a", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Set primary</button>}
                        {row.isActive && <button type="button" disabled={busy} onClick={() => setDeactivateId(row.id)} style={{ fontSize: "13px", fontWeight: 600, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Deactivate</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
