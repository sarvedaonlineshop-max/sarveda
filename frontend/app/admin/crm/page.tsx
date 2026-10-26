"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Phone, X } from "lucide-react";
import { crmApi, type CrmPipelineDesk } from "@/lib/crm-api";
import { useIsSuperAdmin } from "@/components/admin/AdminUserContext";

const ORDER = ["NEW", "CONTACTED", "ONGOING", "FOLLOWUP", "WON", "LOST", "UNQUALIFIED"] as const;
const COLORS: Record<string, string> = {
  NEW: "#365f8d",
  CONTACTED: "#8b6b1f",
  ONGOING: "#1f7a4d",
  FOLLOWUP: "#b45309",
  WON: "#197a4b",
  LOST: "#a94442",
  UNQUALIFIED: "#6b7280",
  OVERVIEW: "#1c352a"
};

function label(status: string) {
  if (status === "FOLLOWUP") return "Followup";
  if (status === "OVERVIEW") return "Overview";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function CrmDeskPage() {
  const superAdmin = useIsSuperAdmin();
  const [tab, setTab] = useState<"OVERVIEW" | (typeof ORDER)[number]>("OVERVIEW");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [desk, setDesk] = useState<CrmPipelineDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callNote, setCallNote] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeStatus = statusFilter || (tab === "OVERVIEW" ? "" : tab);

  const load = useCallback(async () => {
    setDesk(
      await crmApi.pipelineDesk({
        status: activeStatus || undefined,
        ownerId: superAdmin && ownerId ? ownerId : undefined,
        from: from || undefined,
        to: to || undefined
      })
    );
  }, [activeStatus, from, to, ownerId, superAdmin]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  const total = useMemo(
    () => ORDER.reduce((sum, status) => sum + (desk?.byStatus?.[status] ?? 0), 0),
    [desk]
  );
  const gradient = useMemo(() => {
    if (!total) return "conic-gradient(#e7e1d6 0 100%)";
    let cursor = 0;
    const stops = ORDER.map((status) => {
      const start = cursor;
      cursor += ((desk?.byStatus?.[status] ?? 0) / total) * 100;
      return `${COLORS[status]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${stops.join(",")})`;
  }, [desk, total]);

  const ownerName = desk?.owners.find((owner) => owner.id === ownerId)?.name || desk?.owners.find((owner) => owner.id === ownerId)?.email || "";

  async function move(id: string, status: string) {
    setError(null);
    try {
      await crmApi.setChatPipeline(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move");
    }
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setOwnerId("");
    setStatusFilter("");
    setTab("OVERVIEW");
  }

  const filtersOn = Boolean(from || to || ownerId || statusFilter);
  const filterCount = [from, to, ownerId, statusFilter].filter(Boolean).length;
  const field =
    "h-10 w-full rounded-xl border border-[#d5e0d8] bg-white px-3 text-sm text-[#1c352a] shadow-sm outline-none md:w-auto";
  const showTable = tab !== "OVERVIEW" || Boolean(statusFilter);

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden text-[#1c352a]">
      <div className="flex flex-wrap gap-2">
        {(["OVERVIEW", ...ORDER] as const).map((item) => {
          const on = (item === "OVERVIEW" ? tab === "OVERVIEW" && !statusFilter : activeStatus === item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTab(item);
                setStatusFilter(item === "OVERVIEW" ? "" : item);
              }}
              className="rounded-full px-3.5 py-2 text-sm font-semibold shadow-sm"
              style={{
                background: on ? COLORS[item] : "#fff",
                color: on ? "#fffaf1" : COLORS[item],
                border: `1px solid ${COLORS[item]}`
              }}
            >
              {label(item)}
              {item !== "OVERVIEW" ? ` · ${desk?.byStatus?.[item] ?? 0}` : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1c352a] px-3.5 text-sm font-semibold text-white shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters{filterCount ? ` ${filterCount}` : ""}
        </button>
        {statusFilter ? (
          <FilterPill
            label={label(statusFilter)}
            onClear={() => {
              setStatusFilter("");
              setTab("OVERVIEW");
            }}
          />
        ) : null}
        {ownerId ? <FilterPill label={ownerName || "Admin"} onClear={() => setOwnerId("")} /> : null}
        {from ? <FilterPill label={`From ${from}`} onClear={() => setFrom("")} /> : null}
        {to ? <FilterPill label={`To ${to}`} onClear={() => setTo("")} /> : null}
      </div>

      <section
        className={`mt-3 shrink-0 rounded-2xl border border-[#d5e0d8] bg-white p-4 shadow-[0_8px_24px_rgba(28,53,42,0.06)] ${
          filtersOpen ? "block" : "hidden md:block"
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
          <label className="text-sm font-medium text-[#4a6b58]">
            From
            <input className={`${field} mt-1 block`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-[#4a6b58]">
            To
            <input className={`${field} mt-1 block`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-[#4a6b58]">
            Status
            <select
              className={`${field} mt-1 block min-w-[150px]`}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setTab(event.target.value ? (event.target.value as (typeof ORDER)[number]) : "OVERVIEW");
              }}
            >
              <option value="">All statuses</option>
              {ORDER.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
          </label>
          {superAdmin ? (
            <label className="text-sm font-medium text-[#4a6b58]">
              Admin
              <select className={`${field} mt-1 block min-w-[180px]`} value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                <option value="">All admins</option>
                {(desk?.owners ?? []).map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name || owner.email}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersOn}
            className="h-10 rounded-xl bg-[#1c352a] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>
        {filtersOn ? (
          <div className="mt-3 hidden flex-wrap gap-2 md:flex">
            {from ? <FilterPill label={`From ${from}`} onClear={() => setFrom("")} /> : null}
            {to ? <FilterPill label={`To ${to}`} onClear={() => setTo("")} /> : null}
            {statusFilter ? (
              <FilterPill
                label={label(statusFilter)}
                onClear={() => {
                  setStatusFilter("");
                  setTab("OVERVIEW");
                }}
              />
            ) : null}
            {ownerId ? <FilterPill label={ownerName || "Admin"} onClear={() => setOwnerId("")} /> : null}
          </div>
        ) : null}
      </section>

      {error ? <p className="mt-3 shrink-0 text-sm text-red-700">{error}</p> : null}
      {callNote ? <p className="mt-3 shrink-0 text-sm text-[#8a5a12]">{callNote}</p> : null}

      {!showTable ? (
        <div className="mt-4 grid min-h-0 flex-1 items-stretch gap-4 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-[#d5e0d8] bg-white p-5 shadow-[0_8px_24px_rgba(28,53,42,0.06)]">
            <div className="mx-auto h-44 w-44 rounded-full shadow-inner" style={{ background: gradient }} />
            <ul className="mt-4 space-y-1.5">
              {ORDER.map((status) => (
                <li key={status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[status] }} />
                    {label(status)}
                  </span>
                  <strong>{desk?.byStatus?.[status] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex min-h-[240px] flex-col rounded-2xl border border-[#d5e0d8] bg-white p-5 shadow-[0_8px_24px_rgba(28,53,42,0.06)]">
            <h2 className="text-base font-semibold">Follow-ups</h2>
            {(desk?.followUps ?? []).length === 0 ? <p className="mt-3 text-sm text-[#4a6b58]">None open.</p> : null}
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {(desk?.followUps ?? []).map((row) => (
                <li key={row.id} className="border-t border-[#e6eee8] py-3 first:border-t-0">
                  <Link href={`/admin/chats/${row.thread.id}`} className="font-semibold text-[#1c352a]">
                    {row.thread.customerName}
                  </Link>
                  <p className="mt-0.5 text-sm text-[#4a6b58]">
                    {new Date(row.dueAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {row.notes ? ` · ${row.notes}` : ""} · {label(row.thread.crmPipeline)}
                    {superAdmin && row.thread.crmOwner?.name ? ` · ${row.thread.crmOwner.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <>
        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain md:hidden">
          {(desk?.rows ?? []).length === 0 ? (
            <p className="rounded-2xl border border-[#d5e0d8] bg-white px-4 py-8 text-sm text-[#4a6b58]">No customers in this view.</p>
          ) : null}
          {(desk?.rows ?? []).map((row) => (
            <article key={row.id} className="rounded-2xl border border-[#d5e0d8] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(28,53,42,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-base font-semibold">{row.customerName}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/admin/chats/${row.id}`}
                    title="Message"
                    aria-label={`Message ${row.customerName}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f5ee] text-[#1f7a4d] shadow-sm"
                  >
                    <MessageCircle size={16} />
                  </Link>
                  <button
                    type="button"
                    title="Call"
                    aria-label={`Call ${row.customerName}`}
                    onClick={() => setCallNote("Calling will be connected with Exotel later.")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f1e3] text-[#8a5a12] shadow-sm"
                  >
                    <Phone size={16} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-[#4a6b58]">{row.phone || "—"}</p>
                <select
                  className="h-10 shrink-0 rounded-xl border border-[#d5e0d8] bg-white px-3 text-sm shadow-sm"
                  value={row.crmPipeline}
                  onChange={(event) => void move(row.id, event.target.value)}
                >
                  {ORDER.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
        </div>
        <div className="crm-table-scroll mt-4 hidden min-h-0 w-full max-w-full flex-1 overflow-auto overscroll-contain rounded-2xl border border-[#d5e0d8] bg-white shadow-[0_8px_24px_rgba(28,53,42,0.06)] md:block">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#f4f7f4] text-left text-xs font-semibold uppercase tracking-wide text-[#4a6b58]">
                {["Name", "Phone", "Message", "Call", "Current status", ...(superAdmin ? ["Admin"] : [])].map((head) => (
                  <th key={head} className="px-4 py-3">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(desk?.rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-[#e6eee8]">
                  <td className="px-4 py-3 font-medium">{row.customerName}</td>
                  <td className="px-4 py-3 text-[#4a6b58]">{row.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/chats/${row.id}`}
                      title="Message"
                      aria-label={`Message ${row.customerName}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f5ee] text-[#1f7a4d] shadow-sm"
                    >
                      <MessageCircle size={16} />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title="Call"
                      aria-label={`Call ${row.customerName}`}
                      onClick={() => setCallNote("Calling will be connected with Exotel later.")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f1e3] text-[#8a5a12] shadow-sm"
                    >
                      <Phone size={16} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-10 rounded-xl border border-[#d5e0d8] bg-white px-3 text-sm shadow-sm"
                      value={row.crmPipeline}
                      onChange={(event) => void move(row.id, event.target.value)}
                    >
                      {ORDER.map((status) => (
                        <option key={status} value={status}>
                          {label(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  {superAdmin ? <td className="px-4 py-3">{row.owner?.name || row.owner?.email || "Unassigned"}</td> : null}
                </tr>
              ))}
              {(desk?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={superAdmin ? 6 : 5} className="px-4 py-8 text-[#4a6b58]">
                    No customers in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function FilterPill({ label: text, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#d7c49a] bg-[#f8f1e3] py-1 pl-3 pr-1 text-sm font-medium text-[#1c352a]">
      {text}
      <button type="button" aria-label={`Remove ${text}`} onClick={onClear} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-white">
        <X size={14} />
      </button>
    </span>
  );
}
