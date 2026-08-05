"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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

function MessageBubble({ message }: { message: EnquiryMessageRow }) {
  const isAdmin = message.authorType === "ADMIN";
  return (
    <div className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(100%,28rem)] rounded-2xl px-4 py-3 shadow-sm ${
          isAdmin
            ? "rounded-br-md bg-stone-900 text-amber-50 dark:bg-stone-100 dark:text-stone-900"
            : "rounded-bl-md border border-stone-200 bg-white text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
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
        <p
          className={`mt-2 text-[11px] ${
            isAdmin ? "text-amber-200/80 dark:text-stone-500" : "text-stone-400"
          }`}
        >
          {isAdmin ? message.authorName : message.authorName} · {formatMsgTime(message.createdAt)}
          {isAdmin && message.waStatus ? (
            <span className={message.waStatus === "failed" ? " text-red-400" : ""}>
              {" "}· {WA_STATUS_LABELS[message.waStatus] ?? message.waStatus}
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
    return <p className="p-8 text-center text-sm text-stone-500">Loading conversation…</p>;
  }

  if (!thread) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">{error ?? "Not found"}</p>
        <Link href="/admin/chats" className="mt-4 inline-block text-sm text-amber-800 underline">
          ← Back to chats
        </Link>
      </div>
    );
  }

  const isWhatsApp = thread.source === "WHATSAPP";
  const waWindowOpen =
    isWhatsApp &&
    Boolean(
      thread.lastCustomerMessageAt &&
        Date.now() - new Date(thread.lastCustomerMessageAt).getTime() < 24 * 60 * 60 * 1000
    );

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-4xl flex-col px-4 py-4 sm:px-6">
      <div className="shrink-0 border-b border-stone-200 pb-4 dark:border-stone-700">
        <Link href="/admin/chats" className="text-sm text-amber-800 hover:underline dark:text-amber-400">
          ← All chats
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-stone-900 dark:text-stone-100">
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
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 dark:border-stone-600"
          >
            Mark {thread.status === "CLOSED" ? "open" : "closed"}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-stone-200 pt-4 dark:border-stone-700">
        {Object.keys(typingAdmins).length > 0 ? (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
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
            <p className="mb-2 text-xs text-stone-500">
              Reply goes to <strong>{thread.customerPhone ?? thread.waPhone}</strong> on{" "}
              <strong className="text-green-700">WhatsApp</strong> and appears in this thread.
            </p>
          ) : (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              The WhatsApp 24-hour reply window has closed. You can reply here again after the
              customer sends a new message.
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
          className="w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-600 dark:bg-stone-950"
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
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium dark:border-stone-600"
            >
              Attach files
            </button>
          ) : null}
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="text-xs text-stone-500">
              {f.name}{" "}
              <button type="button" className="text-red-600" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            disabled={sending || !reply.trim() || (isWhatsApp && !waWindowOpen)}
            onClick={() => void sendReply()}
            className="ml-auto rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-50 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
          >
            {sending ? "Sending…" : isWhatsApp ? "Send on WhatsApp" : "Send reply"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
