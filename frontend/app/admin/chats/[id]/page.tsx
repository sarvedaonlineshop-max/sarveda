"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, MessageSquarePlus, Paperclip, SendHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, useCallback, Suspense } from "react";

import {
  fetchAdminEnquiryThread,
  getAdminEnquiryStreamUrl,
  patchAdminEnquiryStatus,
  replyAdminEnquiryThread,
  setAdminEnquiryTyping,
  type EnquiryMessageRow,
  type EnquiryThreadDetail
} from "@/lib/admin-api";
import {
  ACCEPTED_ENQUIRY_FILE_TYPES,
  ENQUIRY_SOURCE_LABELS,
  type EnquirySource
} from "@/lib/enquiry-subjects";
import { MAX_ENQUIRY_ATTACHMENTS } from "@/lib/enquiry-limits";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import {
  ADMIN_CHATS_REFRESH_EVENT,
  openAdminStartWhatsAppChat
} from "@/components/admin/AdminChatsInbox";
import { MaskedPhoneReveal } from "@/components/admin/MaskedPhoneReveal";

const WA_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWhatsAppSessionOpen(lastCustomerMessageAt: string | null | undefined): boolean {
  if (!lastCustomerMessageAt) return false;
  const t = new Date(lastCustomerMessageAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= WA_SESSION_WINDOW_MS;
}

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Strip accidental HTML / markup from template previews for display. */
function displayMessageBody(raw: string): string {
  return raw
    .replace(/<\/?blockquote[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+_+/g, " ")
    .replace(/_+\s+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function notifyInboxRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_CHATS_REFRESH_EVENT));
  }
}

