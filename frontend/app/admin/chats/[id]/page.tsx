"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Download,
  FileText,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Pencil,
  Play,
  SendHorizontal,
  Trash2,
  X
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  useCallback,
  Suspense
} from "react";
import { createPortal } from "react-dom";

import {
  deleteAdminEnquiryMessage,
  editAdminEnquiryMessage,
  fetchAdminEnquiryThread,
  getAdminEnquiryStreamUrl,
  patchAdminEnquiryStatus,
  replyAdminEnquiryThread,
  setAdminEnquiryTyping,
  type EnquiryAttachmentRow,
  type EnquiryMessageRow,
  type EnquiryThreadDetail
} from "@/lib/admin-api";
import { getApiBase } from "@/lib/api";
import { ENQUIRY_SOURCE_LABELS, type EnquirySource } from "@/lib/enquiry-subjects";
import {
  formatFileSize,
  MAX_ENQUIRY_ATTACHMENT_BYTES,
  MAX_ENQUIRY_ATTACHMENT_MB,
  MAX_ENQUIRY_ATTACHMENTS
} from "@/lib/enquiry-limits";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { ChatFollowUpControls } from "@/components/admin/ChatFollowUpControls";
import {
  ADMIN_CHATS_REFRESH_EVENT,
  openAdminStartWhatsAppChat
} from "@/components/admin/AdminChatsInbox";
import { MaskedPhoneReveal } from "@/components/admin/MaskedPhoneReveal";
import { parseWhatsAppMessageBody } from "@/lib/whatsapp-message-body";

/** Broad accept — strict MIME-only lists silently drop HEIC / odd desktop picks. */
const CHAT_FILE_ACCEPT =
  "image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm";

/** WhatsApp video must be MP4/3GPP (H.264). WebM/MOV are accepted by Exotel then fail delivery. */
const WA_CHAT_FILE_ACCEPT =
  "image/*,video/mp4,.mp4,audio/*,application/pdf,.pdf,.doc,.docx,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif";

const WA_VIDEO_MAX_BYTES = 16 * 1024 * 1024;

function isWhatsAppDeliverableVideo(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return mime === "video/mp4" || mime === "video/3gpp" || name.endsWith(".mp4") || name.endsWith(".3gp");
}

function isVideoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  return mime.startsWith("video/") || /\.(mp4|webm|mov|avi|mpeg|mpg|m4v|3gp)$/i.test(file.name);
}

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

function isImageMime(mime: string) {
  return mime.toLowerCase().startsWith("image/");
}

function isVideoMime(mime: string, fileName = "") {
  return (
    mime.toLowerCase().startsWith("video/") ||
    /\.(mp4|mov|webm|avi|mpeg|mpg|m4v)$/i.test(fileName)
  );
}

function isAudioMime(mime: string, fileName = "") {
  return (
    mime.toLowerCase().startsWith("audio/") ||
    /\.(mp3|m4a|ogg|wav|aac)$/i.test(fileName)
  );
}

function isPdfMime(mime: string, fileName?: string) {
  return (
    mime.toLowerCase() === "application/pdf" || /\.pdf$/i.test(fileName || "")
  );
}

function isExotelMediaUrl(url: string) {
  try {
    return new URL(url).hostname.includes("exotel-media");
  } catch {
    return false;
  }
}

function docExtLabel(fileName: string, mime: string): string {
  const fromName = fileName.split(".").pop()?.toUpperCase();
  if (fromName && fromName !== "BIN" && fromName.length <= 5) return fromName;
  const m = mime.toLowerCase();
  if (m.includes("wordprocessingml") || m.includes("msword")) return "DOCX";
  if (m.includes("spreadsheetml") || m.includes("ms-excel")) return "XLSX";
  if (m.includes("presentationml") || m.includes("ms-powerpoint")) return "PPTX";
  if (m === "application/pdf") return "PDF";
  if (m.startsWith("image/") || isImageMime(m)) return "IMG";
  if (isVideoMime(m, fileName)) return "MP4";
  if (isAudioMime(m, fileName)) return "AUD";
  return "FILE";
}

