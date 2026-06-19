"use client";

import { useEffect, useState } from "react";
import type { AdminPickupLocationInput, AdminPickupLocationRow } from "@/lib/admin-api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const PICKUP_SLOTS = [
  "Morning 09:00:00 - 13:00:00",
  "Afternoon 13:00:00 - 17:00:00",
  "Evening 14:00:00 - 18:00:00"
];

export type PickupLocationDraft = AdminPickupLocationInput & { isActive?: boolean };

const emptyDraft = (): PickupLocationDraft => ({
  label: "",
  shiprocketPickupName: "",
  delhiveryPickupName: "",
  contactPerson: "",
  phone: "",
  email: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "IN",
  defaultPickupSlot: PICKUP_SLOTS[2],
  workingDays: [...WEEKDAYS],
  returnSameAsPickup: true,
  returnLine1: "",
  returnLine2: "",
  returnCity: "",
  returnState: "",
  returnPostalCode: "",
  returnCountry: "IN",
  notes: "",
  isPrimary: false,
  isActive: true
});

function rowToDraft(row: AdminPickupLocationRow): PickupLocationDraft {
  return {
    label: row.label,
    shiprocketPickupName: row.shiprocketPickupName,
    delhiveryPickupName: row.delhiveryPickupName ?? "",
    contactPerson: row.contactPerson ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    line1: row.line1 ?? "",
    line2: row.line2 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country || "IN",
    defaultPickupSlot: row.defaultPickupSlot ?? PICKUP_SLOTS[2],
    workingDays: (row.workingDays as string[] | null) ?? [...WEEKDAYS],
    returnSameAsPickup: row.returnSameAsPickup,
    returnLine1: row.returnLine1 ?? "",
    returnLine2: row.returnLine2 ?? "",
    returnCity: row.returnCity ?? "",
    returnState: row.returnState ?? "",
    returnPostalCode: row.returnPostalCode ?? "",
    returnCountry: row.returnCountry ?? "IN",
    notes: row.notes ?? "",
    isPrimary: row.isPrimary,
    isActive: row.isActive
  };
}

type Props = {
  open: boolean;
  editing: AdminPickupLocationRow | null;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: PickupLocationDraft) => Promise<void>;
};

export function PickupLocationModal({ open, editing, busy, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<PickupLocationDraft>(emptyDraft());

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? rowToDraft(editing) : emptyDraft());
  }, [open, editing]);

  if (!open) return null;

  function set<K extends keyof PickupLocationDraft>(key: K, value: PickupLocationDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleDay(day: string) {
    setDraft((d) => {
      const days = d.workingDays ?? [];
      const next = days.includes(day) ? days.filter((x) => x !== day) : [...days, day];
      return { ...d, workingDays: next };
    });
  }

  const locationHint = [draft.city, draft.state, draft.country || "IN"].filter(Boolean).join(", ");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSave(draft);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-modal-title"
        className="w-full max-w-2xl rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 dark:border-stone-700">
          <h2 id="pickup-modal-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            {editing ? "Edit Pickup Location" : "Add Pickup Location"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-5">
          <div className="mb-6 rounded-lg border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/50">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Domestic Pickup Location</p>
            <p className="mt-1 text-xs text-stone-500">Used for Delhivery &amp; Shiprocket pickup requests.</p>
            <div className="mt-3 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={draft.isActive !== false}
                  onChange={() => set("isActive", true)}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={draft.isActive === false}
                  onChange={() => set("isActive", false)}
                />
                Inactive
              </label>
            </div>
          </div>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Address Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Facility name *
                </span>
                <input
                  required
                  value={draft.label}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="SARVEDA LIFE PRIVATE LIMITED"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Delhivery facility name *
                </span>
                <input
                  required
                  value={draft.delhiveryPickupName ?? ""}
                  onChange={(e) => set("delhiveryPickupName", e.target.value)}
                  placeholder="Must match Delhivery One exactly"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Shiprocket warehouse name *
                </span>
                <input
                  required
                  value={draft.shiprocketPickupName}
                  onChange={(e) => set("shiprocketPickupName", e.target.value)}
                  placeholder="Must match Shiprocket exactly"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Contact person
                </span>
                <input
                  value={draft.contactPerson ?? ""}
                  onChange={(e) => set("contactPerson", e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Pickup contact *
                </span>
                <input
                  required
                  value={draft.phone ?? ""}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Email</span>
                <input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Address line *
                </span>
                <textarea
                  required
                  rows={2}
                  value={draft.line1 ?? ""}
                  onChange={(e) => set("line1", e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
                <p className="mt-1 text-xs text-stone-500">Used on shipping labels and invoices.</p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Pincode *
                </span>
                <input
                  required
                  value={draft.postalCode ?? ""}
                  onChange={(e) => set("postalCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <div className="flex flex-col justify-end">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  City / State
                </span>
                <div className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  {locationHint || "Enter city & state below"}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">City *</span>
                <input
                  required
                  value={draft.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">State *</span>
                <input
                  required
                  value={draft.state ?? ""}
                  onChange={(e) => set("state", e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Default Pickup Slot</h3>
            <select
              value={draft.defaultPickupSlot ?? PICKUP_SLOTS[2]}
              onChange={(e) => set("defaultPickupSlot", e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
            >
              {PICKUP_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="text-xs text-stone-500">
              Pickup requests for this location use this slot by default.
            </p>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Working Days</h3>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const on = (draft.workingDays ?? []).includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      on
                        ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        : "border-stone-300 text-stone-600 dark:border-stone-600"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {day}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-200">Return Details</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.returnSameAsPickup !== false}
                onChange={(e) => set("returnSameAsPickup", e.target.checked)}
              />
              Return address is the same as pickup address
            </label>
            {draft.returnSameAsPickup === false ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-stone-500">Return address</span>
                  <textarea
                    rows={2}
                    value={draft.returnLine1 ?? ""}
                    onChange={(e) => set("returnLine1", e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-500">Return pincode</span>
                  <input
                    value={draft.returnPostalCode ?? ""}
                    onChange={(e) => set("returnPostalCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-500">Return city</span>
                  <input
                    value={draft.returnCity ?? ""}
                    onChange={(e) => set("returnCity", e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  />
                </label>
              </div>
            ) : null}
          </section>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.isPrimary}
              onChange={(e) => set("isPrimary", e.target.checked)}
            />
            Set as primary default facility
          </label>

          <div className="mt-8 flex justify-end gap-3 border-t border-stone-200 pt-4 dark:border-stone-700">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-amber-50 hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              {busy ? "Saving…" : editing ? "Save Changes" : "Add Location"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