/** WhatsApp-style double tick (blue when read/delivered, gray when sent). */
function WaTicks({ status }: { status?: string | null }) {
  if (!status || status === "failed") {
    return status === "failed" ? (
      <span className="ml-1 text-[11px] font-semibold text-red-500" title="Failed">
        !
      </span>
    ) : null;
  }
  const readOrDelivered = status === "read" || status === "delivered";
  const color = readOrDelivered ? "#53bdeb" : "#9aa5a0";
  return (
    <svg
      className="ml-1 inline-block shrink-0 align-text-bottom"
      width="16"
      height="11"
      viewBox="0 0 16 11"
      aria-label={status}
    >
      <path
        d="M11.07 1.14 5.4 8.05 2.2 5.05"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.2 1.14 8.53 8.05 7.1 6.7"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageBubble({
  message,
  isWhatsApp
}: {
  message: EnquiryMessageRow;
  isWhatsApp?: boolean;
}) {
  const isAdmin = message.authorType === "ADMIN";
  return (
    <div className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,32rem)] rounded-2xl px-3.5 py-2 shadow-sm ${
          isAdmin ? "rounded-br-sm" : "rounded-bl-md"
        }`}
        style={
          isAdmin
            ? {
                background: "#dcf8c6",
                border: "1px solid #c5e8b0",
                color: "#1a2e1a"
              }
            : {
                background: "#ffffff",
                border: "1px solid #e5e0d6",
                color: "#1a2e1a"
              }
        }
      >
        {message.body ? (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#1a2e1a]">
            {displayMessageBody(message.body)}
          </p>
        ) : null}
        {message.attachments.length > 0 ? (
          <ul
            className={`space-y-1 text-xs ${message.body ? "mt-2 border-t pt-2" : ""} border-stone-200/80`}
          >
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.s3Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0b6b5f] underline"
                >
                  📎 {a.fileName}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-[#5a7a5a]">
          <span>{formatMsgTime(message.createdAt)}</span>
          {isAdmin && isWhatsApp ? <WaTicks status={message.waStatus} /> : null}
        </p>
      </div>
    </div>
  );
}

function AdminChatDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const adminUser = useAdminUser();
  const [thread, setThread] = useState<EnquiryThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [typingAdmins, setTypingAdmins] = useState<Record<string, string>>({});
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSignal = useRef(0);

  useEffect(() => {
    const notice = searchParams.get("notice");
    if (!notice) {
      setBanner(null);
      return;
    }
    if (notice === "outreach") {
      setBanner("Outreach template sent. Free chat unlocks after they reply.");
    } else {
      setBanner(notice);
    }
    // Drop query so refresh doesn't re-show the banner
    router.replace(`/admin/chats/${id}`, { scroll: false });
  }, [searchParams, id, router]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await fetchAdminEnquiryThread(id);
      setThread(data);
    } catch (e) {
      setThread(null);
      setError(e instanceof Error ? e.message : "Could not load conversation");
    }
  }, [id]);

  useEffect(() => {
    setThread(null);
    setReply("");
    setFiles([]);
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const stream = new EventSource(getAdminEnquiryStreamUrl(id));
    const refresh = () => {
      void load();
      notifyInboxRefresh();
    };
    const onTyping = (event: Event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as {
        adminId: string;
        adminName: string;
        typing: boolean;
      };
      if (data.adminId === adminUser?.id) return;
      setTypingAdmins((current) => {
        const next = { ...current };
        if (data.typing) next[data.adminId] = data.adminName;
        else delete next[data.adminId];
        return next;
      });
    };
    stream.addEventListener("message_changed", refresh);
    stream.addEventListener("thread_changed", refresh);
    stream.addEventListener("admin_typing", onTyping);
    return () => {
      stream.close();
      setTypingAdmins({});
    };
  }, [adminUser?.id, id, load]);

  useEffect(() => {
    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (id) void setAdminEnquiryTyping(id, false).catch(() => undefined);
    };
  }, [id]);

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, []);

  useLayoutEffect(() => {
    if (!thread?.messages.length) return;
    scrollToBottom();
  }, [id, thread?.messages.length, thread?.messages[thread.messages.length - 1]?.id, scrollToBottom]);

  const canSend = Boolean(reply.trim() || files.length > 0) && !sending;

  async function sendReply() {
    if (!canSend || !id) return;
    setSending(true);
    setError(null);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    void setAdminEnquiryTyping(id, false).catch(() => undefined);
    try {
      await replyAdminEnquiryThread(id, reply.trim(), files);
      setReply("");
      setFiles([]);
      await load();
      notifyInboxRefresh();
      requestAnimationFrame(() => scrollToBottom());
      inputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  }

  function handleReplyChange(value: string) {
    setReply(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSignal.current > 1_500) {
      lastTypingSignal.current = now;
      void setAdminEnquiryTyping(id, true).catch(() => undefined);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      void setAdminEnquiryTyping(id, false).catch(() => undefined);
    }, 2_000);
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  }

  async function toggleStatus() {
    if (!thread) return;
    const next = thread.status === "CLOSED" ? "OPEN" : "CLOSED";
    try {
      await patchAdminEnquiryStatus(thread.id, next);
      await load();
      notifyInboxRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  if (!thread && !error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-[#efe8dc] text-stone-400">
        <span className="animate-pulse text-sm">Loading conversation…</span>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#efe8dc] p-8 text-center">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link href="/admin/chats" className="text-sm font-semibold text-[#b98a3e]">
          Back to chats
        </Link>
      </div>
    );
  }

  const isWhatsApp = thread.source === "WHATSAPP";
  const isOpen = thread.status === "OPEN";
  const initial = (thread.customerName?.trim()?.[0] || "?").toUpperCase();
  const sessionOpen = !isWhatsApp || isWhatsAppSessionOpen(thread.lastCustomerMessageAt);
  const composerLocked = isWhatsApp && !sessionOpen;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#efe8dc]">
      {/* Fixed header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5"
        style={{
          borderColor: "rgba(44,36,32,0.12)",
          background: isWhatsApp ? "#075e54" : "#1c352a"
        }}
      >
        <Link
          href="/admin/chats"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#e9d6ae] hover:bg-white/10 md:hidden"
          aria-label="Back to chats"
        >
          <ChevronLeft size={20} />
        </Link>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{
            background: isWhatsApp
              ? "linear-gradient(135deg, #25d366, #128c7e)"
              : "rgba(255,255,255,0.15)"
          }}
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold text-[#faf5ec]">
            {thread.customerName}
          </h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-[#a8c4b0]">
            {isWhatsApp ? (
              <MaskedPhoneReveal
                phone={thread.customerPhone ?? thread.waPhone}
                light
                className="text-[#a8c4b0]"
              />
            ) : (
              <>
                <span className="truncate">{thread.customerEmail}</span>
                {thread.customerPhone ? (
                  <>
                    <span>·</span>
                    <MaskedPhoneReveal phone={thread.customerPhone} light className="text-[#a8c4b0]" />
                  </>
                ) : null}
              </>
            )}
            <span>·</span>
            <span>
              {ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source}
              {thread.orderNumber ? ` · ${thread.orderNumber}` : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleStatus()}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold"
          style={
            isOpen
              ? {
                  background: "rgba(255,255,255,0.12)",
                  color: "#faf5ec",
                  border: "1px solid rgba(255,255,255,0.22)"
                }
              : {
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fca5a5"
                }
          }
        >
          Mark {thread.status === "CLOSED" ? "open" : "closed"}
        </button>
      </div>

      {banner ? (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <p className="min-w-0 flex-1 leading-snug">{banner}</p>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/* Scrollable messages */}
      <div
        ref={messagesRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c4b8a4' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\"), linear-gradient(180deg, #ebe4d6, #efe8dc)"
        }}
      >
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} message={m} isWhatsApp={isWhatsApp} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Fixed composer */}
      <div
        className="relative shrink-0 border-t px-3 py-2"
        style={{ borderColor: "rgba(44,36,32,0.12)", background: "#f0ebe3" }}
      >
        {composerLocked ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <p className="max-w-sm text-center text-[12px] leading-snug text-stone-500">
              The 24-hour WhatsApp window has closed. Free-form replies are blocked until the
              customer messages again — or send a new outreach template.
            </p>
            <button
              type="button"
              onClick={() =>
                openAdminStartWhatsAppChat({
                  phone: thread.waPhone ?? thread.customerPhone,
                  customerName: thread.customerName
                })
              }
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}
            >
              <MessageSquarePlus size={18} strokeWidth={2.25} />
              Start new chat
            </button>
          </div>
        ) : (
          <>
        {Object.keys(typingAdmins).length > 0 ? (
          <div className="mb-1.5 text-xs font-medium text-green-700">
            {Object.values(typingAdmins).join(", ")} typing…
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-stone-600 ring-1 ring-stone-200"
              >
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="text-red-600"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED_ENQUIRY_FILE_TYPES}
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list) {
                setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ENQUIRY_ATTACHMENTS));
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-[#1c352a]"
            title="Attach files"
            aria-label="Attach files"
          >
            <Paperclip size={20} strokeWidth={2} />
          </button>

          <textarea
            ref={inputRef}
            value={reply}
            onChange={(e) => handleReplyChange(e.target.value)}
            onKeyDown={onComposerKeyDown}
            onBlur={() => void setAdminEnquiryTyping(id, false).catch(() => undefined)}
            rows={1}
            placeholder="Type a message"
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-full border border-[#2c2420]/35 bg-white px-4 py-2.5 text-sm leading-5 text-stone-800 outline-none focus:border-[#25d366]"
          />

          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendReply()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: canSend ? "#25d366" : "#9ca3af"
            }}
            title="Send (Enter)"
            aria-label="Send message"
          >
            <SendHorizontal size={18} strokeWidth={2.25} className={sending ? "animate-pulse" : ""} />
          </button>
        </div>

        {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminChatDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#efe8dc] text-sm text-stone-400">
          Loading conversation…
        </div>
      }
    >
      <AdminChatDetailInner />
    </Suspense>
  );
}