function displayFileName(fileName: string, mime: string): string {
  if (!/\.bin$/i.test(fileName)) return fileName;
  const ext = docExtLabel(fileName, mime).toLowerCase();
  if (ext === "file" || ext === "bin") return fileName;
  return fileName.replace(/\.bin$/i, `.${ext}`);
}

type MediaKind = "image" | "video" | "audio" | "document";

type MediaViewerState = {
  kind: MediaKind;
  url: string;
  fileName: string;
  mimeType: string;
  messageId: string;
  threadId: string;
  attachmentId?: string;
  canDelete: boolean;
  /** True when URL is a short-lived Exotel link (cannot play/download after expiry). */
  ephemeral?: boolean;
};

function mediaKindFor(mime: string, fileName: string): MediaKind {
  if (isImageMime(mime)) return "image";
  if (isVideoMime(mime, fileName)) return "video";
  if (isAudioMime(mime, fileName)) return "audio";
  return "document";
}

async function downloadViaProxy(downloadUrl: string, fileName: string) {
  const res = await fetch(downloadUrl, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function notifyInboxRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_CHATS_REFRESH_EVENT));
  }
}

/** WhatsApp-style double tick (blue when read/delivered, gray when sent). */
function WaTicks({ status }: { status?: string | null }) {
  if (status === "failed") {
    return (
      <span
        className="ml-1 text-[10px] font-bold uppercase tracking-wide text-red-600"
        title="WhatsApp could not deliver this message (unsupported media or provider error)"
      >
        Not delivered
      </span>
    );
  }
  if (!status) return null;
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

function MediaImage({
  src,
  alt,
  onOpen
}: {
  src: string;
  alt: string;
  onOpen?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="mb-1 rounded-lg bg-stone-50 px-3 py-2 text-[13px] text-stone-600">
        Image unavailable (WhatsApp link expired). Ask the customer to resend the photo.
      </p>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="mb-1 h-auto max-h-72 max-w-full cursor-pointer rounded-lg object-contain bg-stone-50"
        onError={() => setFailed(true)}
      />
    </button>
  );
}

function DocumentThumb({
  fileName,
  mimeType,
  onOpen
}: {
  fileName: string;
  mimeType: string;
  onOpen: () => void;
}) {
  const label = docExtLabel(fileName, mimeType);
  const name = displayFileName(fileName, mimeType);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-[14rem] max-w-xs items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left hover:bg-stone-100"
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#0b6b5f] text-white">
        <FileText size={22} strokeWidth={2} />
        <span className="absolute -bottom-1 -right-1 rounded bg-white px-1 text-[9px] font-bold text-[#0b6b5f] ring-1 ring-stone-200">
          {label}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-stone-800">{name}</span>
        <span className="text-[11px] text-stone-500">Tap to open / download</span>
      </span>
    </button>
  );
}

