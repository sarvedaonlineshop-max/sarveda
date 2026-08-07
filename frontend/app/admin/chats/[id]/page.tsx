"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const WA_STATUS_LABELS: Record<string, string> = {
  sent: "✓ sent",
  delivered: "✓✓ delivered",
  read: "✓✓ read",
  failed: "✗ failed"
};

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
        className={`max-w-[min(100%,28rem)] rounded-2xl px-5 py-3.5 shadow-sm ${
          isAdmin ? "rounded-br-sm" : "rounded-bl-md"
        }`}
        style={
          isAdmin
            ? {
                background: isWhatsApp
                  ? "linear-gradient(135deg, #075e54, #128c7e)"
                  : "linear-gradient(135deg, #1c352a, #2d5040)",
                color: "#faf5ec"
              }
            : {
                background: "#faf9f7",
                borderLeft: "3px solid #e8e2d9"
              }
        }
      >
        <p
          className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
            isAdmin ? "" : "text-stone-800 dark:text-stone-100"
          }`}
        >
          {message.body}
        </p>
        {message.attachments.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-white/10 pt-2 text-xs dark:border-stone-300/30">
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.s3Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${isAdmin ? "text-amber-200 dark:text-stone-700" : "text-sky-700"}`}
                >
                  📎 {a.fileName}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={`mt-2 text-[11px] ${isAdmin ? "text-[#a8c4b0]" : "text-stone-400"}`}>
          {isAdmin ? message.authorName : message.authorName} · {formatMsgTime(message.createdAt)}
          {isAdmin && message.waStatus ? (
            <span
              className={
                message.waStatus === "failed"
                  ? " text-red-400"
                  : message.waStatus === "read"
                    ? " text-[#53bdeb]"
                    : ""
              }
            >
              {" "}
              · {WA_STATUS_LABELS[message.waStatus] ?? message.waStatus}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export default function AdminChatDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const adminUser = useAdminUser();
  const [thread, setThread] = useState<EnquiryThreadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [typingAdmins, setTypingAdmins] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSignal = useRef(0);

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
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const stream = new EventSource(getAdminEnquiryStreamUrl(id));
    const refresh = () => void load();
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  async function sendReply() {
    if (!reply.trim() || !id) return;
    setSending(true);
    setError(null);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    void setAdminEnquiryTyping(id, false).catch(() => undefined);
    try {
      await replyAdminEnquiryThread(id, reply.trim(), files);
      setReply("");
      setFiles([]);
      await load();
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

  async function toggleStatus() {
    if (!thread) return;
    const next = thread.status === "CLOSED" ? "OPEN" : "CLOSED";
    try {
      await patchAdminEnquiryStatus(thread.id, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  if (!thread && !error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-stone-400">
        <span className="text-2xl">💬</span>
        <span className="text-sm">Loading conversation…</span>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link
          href="/admin/chats"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#b98a3e] hover:text-[#1c352a]"
        >
          <ChevronLeft size={14} aria-hidden />
          Back to chats
        </Link>
      </div>
    );
  }

  const isWhatsApp = thread.source === "WHATSAPP";
  const hasCustomerMessage = Boolean(thread.lastCustomerMessageAt);
  const waWindowOpen =
    isWhatsApp &&
    hasCustomerMessage &&
    Date.now() - new Date(thread.lastCustomerMessageAt!).getTime() < 24 * 60 * 60 * 1000;
  const isOpen = thread.status === "OPEN";

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-5xl flex-col px-6 pb-5">
      <div
        className="shrink-0 border-b border-stone-200 pb-4 dark:border-stone-700"
        style={{
          backgroundImage: "linear-gradient(180deg, #f0ebe1 0%, transparent 100%)",
          borderRadius: "12px 12px 0 0",
          paddingTop: "12px",
          ...(isWhatsApp
            ? { borderLeft: "3px solid #25d366", paddingLeft: "12px" }
            : {})
        }}
      >
        <Link
          href="/admin/chats"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#b98a3e] hover:text-[#1c352a] dark:text-amber-400"
        >
          <ChevronLeft size={14} aria-hidden />
          All chats
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
              {thread.customerName}
            </h1>
            <p className="text-sm text-stone-500">
              {isWhatsApp
                ? thread.customerPhone ?? thread.waPhone ?? ""
                : `${thread.customerEmail}${thread.customerPhone ? ` · ${thread.customerPhone}` : ""}`}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source}
              {thread.orderNumber ? ` · Order ${thread.orderNumber}` : ""}
              {thread.contextTitle ? ` · ${thread.contextTitle}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleStatus()}
            className="rounded-lg px-3 py-1.5 text-xs"
            style={
              isOpen
                ? {
                    background: "linear-gradient(135deg, #1c352a, #2d5040)",
                    color: "#faf5ec",
                    border: "none",
                    fontWeight: 600,
                    boxShadow: "0 1px 6px rgba(28,53,42,0.2)"
                  }
                : {
                    background: "linear-gradient(135deg, #fee2e2, #fecaca)",
                    color: "#991b1b",
                    border: "1px solid #fca5a5",
                    fontWeight: 600
                  }
            }
          >
            Mark {thread.status === "CLOSED" ? "open" : "closed"}
          </button>
        </div>
      </div>

      <div
        className="flex-1 space-y-5 overflow-y-auto py-6"
        style={{
          backgroundImage: "linear-gradient(180deg, #faf5ec08 0%, transparent 100%)"
        }}
      >
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} message={m} isWhatsApp={isWhatsApp} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div
        className="shrink-0 border-t border-stone-200 pt-5 dark:border-stone-700"
        style={{
          backgroundImage: "linear-gradient(180deg, rgba(250,245,236,0.2), #fff)"
        }}
      >
        {Object.keys(typingAdmins).length > 0 ? (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-green-600 dark:text-green-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" aria-hidden />
            <span>{Object.values(typingAdmins).join(", ")} typing</span>
            <span className="flex items-end gap-0.5" aria-label="typing">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
          </div>
        ) : null}
        {isWhatsApp ? (
          waWindowOpen ? (
            <div
              style={{
                background: "#dcfce7",
                borderRadius: "8px",
                padding: "8px 12px",
                borderLeft: "3px solid #16a34a",
                marginBottom: "8px"
              }}
            >
              <p className="text-xs text-stone-600">
                Reply goes to <strong>{thread.customerPhone ?? thread.waPhone}</strong> on{" "}
                <strong className="text-green-700">WhatsApp</strong> and appears in this thread.
              </p>
            </div>
          ) : (
            <p
              className="mb-2 rounded-lg px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200"
              style={{
                background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
                borderLeft: "3px solid #f59e0b"
              }}
            >
              ⚠️{" "}
              {hasCustomerMessage
                ? "The WhatsApp 24-hour reply window has closed. Free-form replies unlock again after the customer sends a new message."
                : "This number has not messaged Sarveda yet. WhatsApp does not allow free-form admin messages to a new number — the customer must send Hi first (or you send an approved template to open the chat)."}
            </p>
          )
        ) : (
          <p className="mb-2 text-xs text-stone-500">
            Reply goes to <strong>{thread.customerEmail}</strong> via email and appears in this thread.
          </p>
        )}
        <textarea
          value={reply}
          onChange={(e) => handleReplyChange(e.target.value)}
          onBlur={() => void setAdminEnquiryTyping(id, false).catch(() => undefined)}
          rows={3}
          placeholder="Type your reply…"
          className="w-full resize-y rounded-xl border border-stone-300/80 bg-white px-3 py-2.5 text-sm transition-colors duration-150 focus:border-[#b98a3e] focus:ring-1 focus:ring-[#b98a3e]/20 dark:border-stone-600 dark:bg-stone-950"
          style={{ boxShadow: "inset 0 1px 4px rgba(44,36,32,0.04)" }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED_ENQUIRY_FILE_TYPES}
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list) setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ENQUIRY_ATTACHMENTS));
              e.target.value = "";
            }}
          />
          {!isWhatsApp ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium transition-colors hover:bg-[#faf5ec] dark:border-stone-600"
            >
              📎 Attach files
            </button>
          ) : null}
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="text-xs text-stone-500">
              {f.name}{" "}
              <button
                type="button"
                className="text-red-600"
                onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            disabled={sending || !reply.trim() || (isWhatsApp && !waWindowOpen)}
            onClick={() => void sendReply()}
            className="ml-auto px-4 py-2 text-sm disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #1c352a, #2d5040)",
              color: "#faf5ec",
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(28,53,42,0.25)",
              borderRadius: "10px",
              border: "none"
            }}
          >
            {sending
              ? "Sending…"
              : isWhatsApp
                ? "💬 Send on WhatsApp"
                : "✉️ Send reply"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
