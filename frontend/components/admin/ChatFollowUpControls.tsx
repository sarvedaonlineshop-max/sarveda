"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAdminUser } from "@/components/admin/AdminUserContext";
import { ADMIN_CHATS_REFRESH_EVENT } from "@/components/admin/AdminChatsInbox";
import {
  completeAdminEnquiryFollowUp,
  createAdminEnquiryFollowUp,
  fetchAdminEnquiryAdmins,
  fetchAdminEnquiryFollowUps,
  type EnquiryFollowUpRow,
  type EnquiryAdminOption
} from "@/lib/admin-api";

type MenuMode = null | "menu" | "create" | "history";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDateValue(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localTimeValue(d = new Date()) {
  const next = new Date(d.getTime() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return `${pad2(next.getHours())}:${pad2(next.getMinutes())}`;
}

function formatDue(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function adminLabel(a: { name: string | null; email: string } | null | undefined) {
  if (!a) return "—";
  return a.name?.trim() || a.email;
}

type Props = {
  threadId: string;
  /** Light styles for the green WhatsApp / dark chat header */
  lightHeader?: boolean;
};

export function ChatFollowUpControls({ threadId, lightHeader = false }: Props) {
  const me = useAdminUser();
  const [mode, setMode] = useState<MenuMode>(null);
  const [admins, setAdmins] = useState<EnquiryAdminOption[]>([]);
  const [items, setItems] = useState<EnquiryFollowUpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [time, setTime] = useState(localTimeValue);
  const [assignedAdminId, setAssignedAdminId] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (mode !== "menu") return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMode(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" && mode !== "history") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    if (mode !== "create") return;
    void (async () => {
      try {
        const { admins: list } = await fetchAdminEnquiryAdmins();
        setAdmins(list);
        const preferred =
          list.find((a) => a.id === me?.id)?.id ||
          list.find((a) => a.email.toLowerCase() === (me?.email || "").toLowerCase())?.id ||
          list[0]?.id ||
          "";
        setAssignedAdminId((prev) => prev || preferred);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load admins");
      }
    })();
  }, [mode, me?.id, me?.email]);

  const loadHistory = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { items: rows } = await fetchAdminEnquiryFollowUps(threadId);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setBusy(false);
    }
  }, [threadId]);

  useEffect(() => {
    if (mode === "history") void loadHistory();
  }, [mode, loadHistory]);

  const duePreview = useMemo(() => {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [date, time]);

  async function onCreate() {
    if (!duePreview) {
      setError("Pick a valid date and time");
      return;
    }
    if (!assignedAdminId) {
      setError("Select an admin");
      return;
    }
    if (!notes.trim()) {
      setError("Add a short note for the follow-up");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAdminEnquiryFollowUp(threadId, {
        notes: notes.trim(),
        dueAt: duePreview.toISOString(),
        assignedAdminId
      });
      window.dispatchEvent(new Event(ADMIN_CHATS_REFRESH_EVENT));
      setNotes("");
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save follow-up");
    } finally {
      setBusy(false);
    }
  }

  async function onDone(id: string) {
    setBusy(true);
    setError(null);
    try {
      await completeAdminEnquiryFollowUp(id);
      window.dispatchEvent(new Event(ADMIN_CHATS_REFRESH_EVENT));
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark done");
    } finally {
      setBusy(false);
    }
  }

  const btnClass = lightHeader
    ? "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border border-white/25 bg-white/10 text-[#faf5ec] hover:bg-white/15"
    : "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border border-stone-300 bg-white text-stone-800 hover:bg-stone-50";

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button type="button" onClick={() => setMode((m) => (m ? null : "menu"))} className={btnClass}>
        Follow up
      </button>

      {mode === "menu" ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-[14px] text-stone-800 hover:bg-stone-100"
            onClick={() => {
              setError(null);
              setMode("create");
            }}
          >
            Create
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2.5 text-left text-[14px] text-stone-800 hover:bg-stone-100"
            onClick={() => {
              setError(null);
              setMode("history");
            }}
          >
            History
          </button>
        </div>
      ) : null}

      {portalReady && mode === "create"
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMode(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Create follow-up"
                className="flex max-h-[min(88dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
                  <h3 className="text-base font-semibold text-stone-900">Create follow-up</h3>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
                    onClick={() => setMode(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
                  <label className="block text-xs font-semibold text-stone-600">
                    Date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-stone-600">
                    Time
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-stone-600">
                    Assign to
                    <select
                      value={assignedAdminId}
                      onChange={(e) => setAssignedAdminId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900"
                    >
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {adminLabel(a)}
                          {a.id === me?.id ? " (me)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-stone-600">
                    Notes
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="What should we follow up on?"
                      className="mt-1 w-full resize-y rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900"
                    />
                  </label>
                  {error ? <p className="text-xs text-red-600">{error}</p> : null}
                </div>
                <div className="shrink-0 border-t border-stone-100 px-4 py-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onCreate()}
                    className="w-full rounded-xl bg-[#1c352a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save follow-up"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {portalReady && mode === "history"
        ? createPortal(
            <div
              className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMode(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Follow-up history"
                className="flex max-h-[min(75dvh,32rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
                  <h3 className="text-base font-semibold text-stone-900">Follow-up history</h3>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
                    onClick={() => setMode(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch]">
                  {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
                  {busy && items.length === 0 ? (
                    <p className="text-sm text-stone-500">Loading…</p>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-stone-500">No follow-ups yet for this chat.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 z-[1] bg-[#e8f0e6] text-[11px] font-bold uppercase tracking-wide text-stone-500">
                          <tr>
                            <th className="px-2 py-2">Date &amp; time</th>
                            <th className="px-2 py-2">Notes</th>
                            <th className="hidden px-2 py-2 sm:table-cell">Attended by</th>
                            <th className="px-2 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((row) => {
                            const attended = row.assignedAdmin;
                            const isMe = attended?.id === me?.id;
                            return (
                              <tr key={row.id} className="border-t border-stone-100 align-top">
                                <td className="whitespace-nowrap px-2 py-2.5 text-stone-800">
                                  {formatDue(row.dueAt)}
                                </td>
                                <td className="max-w-[10rem] px-2 py-2.5 text-stone-700 sm:max-w-[14rem]">
                                  <span className="line-clamp-3">{row.notes}</span>
                                </td>
                                <td className="hidden px-2 py-2.5 text-stone-700 sm:table-cell">
                                  {isMe ? "Me" : adminLabel(attended)}
                                </td>
                                <td className="px-2 py-2.5">
                                  {row.status === "CLOSED" ? (
                                    <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                                      Closed
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void onDone(row.id)}
                                      className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                                    >
                                      Done
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
