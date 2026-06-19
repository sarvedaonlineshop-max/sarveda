"use client";

import Link from "next/link";
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-stone-900 dark:text-stone-100">Pickup Locations</h1>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Manage facilities like Delhivery One. The <strong>Delhivery facility name</strong> must match your Delhivery
            dashboard exactly — used as <code className="text-xs">pickup_location</code> when creating AWBs.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="h-10 shrink-0 rounded-lg bg-stone-900 px-5 text-sm font-semibold text-amber-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
        >
          Add New Pickup Location
        </button>
      </div>

      {err ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {err}
        </p>
      ) : null}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 p-4 dark:border-stone-700">
          <div className="relative min-w-[14rem] flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pickup location, city"
              className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm dark:border-stone-600 dark:bg-stone-950"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {items.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-stone-500">
            No pickup locations yet. Add your Mysore / Moradabad facilities first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
                <tr>
                  {["Pickup location", "Created on", "Status", "City", "State", ""].map((h) => (
                    <th
                      key={h || "actions"}
                      className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-stone-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {items.map((row) => (
                  <tr key={row.id} className={row.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {facilityDisplay(row)}
                      {row.isPrimary ? (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                          Primary
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      {row.isActive ? (
                        <span className="font-semibold text-green-700 dark:text-green-400">Active</span>
                      ) : (
                        <span className="text-stone-500">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{row.city ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{row.state ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="text-sm font-semibold text-amber-800 hover:underline dark:text-amber-400"
                        >
                          Edit
                        </button>
                        {row.isActive ? (
                          <button
                            type="button"
                            onClick={() => setDeactivateId(row.id)}
                            className="text-sm font-semibold text-red-700 hover:underline dark:text-red-400"
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
