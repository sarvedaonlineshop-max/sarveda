"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  PickupLocationModal,
  type PickupLocationDraft
} from "@/components/admin/PickupLocationModal";
import {
  deleteAdminPickupLocation,
  fetchAdminPickupLocations,
  patchAdminPickupLocation,
  postAdminPickupLocation,
  type AdminPickupLocationRow
} from "@/lib/admin-api";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

function facilityDisplay(row: AdminPickupLocationRow): string {
  return row.delhiveryPickupName?.trim() || row.label;
}

export default function AdminPickupLocationsPage() {
  const [items, setItems] = useState<AdminPickupLocationRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPickupLocationRow | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await fetchAdminPickupLocations({
        q: search.trim() || undefined,
        status: statusFilter || undefined
      });
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: AdminPickupLocationRow) {
    setEditing(row);
    setModalOpen(true);
  }

  async function handleSave(draft: PickupLocationDraft) {
    if (!draft.label.trim() || !draft.shiprocketPickupName.trim()) return;
    setBusy(true);
    setErr(null);
    const body = {
      label: draft.label.trim(),
      shiprocketPickupName: draft.shiprocketPickupName.trim(),
      delhiveryPickupName: draft.delhiveryPickupName?.trim() || draft.label.trim(),
      contactPerson: draft.contactPerson?.trim() || undefined,
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
      line1: draft.line1?.trim() || undefined,
      line2: draft.line2?.trim() || undefined,
      city: draft.city?.trim() || undefined,
      state: draft.state?.trim() || undefined,
      postalCode: draft.postalCode?.trim() || undefined,
      country: draft.country?.trim() || "IN",
      defaultPickupSlot: draft.defaultPickupSlot?.trim() || undefined,
      workingDays: draft.workingDays?.length ? draft.workingDays : undefined,
      returnSameAsPickup: draft.returnSameAsPickup ?? true,
      returnLine1: draft.returnLine1?.trim() || undefined,
      returnLine2: draft.returnLine2?.trim() || undefined,
      returnCity: draft.returnCity?.trim() || undefined,
      returnState: draft.returnState?.trim() || undefined,
      returnPostalCode: draft.returnPostalCode?.trim() || undefined,
      returnCountry: draft.returnCountry?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
      isPrimary: draft.isPrimary ?? false,
      isActive: draft.isActive !== false
    };
    try {
      if (editing) {
        await patchAdminPickupLocation(editing.id, body);
      } else {
        await postAdminPickupLocation(body);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeactivate() {
    const id = deactivateId;
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAdminPickupLocation(id);
      setDeactivateId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminConfirmModal
        open={deactivateId !== null}
        title="Deactivate pickup location?"
        message="It will no longer appear for new shipments. Existing shipment records keep their facility."
        confirmLabel="Deactivate"
        danger
        busy={busy}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => void confirmDeactivate()}
      />

      <PickupLocationModal
        open={modalOpen}
        editing={editing}
        busy={busy}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />

      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div>
          <h1 style={{ color: "#faf5ec", fontSize: "26px", fontWeight: 800, margin: 0 }}>📍 Pickup Locations</h1>
          <p style={{ color: "#a8c4b0", fontSize: "13px", maxWidth: "500px", marginTop: "6px", marginBottom: 0 }}>
            Manage facilities like Delhivery One. The <strong>Delhivery facility name</strong> must match your Delhivery
            dashboard exactly — used as <code style={{ fontSize: "11px" }}>pickup_location</code> when creating AWBs.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          style={{
            background: "linear-gradient(135deg, #b98a3e, #c8960a)",
            color: "#fff",
            fontWeight: 700,
            borderRadius: "10px",
            border: "none",
            padding: "10px 20px",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(185,138,62,0.35)",
            flexShrink: 0
          }}
        >
          📍 Add New Pickup Location
        </button>
      </div>

      {err ? (
        <p
          role="alert"
          style={{
            background: "#fef2f2",
            borderLeft: "3px solid #dc2626",
            borderRadius: "10px",
            padding: "10px 14px",
            color: "#dc2626",
            fontSize: "13px",
            margin: 0
          }}
        >
          ⚠️ {err}
        </p>
      ) : null}

      <div
        style={{
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid #e8e2d9",
          boxShadow: "0 4px 20px rgba(28,53,42,0.08)"
        }}
      >
        <div
          className="flex flex-wrap items-center gap-3"
          style={{ background: "linear-gradient(180deg, #f9f7f4, #fff)", borderBottom: "1px solid #f0ece6", padding: "14px 18px" }}
        >
          <div className="relative min-w-[14rem] flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pickup location, city"
              style={{
                width: "100%",
                height: "38px",
                padding: "0 12px 0 36px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                fontSize: "13px",
                color: "#2c2420",
                outline: "none",
                background: "#fff"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#b98a3e";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e0d8ce";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8a7060" }}>
              ⌕
            </span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            style={{
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              fontSize: "13px",
              color: "#2c2420",
              background: "#fff",
              outline: "none"
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#b98a3e";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e0d8ce";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "60px 40px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📍</div>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#1c352a", margin: 0 }}>No pickup locations yet</p>
            <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
              Add your Mysore / Moradabad facilities first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead style={{ background: "linear-gradient(180deg, #f2ede5, #f9f7f4)" }}>
                <tr>
                  {["Pickup location", "Created on", "Status", "City", "State", ""].map((h) => (
                    <th
                      key={h || "actions"}
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#8a7060",
                        padding: "11px 16px"
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    style={{ opacity: row.isActive ? 1 : 0.6 }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#faf5ec";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "";
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600, color: "#1c352a", borderBottom: "1px solid #f0ece6" }}>
                      {facilityDisplay(row)}
                      {row.isPrimary ? (
                        <span
                          style={{
                            background: "linear-gradient(135deg, #1c352a, #2d5040)",
                            color: "#faf5ec",
                            borderRadius: "999px",
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            marginLeft: "6px"
                          }}
                        >
                          Primary
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" }}>
                      {formatDate(row.createdAt)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" }}>
                      {row.isActive ? (
                        <span
                          style={{
                            background: "#f0fdf4",
                            color: "#16a34a",
                            borderRadius: "999px",
                            padding: "3px 10px",
                            fontSize: "11px",
                            fontWeight: 700,
                            border: "1px solid rgba(34,197,94,0.2)"
                          }}
                        >
                          ● Active
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#f5f0e8",
                            color: "#8a7060",
                            borderRadius: "999px",
                            padding: "3px 10px",
                            fontSize: "11px"
                          }}
                        >
                          Inactive
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" }}>
                      {row.city ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" }}>
                      {row.state ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" }}>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          style={{
                            color: "#b98a3e",
                            background: "#faf5ec",
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "12px",
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                            transition: "all 0.15s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#b98a3e";
                            e.currentTarget.style.color = "#fff";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#faf5ec";
                            e.currentTarget.style.color = "#b98a3e";
                          }}
                        >
                          Edit
                        </button>
                        {row.isActive ? (
                          <button
                            type="button"
                            onClick={() => setDeactivateId(row.id)}
                            style={{
                              color: "#dc2626",
                              background: "none",
                              border: "none",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#b91c1c";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "#dc2626";
                            }}
                          >
                            Deactivate
                          </button>
                        ) : null}
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