function VideoThumb({
  src,
  fileName,
  mimeType,
  onOpen,
  expired
}: {
  src?: string;
  fileName: string;
  mimeType: string;
  onOpen: () => void;
  expired?: boolean;
}) {
  const label = docExtLabel(fileName, mimeType);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative mb-1 block w-full max-w-xs overflow-hidden rounded-lg bg-black text-left"
    >
      {src && !expired ? (
        <video
          src={src}
          muted
          preload="metadata"
          className="h-44 w-full object-cover"
          onLoadedMetadata={(e) => {
            try {
              (e.currentTarget as HTMLVideoElement).currentTime = 0.1;
            } catch {
              /* ignore */
            }
          }}
        />
      ) : (
        <div className="flex h-44 w-full flex-col items-center justify-center gap-2 bg-stone-900 text-white">
          <Play size={28} className="opacity-70" />
          <span className="text-xs text-white/70">
            {expired ? "Video link expired" : "Video"}
          </span>
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white shadow">
          <Play size={22} fill="currentColor" className="ml-0.5" />
        </span>
      </span>
      <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
        {label}
      </span>
    </button>
  );
}

function DeleteConfirmModal({
  open,
  busy,
  isWhatsApp,
  notifyCustomer,
  onNotifyChange,
  onCancel,
  onConfirm
}: {
  open: boolean;
  busy?: boolean;
  isWhatsApp?: boolean;
  notifyCustomer: boolean;
  onNotifyChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-msg-title"
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#f7f3eb] shadow-2xl ring-1 ring-black/10"
      >
        <div className="border-b border-[#2c2420]/10 px-5 py-4">
          <h2 id="delete-msg-title" className="text-base font-semibold text-[#1c352a]">
            Delete message?
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            {isWhatsApp
              ? "WhatsApp cannot erase a message already on the customer’s phone. We can send them a short “please disregard” note instead."
              : "This removes the message from the admin chat."}
          </p>
          {isWhatsApp ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={notifyCustomer}
                disabled={busy}
                onChange={(e) => onNotifyChange(e.target.checked)}
              />
              <span>
                Tell the customer to disregard (sends a WhatsApp message if the 24-hour window is
                open)
              </span>
            </label>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-200/70 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaViewerOverlay({
  viewer,
  onClose,
  onRequestDelete
}: {
  viewer: MediaViewerState;
  onClose: () => void;
  onRequestDelete?: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const name = displayFileName(viewer.fileName, viewer.mimeType);
  const playable = !viewer.ephemeral;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    setDlError(null);
    if (viewer.ephemeral || !viewer.attachmentId) {
      setDlError(
        viewer.ephemeral
          ? "This WhatsApp media link has expired. Ask the customer to resend the file."
          : "Download unavailable for this item."
      );
      return;
    }
    setDownloading(true);
    try {
      const url = `${getApiBase()}/api/admin/enquiries/${encodeURIComponent(viewer.threadId)}/attachments/${encodeURIComponent(viewer.attachmentId)}/download`;
      await downloadViaProxy(url, name);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 bg-black/90 px-3 py-3 text-white shadow-lg">
        <p className="min-w-0 truncate text-sm font-medium">{name}</p>
        <div className="flex shrink-0 items-center gap-1">
          {viewer.canDelete && onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-red-300 hover:bg-white/20"
              title="Delete message"
              aria-label="Delete message"
            >
              <Trash2 size={18} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black px-3 pb-24 pt-2">
        {!playable ? (
          <div className="max-w-md rounded-2xl bg-white/10 px-6 py-8 text-center text-white">
            <p className="text-sm font-semibold">Media unavailable</p>
            <p className="mt-2 text-xs leading-relaxed text-white/75">
              This file was not saved to Sarveda storage in time (WhatsApp links expire in ~15
              minutes). Ask the customer to resend — new videos are stored permanently and will
              play here.
            </p>
          </div>
        ) : null}
        {playable && viewer.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={viewer.url}
            alt={name}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : null}
        {playable && viewer.kind === "video" ? (
          <video
            src={viewer.url}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        ) : null}
        {playable && viewer.kind === "audio" ? (
          <audio src={viewer.url} controls autoPlay className="w-full max-w-lg" />
        ) : null}
        {playable && viewer.kind === "document" && isPdfMime(viewer.mimeType, viewer.fileName) ? (
          <iframe title={name} src={viewer.url} className="h-full w-full max-w-5xl rounded-lg bg-white" />
        ) : null}
        {playable && viewer.kind === "document" && !isPdfMime(viewer.mimeType, viewer.fileName) ? (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/10 px-8 py-10 text-center text-white">
            <FileText size={48} />
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-white/70">Use the download button to save this file.</p>
          </div>
        ) : null}

        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          {dlError ? (
            <p className="max-w-xs rounded-lg bg-red-600/90 px-3 py-1.5 text-center text-[11px] font-medium text-white">
              {dlError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={downloading || viewer.ephemeral || !viewer.attachmentId}
            onClick={() => void handleDownload()}
            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-xl ring-4 ring-black/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download"
            aria-label="Download"
          >
            <Download size={24} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  threadId,
  isWhatsApp,
  onOpenMedia,
  onDelete,
  onEdited,
  onNotice,
  deleting
}: {
  message: EnquiryMessageRow;
  threadId: string;
  isWhatsApp?: boolean;
  onOpenMedia: (viewer: MediaViewerState) => void;
  onDelete?: () => void;
  onEdited?: (message: EnquiryMessageRow) => void;
  onNotice?: (text: string) => void;
  deleting?: boolean;
}) {
  const isAdmin = message.authorType === "ADMIN";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const parsed = parseWhatsAppMessageBody(message.body || "");
  const hasAttachments = message.attachments.length > 0;
  const canEditText = isAdmin && !hasAttachments && !parsed.mediaType;
  const inlineImageUrl =
    !hasAttachments && (parsed.mediaType === "image" || parsed.mediaType === "sticker")
      ? parsed.url
      : null;
  const inlineVideoUrl =
    !hasAttachments &&
    (parsed.mediaType === "video" ||
      (parsed.mediaType === "document" && /\.mp4(\?|$)/i.test(parsed.url || "")))
      ? parsed.url
      : null;
  const missingDurableVideo =
    !hasAttachments &&
    !inlineVideoUrl &&
    (parsed.mediaType === "video" || /\[video\]/i.test(message.body || ""));
  const inlineAudioUrl = !hasAttachments && parsed.mediaType === "audio" ? parsed.url : null;
  const inlineDocUrl =
    !hasAttachments && parsed.mediaType === "document" && !inlineVideoUrl && !missingDurableVideo
      ? parsed.url
      : null;
  const showText = Boolean(
    editing ||
      parsed.caption ||
      (!parsed.mediaType && parsed.text) ||
      (parsed.mediaType &&
        !parsed.caption &&
        !inlineImageUrl &&
        !inlineVideoUrl &&
        !inlineAudioUrl &&
        !inlineDocUrl &&
        !missingDurableVideo &&
        !hasAttachments)
  );

  function openAttachment(a: EnquiryAttachmentRow) {
    onOpenMedia({
      kind: mediaKindFor(a.mimeType, a.fileName),
      url: a.s3Url,
      fileName: a.fileName,
      mimeType: a.mimeType,
      messageId: message.id,
      threadId,
      attachmentId: a.id,
      canDelete: isAdmin,
      ephemeral: false
    });
  }

  function openEphemeral(kind: MediaKind, url: string, fileName: string, mimeType: string) {
    onOpenMedia({
      kind,
      url,
      fileName,
      mimeType,
      messageId: message.id,
      threadId,
      canDelete: isAdmin,
      ephemeral: !url || isExotelMediaUrl(url)
    });
  }

  async function saveEdit() {
    const next = draft.trim();
    if (!next || next === message.body.trim()) {
      setEditing(false);
      setDraft(message.body);
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await editAdminEnquiryMessage(threadId, message.id, next, {
        notifyCustomer: isWhatsApp ? notifyCustomer : false
      });
      const { whatsAppNotified: _w, notice, ...row } = updated;
      onEdited?.(row);
      if (notice) onNotice?.(notice);
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save edit");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className={`group/msg relative flex ${isAdmin ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[min(100%,32rem)] rounded-2xl px-3.5 py-2 shadow-sm ${
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
        {false && isAdmin ? (
          <div className="absolute -right-1 -top-2 z-10 flex gap-1 opacity-100 transition md:opacity-0 md:group-hover/msg:opacity-100 focus-within:opacity-100">
            {canEditText ? (
              <button
                type="button"
                disabled={deleting || editing}
                onClick={() => {
                  setDraft(message.body);
                  setEditError(null);
                  setNotifyCustomer(true);
                  setEditing(true);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0b6b5f] shadow ring-1 ring-stone-200 disabled:opacity-40"
                title={
                  isWhatsApp
                    ? "Edit and send a Correction to the customer"
                    : "Edit message"
                }
                aria-label="Edit message"
              >
                <Pencil size={13} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                disabled={deleting || editing}
                onClick={onDelete}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600 shadow ring-1 ring-stone-200 disabled:opacity-40"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {inlineImageUrl ? (
          <MediaImage
            src={inlineImageUrl}
            alt={parsed.caption || "WhatsApp image"}
            onOpen={() => openEphemeral("image", inlineImageUrl, "whatsapp-image.jpg", "image/jpeg")}
          />
        ) : null}
        {inlineVideoUrl ? (
          <VideoThumb
            src={isExotelMediaUrl(inlineVideoUrl) ? undefined : inlineVideoUrl}
            fileName="whatsapp-video.mp4"
            mimeType="video/mp4"
            expired={isExotelMediaUrl(inlineVideoUrl)}
            onOpen={() => openEphemeral("video", inlineVideoUrl, "whatsapp-video.mp4", "video/mp4")}
          />
        ) : null}
        {missingDurableVideo ? (
          <VideoThumb
            fileName="whatsapp-video.mp4"
            mimeType="video/mp4"
            expired
            onOpen={() => openEphemeral("video", "", "whatsapp-video.mp4", "video/mp4")}
          />
        ) : null}
        {inlineAudioUrl ? (
          <button
            type="button"
            className="mb-1 w-full rounded-lg bg-stone-100 px-3 py-2 text-left text-[13px] font-medium text-[#0b6b5f]"
            onClick={() => openEphemeral("audio", inlineAudioUrl, "whatsapp-audio.ogg", "audio/ogg")}
          >
            🎵 Play audio
          </button>
        ) : null}
        {inlineDocUrl ? (
          <DocumentThumb
            fileName={parsed.fileName || "document"}
            mimeType="application/octet-stream"
            onOpen={() =>
              openEphemeral(
                "document",
                inlineDocUrl,
                parsed.fileName || "document",
                "application/octet-stream"
              )
            }
          />
        ) : null}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full min-w-[16rem] resize-y rounded-xl border border-[#25d366]/50 bg-white px-3 py-2 text-[14px] text-stone-800 outline-none focus:border-[#25d366]"
              autoFocus
            />
            {isWhatsApp ? (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={notifyCustomer}
                  disabled={savingEdit}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                />
                <span>
                  Send a <strong>Correction</strong> message to the customer (WhatsApp cannot rewrite
                  the old bubble)
                </span>
              </label>
            ) : null}
            {editError ? <p className="text-[11px] font-medium text-red-600">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                  setEditError(null);
                }}
                className="rounded-full px-3 py-1 text-[12px] font-semibold text-stone-600 hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit || !draft.trim()}
                onClick={() => void saveEdit()}
                className="rounded-full bg-[#25d366] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {savingEdit
                  ? "Saving…"
                  : isWhatsApp && notifyCustomer
                    ? "Save & notify"
                    : "Save"}
              </button>
            </div>
          </div>
        ) : showText ? (
          <p className="whitespace-pre-wrap text-[15px] leading-[1.35] text-[#1a2e1a] md:text-[14px] md:leading-relaxed">
            {parsed.text}
          </p>
        ) : null}
        {hasAttachments ? (
          <ul
            className={`space-y-2 text-xs ${showText || inlineImageUrl || inlineVideoUrl || missingDurableVideo ? "mt-2 border-t pt-2" : ""} border-stone-200/80`}
          >
            {message.attachments.map((a) => (
              <li key={a.id}>
                {isImageMime(a.mimeType) ? (
                  <button type="button" className="block w-full text-left" onClick={() => openAttachment(a)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.s3Url}
                      alt={displayFileName(a.fileName, a.mimeType)}
                      className="h-auto max-h-72 max-w-full cursor-pointer rounded-lg object-contain bg-stone-50"
                    />
                  </button>
                ) : isVideoMime(a.mimeType, a.fileName) ? (
                  <VideoThumb
                    src={a.s3Url}
                    fileName={a.fileName}
                    mimeType={a.mimeType}
                    onOpen={() => openAttachment(a)}
                  />
                ) : isAudioMime(a.mimeType, a.fileName) ? (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-stone-100 px-3 py-2 text-left text-[13px] font-medium text-[#0b6b5f]"
                    onClick={() => openAttachment(a)}
                  >
                    🎵 {displayFileName(a.fileName, a.mimeType)}
                  </button>
                ) : (
                  <DocumentThumb
                    fileName={a.fileName}
                    mimeType={a.mimeType}
                    onOpen={() => openAttachment(a)}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#5a7a5a]">
          {message.editedAt ? <span className="italic">Edited</span> : null}
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
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [typingAdmins, setTypingAdmins] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<MediaViewerState | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteNotifyCustomer, setDeleteNotifyCustomer] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSignal = useRef(0);
  const scrollToBottomRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const next: Record<string, string> = {};
    const urls: string[] = [];
    files.forEach((file, index) => {
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) {
        return;
      }
      const key = `${file.name}-${file.size}-${index}`;
      const url = URL.createObjectURL(file);
      next[key] = url;
      urls.push(url);
    });
    setFilePreviews(next);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function addSelectedFiles(list: FileList | null) {
    if (!list || list.length === 0) {
      setError("No file selected.");
      return;
    }
    const waThread = thread?.source === "WHATSAPP";
    const incoming = Array.from(list);
    const rejected: string[] = [];
    const merged = [...files];
    for (const file of incoming) {
      if (merged.length >= MAX_ENQUIRY_ATTACHMENTS) {
        rejected.push(`${file.name} (max ${MAX_ENQUIRY_ATTACHMENTS} files)`);
        continue;
      }
      if (file.size <= 0) {
        rejected.push(`${file.name} (empty file)`);
        continue;
      }
      if (file.size > MAX_ENQUIRY_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} (over ${MAX_ENQUIRY_ATTACHMENT_MB} MB)`);
        continue;
      }
      if (waThread && isVideoFile(file)) {
        if (!isWhatsAppDeliverableVideo(file)) {
          rejected.push(`${file.name} (WhatsApp needs MP4, not WebM/MOV)`);
          continue;
        }
        if (file.size > WA_VIDEO_MAX_BYTES) {
          rejected.push(`${file.name} (WhatsApp video max 16 MB)`);
          continue;
        }
      }
      merged.push(file);
    }
    setFiles(merged);
    if (rejected.length) {
      setError(`Could not add: ${rejected.join("; ")}`);
    } else {
      setError(null);
    }
  }

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
      // Force scroll after inbound media / SSE refresh (images may layout late).
      requestAnimationFrame(() => {
        scrollToBottomRef.current();
        window.setTimeout(() => scrollToBottomRef.current(), 120);
        window.setTimeout(() => scrollToBottomRef.current(), 400);
      });
    } catch (e) {
      setThread(null);
      setError(e instanceof Error ? e.message : "Could not load conversation");
    }
  }, [id]);

  useEffect(() => {
    setThread(null);
    setReply("");
    setFiles([]);
    setViewer(null);
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
  scrollToBottomRef.current = scrollToBottom;

  useLayoutEffect(() => {
    if (!thread?.messages.length) return;
    scrollToBottom();
  }, [
    id,
    thread?.messages.length,
    thread?.messages[thread.messages.length - 1]?.id,
    thread?.messages[thread.messages.length - 1]?.attachments?.length,
    scrollToBottom
  ]);

  async function handleDeleteMessage(messageId: string) {
    if (!id) return;
    setDeletingId(messageId);
    setError(null);
    try {
      const result = await deleteAdminEnquiryMessage(id, messageId, {
        notifyCustomer: thread?.source === "WHATSAPP" ? deleteNotifyCustomer : false
      });
      setViewer((v) => (v?.messageId === messageId ? null : v));
      setPendingDeleteId(null);
      if (result.notice) setBanner(result.notice);
      await load();
      notifyInboxRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete message");
    } finally {
      setDeletingId(null);
    }
  }

  const canSend = Boolean(reply.trim() || files.length > 0) && !sending;

  async function sendReply() {
    if (!canSend || !id) return;
    setSending(true);
    setError(null);
    const hasMedia = files.length > 0;
    setUploadPercent(hasMedia ? 0 : null);
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    void setAdminEnquiryTyping(id, false).catch(() => undefined);
    try {
      await replyAdminEnquiryThread(
        id,
        reply.trim(),
        files,
        hasMedia ? { onUploadProgress: (pct) => setUploadPercent(pct) } : undefined
      );
      setReply("");
      setFiles([]);
      setUploadPercent(null);
      await load();
      notifyInboxRefresh();
      requestAnimationFrame(() => scrollToBottom());
      inputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply");
      setUploadPercent(null);
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
      setMenuOpen(false);
      await load();
      notifyInboxRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update status");
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onDocPointer(ev: MouseEvent | TouchEvent) {
      const el = menuRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
    };
  }, [menuOpen]);

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
  const displayName =
    thread.customerName?.trim() || thread.customerEmail?.trim() || "Customer";
  const initial = (displayName[0] || "?").toUpperCase();
  const sessionOpen = !isWhatsApp || isWhatsAppSessionOpen(thread.lastCustomerMessageAt);
  const composerLocked = isWhatsApp && !sessionOpen;
  const sourceLabel = ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source;

  const detailsModal =
    detailsOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[230] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-details-title"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget) setDetailsOpen(false);
            }}
          >
            <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-[#f7f3eb] shadow-xl sm:max-w-md sm:rounded-2xl">
              <div className="sticky top-0 flex items-center justify-between border-b border-[#e8e2d9] bg-[#f7f3eb] px-4 py-3">
                <h2 id="chat-details-title" className="text-[17px] font-semibold text-[#1c352a]">
                  Contact details
                </h2>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-black/5"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col items-center gap-2 px-4 pb-2 pt-5">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{
                    background: isWhatsApp
                      ? "linear-gradient(135deg, #25d366, #128c7e)"
                      : "linear-gradient(135deg, #1c352a, #2d5040)"
                  }}
                  aria-hidden
                >
                  {initial}
                </div>
                <p className="text-center text-[18px] font-semibold text-[#1c352a]">{displayName}</p>
                <p className="text-[13px] font-medium uppercase tracking-wide text-stone-500">
                  {sourceLabel}
                  {thread.status === "CLOSED" ? " · Closed" : ""}
                </p>
              </div>
              <dl className="divide-y divide-[#e8e2d9] px-2 pb-6">
                {[
                  { label: "Name", value: thread.customerName?.trim() || "—" },
                  { label: "Email", value: thread.customerEmail?.trim() || "—" },
                  {
                    label: "Mobile",
                    value: (thread.customerPhone || thread.waPhone || "").trim() || "—"
                  },
                  { label: "Channel", value: sourceLabel },
                  ...(thread.orderNumber
                    ? [{ label: "Order", value: thread.orderNumber }]
                    : []),
                  ...(thread.contextTitle
                    ? [{ label: "Context", value: thread.contextTitle }]
                    : [])
                ].map((row) => (
                  <div key={row.label} className="flex flex-col gap-0.5 px-3 py-3">
                    <dt className="text-[12px] font-medium uppercase tracking-wide text-stone-400">
                      {row.label}
                    </dt>
                    <dd className="break-words text-[15px] text-stone-800">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="admin-chat-thread-root relative flex h-full min-h-0 flex-col bg-[#efe8dc]">
      {detailsModal}
      {viewer ? (
        <MediaViewerOverlay
          viewer={viewer}
          onClose={() => setViewer(null)}
          onRequestDelete={
            viewer.canDelete
              ? () => {
                  setPendingDeleteId(viewer.messageId);
                }
              : undefined
          }
        />
      ) : null}
      <DeleteConfirmModal
        open={Boolean(pendingDeleteId)}
        busy={Boolean(deletingId)}
        isWhatsApp={isWhatsApp}
        notifyCustomer={deleteNotifyCustomer}
        onNotifyChange={setDeleteNotifyCustomer}
        onCancel={() => {
          if (!deletingId) setPendingDeleteId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteId) void handleDeleteMessage(pendingDeleteId);
        }}
      />

      {/* Mobile: WhatsApp-height header (back · avatar · name · ⋮) — replaces shell "Chats" bar */}
      <div
        className="admin-chat-thread-header relative flex h-14 shrink-0 items-center gap-1 px-1 md:hidden"
        style={{
          background: isWhatsApp ? "#075e54" : "#1c352a"
        }}
      >
        <Link
          href="/admin/chats"
          className="inline-flex h-11 w-10 items-center justify-center text-[#faf5ec] hover:bg-white/10"
          aria-label="Back to chats"
        >
          <ChevronLeft size={26} strokeWidth={2} />
        </Link>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{
            background: isWhatsApp
              ? "linear-gradient(135deg, #25d366, #128c7e)"
              : "rgba(255,255,255,0.15)"
          }}
          aria-hidden
        >
          {initial}
        </div>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            setDetailsOpen(true);
          }}
          className="min-w-0 flex-1 truncate px-2 text-left text-[17px] font-medium leading-tight text-[#faf5ec]"
        >
          {displayName}
        </button>
        <div className="relative shrink-0" ref={menuRef}>
          <div className="flex items-center gap-0.5">
            <div className="md:hidden">
              <ChatFollowUpControls threadId={thread.id} lightHeader />
            </div>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center text-[#faf5ec] hover:bg-white/10"
            aria-label="Chat options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical size={22} />
          </button>
          </div>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-1 top-12 z-30 min-w-[11.5rem] overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-black/10"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDetailsOpen(true);
                }}
                className="block w-full px-4 py-3 text-left text-[15px] text-stone-800 hover:bg-stone-100"
              >
                View details
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void toggleStatus()}
                className="block w-full px-4 py-3 text-left text-[15px] text-stone-800 hover:bg-stone-100"
              >
                Mark {thread.status === "CLOSED" ? "open" : "closed"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop: existing rich header */}
      <div
        className="hidden shrink-0 items-center gap-3 border-b px-3 py-2.5 md:flex"
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
          <h1 className="truncate text-[16px] font-semibold text-[#faf5ec]">{displayName}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[16px] font-semibold text-[#faf5ec]/90">
            {isWhatsApp ? (
              <MaskedPhoneReveal
                phone={thread.customerPhone ?? thread.waPhone}
                light
                className="text-[#faf5ec]/90"
              />
            ) : (
              <>
                <span className="truncate font-semibold">{thread.customerEmail}</span>
                {thread.customerPhone ? (
                  <>
                    <span className="font-normal text-[#a8c4b0]">·</span>
                    <MaskedPhoneReveal phone={thread.customerPhone} light className="text-[#faf5ec]/90" />
                  </>
                ) : null}
              </>
            )}
            <span className="font-normal text-[#a8c4b0]">·</span>
            <span className="text-[14px] font-normal text-[#a8c4b0]">
              {sourceLabel}
              {thread.orderNumber ? ` · ${thread.orderNumber}` : ""}
            </span>
          </p>
        </div>
        <ChatFollowUpControls threadId={thread.id} lightHeader />
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
        className="admin-chat-thread-messages min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 md:px-4 md:py-3"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c4b8a4' fill-opacity='0.12'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\"), linear-gradient(180deg, #ebe4d6, #efe8dc)"
        }}
      >
        {thread.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            threadId={thread.id}
            isWhatsApp={isWhatsApp}
            onOpenMedia={setViewer}
            onEdited={(updated) => {
              setThread((prev) =>
                prev
                  ? {
                      ...prev,
                      messages: prev.messages.map((row) =>
                        row.id === updated.id ? { ...row, ...updated } : row
                      )
                    }
                  : prev
              );
              void load();
            }}
            onNotice={(text) => setBanner(text)}
            onDelete={
              m.authorType === "ADMIN"
                ? () => {
                    setDeleteNotifyCustomer(true);
                    setPendingDeleteId(m.id);
                  }
                : undefined
            }
            deleting={deletingId === m.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Fixed composer — same surface as messages so it feels emerged */}
      <div
        className="admin-chat-thread-composer relative shrink-0 px-2 py-2 md:border-t md:border-[#2c2420]/20 md:px-3"
        style={{ background: "#efe8dc" }}
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
          <div className="mb-2 rounded-xl border border-[#25d366]/40 bg-white p-2 shadow-sm">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#128c7e]">
              {files.length} file{files.length === 1 ? "" : "s"} ready — click send to upload
            </p>
            <ul className="max-h-36 space-y-1.5 overflow-y-auto">
              {files.map((f, i) => {
                const key = `${f.name}-${f.size}-${i}`;
                const thumb = filePreviews[key];
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-stone-200 text-sm">
                        📎
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-stone-800">{f.name}</p>
                      <p className="text-[10px] text-stone-500">{formatFileSize(f.size)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={sending}
                      className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {uploadPercent != null ? (
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-stone-600">
              <span>Uploading…</span>
              <span>{uploadPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-[#25d366] transition-[width] duration-150"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={isWhatsApp ? WA_CHAT_FILE_ACCEPT : CHAT_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addSelectedFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-black/5 hover:text-[#1c352a] disabled:opacity-40"
            title={
              isWhatsApp
                ? "Attach files (videos must be MP4, max 16 MB)"
                : "Attach files"
            }
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
            disabled={sending}
            placeholder={files.length ? "Add a caption (optional)…" : "Type a message"}
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-full border border-[#2c2420]/35 bg-white px-4 py-2.5 text-sm leading-5 text-stone-800 outline-none focus:border-[#25d366] disabled:opacity-60"
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

        {error ? (
          <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        ) : null}
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
