"use client";

import { UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";

import { useAdminUser } from "@/components/admin/AdminUserContext";
import { crmApi, type CrmAssignee } from "@/lib/crm-api";
import { canAssignChatOwner } from "@/lib/crm-team-access";

function displayName(person: { name?: string | null; email?: string | null } | null | undefined) {
  return person?.name?.trim() || person?.email?.split("@")[0] || "Admin";
}

export function ChatAssignControl({
  threadId,
  onAssigned,
  openRef
}: {
  threadId: string;
  onAssigned?: () => void;
  openRef?: MutableRefObject<(() => void) | null>;
}) {
  const me = useAdminUser();
  const allowed = canAssignChatOwner(me?.email);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [people, setPeople] = useState<CrmAssignee[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [currentOwnerId, setCurrentOwnerId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openModal() {
    if (!allowed) return;
    setError(null);
    setQuery("");
    setOpen(true);
    try {
      const [list, card] = await Promise.all([crmApi.assignees(), crmApi.chatPipeline(threadId)]);
      setPeople(list);
      setCurrentOwnerId(card.crmOwner?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admins");
    }
  }

  useEffect(() => {
    if (!openRef) return;
    openRef.current = () => void openModal();
    return () => {
      openRef.current = null;
    };
  });

  async function assign(person: CrmAssignee) {
    setBusyId(person.id);
    setError(null);
    try {
      await crmApi.setChatOwner(threadId, person.id);
      setOpen(false);
      setToast(`${displayName(person)} assigned successfully`);
      onAssigned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => {
      const hay = `${person.name ?? ""} ${person.email}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [people, query]);

  if (!mounted) return null;

  const modal =
    open && allowed
      ? createPortal(
          <div
            className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-assign-title"
            onClick={(event) => {
              if (event.target === event.currentTarget && !busyId) setOpen(false);
            }}
          >
            <div className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#f7f3eb] shadow-xl sm:max-w-md sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-[#e8e2d9] px-4 py-3">
                <h2 id="chat-assign-title" className="text-[17px] font-semibold text-[#1c352a]">
                  Assign chat
                </h2>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-black/5"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 pt-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search admin"
                  className="w-full rounded-xl border border-[#1c352a]/15 bg-white px-3 py-2 text-[14px] text-[#1c352a] outline-none focus:border-[#1c352a]"
                  autoFocus
                />
                {error ? <p className="mt-2 text-[12px] font-medium text-red-700">{error}</p> : null}
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-[13px] text-stone-500">No admins found</li>
                ) : (
                  filtered.map((person) => {
                    const selected = person.id === currentOwnerId;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => void assign(person)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white disabled:opacity-50 ${
                            selected ? "bg-white" : ""
                          }`}
                        >
                          <span>
                            <span className="block text-[14px] font-semibold text-[#1c352a]">
                              {displayName(person)}
                            </span>
                            <span className="block text-[12px] text-[#4a6b58]">{person.email}</span>
                          </span>
                          <span className="text-[12px] font-semibold text-[#0f766e]">
                            {busyId === person.id ? "Assigning…" : selected ? "Current" : "Assign"}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>,
          document.body
        )
      : null;

  const headerSlot = typeof document !== "undefined" ? document.getElementById("chat-assign-header-slot") : null;
  const headerButton =
    allowed && headerSlot
      ? createPortal(
          <button
            type="button"
            onClick={() => void openModal()}
            className="inline-flex h-11 w-11 items-center justify-center text-[#faf5ec] hover:bg-white/10"
            aria-label="Assign chat"
            title="Assign member"
          >
            <UserPlus size={20} />
          </button>,
          headerSlot
        )
      : null;

  const fab =
    allowed
      ? createPortal(
          <button
            type="button"
            onClick={() => void openModal()}
            className="fixed z-[80] inline-flex items-center gap-1.5 rounded-full bg-[#1c352a] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(28,53,42,0.35)] ring-1 ring-black/10 hover:bg-[#244536]"
            style={{
              right: 12,
              bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))"
            }}
            aria-label="Assign chat"
          >
            <UserPlus size={16} />
            Assign
          </button>,
          document.body
        )
      : null;

  return (
    <>
      {headerButton}
      {fab}
      {modal}
      {toast ? <AssignToast text={toast} /> : null}
    </>
  );
}

function AssignToast({ text }: { text: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[240] flex justify-center px-3">
      <p className="rounded-full bg-[#1c352a] px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
        {text}
      </p>
    </div>,
    document.body
  );
}
