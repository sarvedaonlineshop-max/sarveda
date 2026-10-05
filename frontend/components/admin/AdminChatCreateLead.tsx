"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crmApi } from "@/lib/crm-api";

const SOURCES = ["WEBSITE", "WHATSAPP", "PHONE", "EMAIL", "REFERRAL", "GOOGLE", "META", "MARKETPLACE", "EVENT", "OFFLINE", "IMPORT", "OTHER"] as const;

function sourceForChat(source: string): (typeof SOURCES)[number] {
  if (source === "WHATSAPP") return "WHATSAPP";
  if (source === "EVENT") return "EVENT";
  if (source === "CORPORATE") return "OFFLINE";
  return "WEBSITE";
}

export type ChatLeadSeed = {
  threadId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  waPhone?: string | null;
  source: string;
  subject?: string | null;
  orderNumber?: string | null;
  contextTitle?: string | null;
};

export function AdminChatCreateLead({
  seed,
  light,
  menu,
  onBeforeOpen
}: {
  seed: ChatLeadSeed;
  light?: boolean;
  menu?: boolean;
  onBeforeOpen?: () => void;
}) {
  const router = useRouter();
  const [existingId, setExistingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phone = (seed.customerPhone || seed.waPhone || "").trim();
  const [form, setForm] = useState({
    name: seed.customerName?.trim() || seed.customerEmail?.trim() || phone || "",
    email: seed.customerEmail?.trim() || "",
    phone,
    whatsappPhone: seed.source === "WHATSAPP" ? (seed.waPhone || seed.customerPhone || "").trim() : "",
    companyName: "",
    source: sourceForChat(seed.source),
    estimatedValue: "",
    interestSummary: [seed.subject, seed.contextTitle, seed.orderNumber ? `Order ${seed.orderNumber}` : ""]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(" · ")
  });

  useEffect(() => {
    let cancelled = false;
    void crmApi
      .leads({ enquiryThreadId: seed.threadId, limit: 1 })
      .then((r) => {
        if (!cancelled) setExistingId(r.items[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [seed.threadId]);

  const goExisting = () => {
    if (existingId) router.push(`/admin/crm/leads/${existingId}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await crmApi.createLead({
        name: form.name.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        whatsappPhone: form.whatsappPhone || undefined,
        companyName: form.companyName || undefined,
        source: form.source,
        interestSummary: form.interestSummary || undefined,
        estimatedValueInPaise: form.estimatedValue ? Math.round(Number(form.estimatedValue) * 100) : undefined,
        enquiryThreadId: seed.threadId
      });
      router.push(`/admin/crm/leads/${created.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not create the lead";
      if (message.toLowerCase().includes("already linked")) {
        const again = await crmApi.leads({ enquiryThreadId: seed.threadId, limit: 1 }).catch(() => null);
        const id = again?.items[0]?.id;
        if (id) {
          router.push(`/admin/crm/leads/${id}`);
          return;
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const buttonClass = menu
    ? "block w-full px-4 py-3 text-left text-[15px] text-stone-800 hover:bg-stone-100"
    : light
      ? "rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#faf5ec] hover:bg-white/10"
      : "rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#1c352a] hover:bg-black/5";

  return (
    <>
      <button type="button" role={menu ? "menuitem" : undefined} className={buttonClass} onClick={() => { onBeforeOpen?.(); existingId ? goExisting() : setOpen(true); }}>
        {existingId ? "Open lead" : "Create lead"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) setOpen(false); }}>
          <form onSubmit={(e) => void submit(e)} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[#f7f3eb] p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-[#1c352a]">Create CRM lead</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-1 text-sm text-stone-500">Close</button>
            </div>
            <p className="mb-3 text-[12px] text-stone-500">Name, phone and email come from this chat. Change anything before saving. Nothing is sent to the customer.</p>
            {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
            <div className="grid gap-2">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <input value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} placeholder="WhatsApp" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Company" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as (typeof SOURCES)[number] })} className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm">
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input type="number" min="0" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} placeholder="Potential value ₹" className="h-10 rounded-lg border border-[#d9d1c4] px-3 text-sm" />
              <textarea value={form.interestSummary} onChange={(e) => setForm({ ...form, interestSummary: e.target.value })} placeholder="Interest / notes" className="min-h-20 rounded-lg border border-[#d9d1c4] px-3 py-2 text-sm" />
            </div>
            <button disabled={busy} className="mt-3 h-10 rounded-lg bg-[#1c352a] px-4 text-sm font-semibold text-[#fffaf1] disabled:opacity-60">
              {busy ? "Saving…" : "Save lead"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
