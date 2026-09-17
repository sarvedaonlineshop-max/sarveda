/**
 * WhatsApp shared inbox (Exotel WABA).
 *
 * Inbound customer messages arrive on the Exotel webhook and are stored as
 * EnquiryThread/EnquiryMessage rows with source WHATSAPP, so they appear in
 * the existing admin Chats UI. Admin replies for WHATSAPP threads go out as
 * Exotel session text messages (24h window) instead of email.
 *
 * Auto-replies are handled by the interactive button/list bot in
 * `whatsapp-bot.service`.
 */
import { randomUUID } from "crypto";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { uploadAsset } from "../../config/s3";
import { ENQUIRY_MEDIA_S3_PREFIX } from "../enquiries/enquiries.constants";
import { publishEnquiryEvent } from "../enquiries/enquiry-realtime";
import { toWhatsAppE164 } from "../notifications/whatsapp";
import { enqueueBotTurn } from "./whatsapp-bot.service";
import { isExotelConfigured, sendExotelWhatsAppContent } from "./whatsapp-exotel";
import { createSupportFlowToken } from "./whatsapp-flow.token";

export const WA_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export { WA_BOT_AUTHOR, isGreeting } from "./whatsapp-bot.service";

const MAX_INBOUND_MEDIA_BYTES = 50 * 1024 * 1024;

/** Synthetic, non-routable email for WA-only contacts (EnquiryThread.customerEmail is required). */
function syntheticWaEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, "")}@whatsapp.invalid`;
}

/**
 * Send a free-form session text (valid only inside the customer's 24h window).
 * Returns the provider message sid when available.
 */
export async function sendWhatsAppSessionText(toE164: string, body: string): Promise<string | null> {
  return sendExotelWhatsAppContent(
    toE164,
    {
      recipient_type: "individual",
      type: "text",
      text: { body: body.slice(0, 4096) }
    },
    "whatsapp_session_text_sent"
  );
}

/** Send a session media message (image / video / audio / document) via public HTTPS link. */
export async function sendWhatsAppSessionMedia(
  toE164: string,
  input: { link: string; mimeType: string; fileName: string; caption?: string }
): Promise<string | null> {
  const mime = input.mimeType.toLowerCase();
  const caption = input.caption?.trim().slice(0, 1024) || undefined;
  const link = input.link;
  const nameLower = input.fileName.toLowerCase();

  // WhatsApp/Exotel only deliver MP4/3GPP as video. WebM/MOV etc. are accepted by the
  // API then fail delivery (we saw waStatus=failed for admin screencasts).
  if (
    mime.startsWith("video/") &&
    mime !== "video/mp4" &&
    mime !== "video/3gpp" &&
    !nameLower.endsWith(".mp4") &&
    !nameLower.endsWith(".3gp")
  ) {
    throw new Error(
      `WhatsApp cannot deliver ${input.fileName || "this video"}. Please send an MP4 (H.264) file under 16 MB.`
    );
  }

  let content: Record<string, unknown>;
  if (mime.startsWith("image/")) {
    content = { type: "image", image: { link, ...(caption ? { caption } : {}) } };
  } else if (
    mime === "video/mp4" ||
    mime === "video/3gpp" ||
    nameLower.endsWith(".mp4") ||
    nameLower.endsWith(".3gp")
  ) {
    content = {
      type: "video",
      video: { link, ...(caption ? { caption } : {}) }
    };
  } else if (mime.startsWith("video/")) {
    // Unreachable due to throw above — kept for safety.
    throw new Error(
      `WhatsApp cannot deliver ${input.fileName || "this video"}. Please send an MP4 (H.264) file under 16 MB.`
    );
  } else if (mime.startsWith("audio/")) {
    content = { type: "audio", audio: { link } };
  } else {
    content = {
      type: "document",
      document: {
        link,
        filename: input.fileName.slice(0, 240),
        ...(caption ? { caption } : {})
      }
    };
  }

  return sendExotelWhatsAppContent(toE164, content, "whatsapp_session_media_sent");
}

// ---------------------------------------------------------------------------
// Meta Flow CTA (parked)
//
// Kept for the dynamic Flow path, which is blocked on Meta signing our business
// public key. The live support menu uses interactive lists instead — see
// `whatsapp-bot.service`.
// ---------------------------------------------------------------------------

function supportFlowId(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_ID?.trim() || "1037332878669898";
}

function supportFlowScreen(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_SCREEN?.trim() || "SUPPORT_MENU";
}

function supportFlowCta(): string {
  return (process.env.WHATSAPP_SUPPORT_FLOW_CTA?.trim() || "Menu").slice(0, 20);
}

/** Send the published support-menu Flow as an interactive CTA message. */
export async function sendSupportMenuFlow(toE164: string): Promise<string | null> {
  return sendExotelWhatsAppContent(
    toE164,
    {
      type: "interactive",
      interactive: {
        type: "flow",
        header: { type: "text", text: "Sarveda Support" },
        body: { text: "How can we help you today?" },
        footer: { text: "We're here to help." },
        action: {
          name: "flow",
          parameters: {
            mode: "published",
            flow_message_version: "3",
            flow_id: supportFlowId(),
            flow_token: createSupportFlowToken(toE164),
            flow_cta: supportFlowCta(),
            flow_action: "navigate",
            flow_action_payload: { screen: supportFlowScreen() }
          }
        }
      }
    },
    "whatsapp_support_menu_sent"
  );
}

// ---------------------------------------------------------------------------
// Inbound webhook parsing (tolerant — Exotel payload shapes vary by account)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Human-readable body from an Exotel/Meta-style content object. */
function extractMedia(content: AnyRecord | null): {
  mediaType: "image" | "video" | "audio" | "document" | "sticker";
  caption: string | null;
  fileName: string | null;
  link: string | null;
} | null {
  if (!content) return null;
  for (const mediaType of ["image", "video", "audio", "document", "sticker"] as const) {
    const media = asRecord(content[mediaType]);
    if (!media) continue;
    return {
      mediaType,
      caption: asString(media.caption),
      fileName:
        asString(media.filename) ??
        asString(media.file_name) ??
        asString(media.name) ??
        asString(media.title),
      link: asString(media.link) ?? asString(media.url)
    };
  }
  return null;
}

/** Human-readable body from an Exotel/Meta-style content object. */
function extractBody(content: AnyRecord | null, fallback: AnyRecord): string {
  if (!content) {
    return asString(fallback.body) ?? asString(fallback.text) ?? "";
  }
  const type = asString(content.type) ?? "";

  const text = asRecord(content.text);
  if (text) {
    const body = asString(text.body);
    if (body) return body;
  }

  const button = asRecord(content.button);
  if (button) {
    const t = asString(button.text) ?? asString(button.payload);
    if (t) return t;
  }

  const interactive = asRecord(content.interactive);
  if (interactive) {
    const br = asRecord(interactive.button_reply);
    const lr = asRecord(interactive.list_reply);
    const t = asString(br?.title) ?? asString(lr?.title);
    if (t) return t;
  }

  const media = extractMedia(content);
  if (media) {
    // Keep the Exotel URL in body as a fallback for admin UI until/unless S3 mirror succeeds.
    const parts = [`[${media.mediaType}]`];
    if (media.fileName) parts.push(media.fileName);
    if (media.caption) parts.push(media.caption);
    if (media.link) parts.push(media.link);
    return parts.join(" ");
  }

  const location = asRecord(content.location);
  if (location) {
    return `[location] ${asString(location.latitude) ?? location.latitude},${asString(location.longitude) ?? location.longitude}`;
  }

  if (type) return `[${type} message]`;
  return "";
}

function mimeForWaMedia(
  mediaType: string,
  fileName: string | null,
  contentTypeHeader: string | null
): string {
  const header = contentTypeHeader?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (header && header !== "application/octet-stream") return header;
  const ext = (fileName?.split(".").pop() || "").toLowerCase();
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    wav: "audio/wav",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    zip: "application/zip"
  };
  if (ext && byExt[ext]) return byExt[ext];
  switch (mediaType) {
    case "image":
    case "sticker":
      return "image/jpeg";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/ogg";
    case "document":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function extForMime(mime: string, mediaType: string, fileName?: string | null): string {
  const fromName = (fileName?.split(".").pop() || "").toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName) && fromName !== "bin") {
    return fromName;
  }
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/csv": "csv",
    "text/plain": "txt",
    "application/zip": "zip"
  };
  if (map[mime]) return map[mime];
  if (mediaType === "image" || mediaType === "sticker") return "jpg";
  if (mediaType === "video") return "mp4";
  if (mediaType === "audio") return "ogg";
  if (mediaType === "document") return "pdf";
  return "bin";
}

/**
 * Mirror Exotel/WhatsApp media to Sarveda S3 so admin chat does not depend on
 * short-lived pre-signed Exotel URLs (~15 min).
 */
async function mirrorWhatsAppMediaToEnquiryAttachment(input: {
  messageId: string;
  mediaType: string;
  link: string;
  fileName: string | null;
  caption: string | null;
}): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(input.link);
  } catch {
    logger.warn("whatsapp_inbound_media_bad_url", { messageId: input.messageId });
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const linkPath = decodeURIComponent(parsed.pathname);
  const linkLooksVideo = /\.(mp4|mov|webm|avi|mpeg|mpg|m4v)(\?|$)/i.test(linkPath);
  const linkLooksAudio = /\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(linkPath);
  const linkExt = (linkPath.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const inferredName =
    input.fileName ||
    (linkExt && linkExt !== "bin" ? `whatsapp-${input.mediaType}.${linkExt}` : null);

  const timeoutMs = linkLooksVideo || input.mediaType === "video" ? 90_000 : 45_000;
  const res = await fetch(input.link, {
    headers: {
      "User-Agent": "SarvedaWhatsAppInbox/1.0",
      Accept: "*/*"
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow"
  });
  if (!res.ok) {
    logger.warn("whatsapp_inbound_media_fetch_failed", {
      status: res.status,
      mediaType: input.mediaType,
      messageId: input.messageId,
      host: parsed.host
    });
    return false;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_INBOUND_MEDIA_BYTES) {
    logger.warn("whatsapp_inbound_media_size_rejected", {
      bytes: buf.length,
      max: MAX_INBOUND_MEDIA_BYTES,
      messageId: input.messageId
    });
    return false;
  }

  const mime = mimeForWaMedia(
    input.mediaType,
    inferredName,
    res.headers.get("content-type")
  );
  const effectiveMediaType =
    mime.startsWith("video/") ||
    linkLooksVideo ||
    /\.(mp4|mov|webm|avi|mpeg|mpg|m4v)$/i.test(inferredName || "")
      ? "video"
      : mime.startsWith("audio/") ||
          linkLooksAudio ||
          /\.(mp3|m4a|ogg|wav|aac)$/i.test(inferredName || "")
        ? "audio"
        : mime.startsWith("image/")
          ? "image"
          : input.mediaType;
  const ext = extForMime(mime, effectiveMediaType, inferredName);
  const cleaned = inferredName?.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
  const hasExt = Boolean(cleaned && /\.[a-z0-9]{1,8}$/i.test(cleaned));
  const safeName =
    cleaned && hasExt
      ? cleaned
      : cleaned
        ? `${cleaned}.${ext}`
        : `whatsapp-${effectiveMediaType}.${ext}`;
  const storeMime =
    mime.startsWith("application/octet-stream") && effectiveMediaType === "video"
      ? "video/mp4"
      : mime;
  const s3Key = `${ENQUIRY_MEDIA_S3_PREFIX}/${new Date().getFullYear()}/wa-${randomUUID()}.${ext}`;
  const s3Url = await uploadAsset(s3Key, buf, storeMime);
  if (!s3Url) {
    logger.warn("whatsapp_inbound_media_s3_failed", { messageId: input.messageId, s3Key });
    return false;
  }

  await prisma.enquiryAttachment.create({
    data: {
      messageId: input.messageId,
      fileName: safeName,
      mimeType: storeMime,
      fileSizeBytes: buf.length,
      s3Key,
      s3Url
    }
  });

  const cleanBody =
    input.caption?.trim() ||
    (effectiveMediaType === "document" && inferredName
      ? `[document] ${inferredName}`
      : `[${effectiveMediaType}]`);
  await prisma.enquiryMessage.update({
    where: { id: input.messageId },
    data: { body: cleanBody }
  });

  return true;
}

/**
 * Stable id behind a tapped button or list row. The bot routes on this rather
 * than the visible title, so wording changes can't break routing.
 */
function extractReplyId(content: AnyRecord | null): string | null {
  if (!content) return null;

  const interactive = asRecord(content.interactive);
  if (interactive) {
    const br = asRecord(interactive.button_reply);
    const lr = asRecord(interactive.list_reply);
    const id = asString(br?.id) ?? asString(lr?.id);
    if (id) return id;
  }

  // Template quick-reply buttons surface the id as a payload instead.
  const button = asRecord(content.button);
  if (button) {
    const payload = asString(button.payload);
    if (payload) return payload;
  }

  return null;
}

type ParsedInbound = {
  kind: "message";
  sid: string | null;
  from: string;
  profileName: string | null;
  body: string;
  replyId: string | null;
  media: {
    mediaType: "image" | "video" | "audio" | "document" | "sticker";
    caption: string | null;
    fileName: string | null;
    link: string | null;
  } | null;
};

type ParsedStatus = {
  kind: "status";
  sid: string;
  status: string;
  /** Provider detail kept for failures so logs explain why delivery failed. */
  detail?: string;
};

/**
 * Exotel reports delivery state as `exo_detailed_status` (EX_MESSAGE_DELIVERED,
 * EX_UNKNOWN_ERROR, ...) rather than a plain `status`. Anything that is not an
 * explicit sent/delivered/seen signal counts as a failure.
 */
function exotelStatusToWaStatus(detailed: string): string {
  switch (detailed.toUpperCase()) {
    case "EX_MESSAGE_QUEUED":
    case "EX_MESSAGE_ACCEPTED":
      return "queued";
    case "EX_MESSAGE_SENT":
      return "sent";
    case "EX_MESSAGE_DELIVERED":
      return "delivered";
    case "EX_MESSAGE_SEEN":
      return "read";
    default:
      return "failed";
  }
}

function parseCallbackItem(item: AnyRecord): ParsedInbound | ParsedStatus | null {
  const callbackType = asString(item.callback_type) ?? "";
  const sid = asString(item.sid) ?? asString(item.message_sid) ?? null;
  const status = asString(item.status);
  const detailedStatus = asString(item.exo_detailed_status);

  // Delivery receipt: dlr / message-status callbacks carry sid + status, no content.
  const looksLikeDlr =
    callbackType === "dlr" ||
    callbackType === "message-status" ||
    Boolean(detailedStatus) ||
    (Boolean(status) && !item.content && !item.text && !asString(item.body));
  if (looksLikeDlr) {
    if (!sid) return null;
    if (detailedStatus) {
      const code = typeof item.exo_status_code === "number" ? String(item.exo_status_code) : null;
      const detail = [detailedStatus, code, asString(item.description)].filter(Boolean).join(" ");
      return { kind: "status", sid, status: exotelStatusToWaStatus(detailedStatus), detail };
    }
    if (!status) return null;
    return { kind: "status", sid, status: status.toLowerCase() };
  }

  const fromRaw =
    asString(item.from) ?? asString(asRecord(item.whatsapp)?.from) ?? asString(item.mobile);
  const from = fromRaw ? toWhatsAppE164(fromRaw) : null;
  if (!from) return null;

  const profile = asRecord(item.profile);
  const profileName = asString(item.profile_name) ?? asString(profile?.name);
  const content = asRecord(item.content);
  const body = extractBody(content, item);
  if (!body) return null;

  return {
    kind: "message",
    sid,
    from,
    profileName,
    body,
    replyId: extractReplyId(content),
    media: extractMedia(content)
  };
}

/** Flatten known Exotel webhook shapes into individual callback items. */
function collectCallbackItems(payload: unknown): AnyRecord[] {
  const root = asRecord(payload);
  if (!root) return [];

  const wa = asRecord(root.whatsapp);
  const fromWa = Array.isArray(wa?.messages) ? (wa!.messages as unknown[]) : null;
  const topMessages = Array.isArray(root.messages) ? (root.messages as unknown[]) : null;

  const list = fromWa ?? topMessages ?? [root];
  return list.map(asRecord).filter((r): r is AnyRecord => r !== null);
}

type StoredInbound = { threadId: string; customerName: string };

async function upsertInboundMessage(msg: ParsedInbound): Promise<StoredInbound | null> {
  // Idempotency: Exotel retries webhooks; skip if we already stored this sid.
  if (msg.sid) {
    const existing = await prisma.enquiryMessage.findUnique({
      where: { waMessageSid: msg.sid },
      select: { id: true }
    });
    if (existing) {
      logger.info("whatsapp_inbound_duplicate_skipped", { sid: msg.sid });
      return null;
    }
  }

  const now = new Date();
  const displayName = msg.profileName || msg.from;
  const email = syntheticWaEmail(msg.from);

  let thread = await prisma.enquiryThread.findFirst({
    where: { source: "WHATSAPP", waPhone: msg.from },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, customerName: true }
  });

  if (!thread) {
    thread = await prisma.enquiryThread.create({
      data: {
        source: "WHATSAPP",
        customerName: displayName,
        customerEmail: email,
        customerPhone: msg.from,
        waPhone: msg.from,
        unreadByAdmin: true,
        lastMessageAt: now,
        lastCustomerMessageAt: now
      },
      select: { id: true, customerName: true }
    });
  }

  const created = await prisma.enquiryMessage.create({
    data: {
      threadId: thread.id,
      authorType: "CUSTOMER",
      authorName: displayName,
      authorEmail: email,
      body: msg.body,
      waMessageSid: msg.sid
    },
    select: { id: true }
  });

  // Notify admins immediately — do not wait on media download/S3 (can take many seconds).
  void import("../../config/firebase")
    .then(({ sendPushToAdmins }) =>
      sendPushToAdmins(
        "New WhatsApp chat",
        `${displayName}: ${(msg.body || "New message").slice(0, 140)}`,
        {
          type: "chat",
          chatId: thread.id,
          source: "WHATSAPP"
        }
      )
    )
    .catch(() => undefined);

  if (msg.media?.link) {
    try {
      const mirrored = await mirrorWhatsAppMediaToEnquiryAttachment({
        messageId: created.id,
        mediaType: msg.media.mediaType,
        link: msg.media.link,
        fileName: msg.media.fileName,
        caption: msg.media.caption
      });
      if (mirrored) {
        logger.info("whatsapp_inbound_media_mirrored", {
          messageId: created.id,
          mediaType: msg.media.mediaType
        });
      } else {
        // Never leave short-lived Exotel URLs in the body — they expire in ~15 min.
        const link = msg.media.link || "";
        const looksVideo =
          msg.media.mediaType === "video" || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(link);
        const label = looksVideo
          ? "[video]"
          : msg.media.mediaType === "audio"
            ? "[audio]"
            : msg.media.mediaType === "image" || msg.media.mediaType === "sticker"
              ? "[image]"
              : msg.media.fileName
                ? `[document] ${msg.media.fileName}`
                : "[document]";
        const caption = msg.media.caption?.trim();
        await prisma.enquiryMessage.update({
          where: { id: created.id },
          data: { body: caption ? `${label} ${caption}` : label }
        });
        logger.warn("whatsapp_inbound_media_mirror_skipped", {
          messageId: created.id,
          mediaType: msg.media.mediaType,
          hasFileName: Boolean(msg.media.fileName),
          linkHost: (() => {
            try {
              return new URL(msg.media.link!).host;
            } catch {
              return "invalid";
            }
          })()
        });
      }
    } catch (err) {
      logger.warn("whatsapp_inbound_media_mirror_failed", {
        messageId: created.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  await prisma.enquiryThread.update({
    where: { id: thread.id },
    data: {
      status: "OPEN",
      unreadByAdmin: true,
      lastMessageAt: now,
      lastCustomerMessageAt: now,
      // Keep the profile name fresh if the contact was created from a bare number.
      ...(msg.profileName && thread.customerName === msg.from
        ? { customerName: msg.profileName }
        : {})
    }
  });

  logger.info("whatsapp_inbound_stored", { threadId: thread.id, from: msg.from, sid: msg.sid });
  publishEnquiryEvent({ type: "message_changed", threadId: thread.id });

  return { threadId: thread.id, customerName: displayName };
}

async function applyStatusUpdate(update: ParsedStatus): Promise<void> {
  if (update.status === "failed") {
    logger.error("whatsapp_delivery_failed", { sid: update.sid, detail: update.detail ?? null });
  }
  const message = await prisma.enquiryMessage.findUnique({
    where: { waMessageSid: update.sid },
    select: { threadId: true }
  });
  const result = await prisma.enquiryMessage.updateMany({
    where: { waMessageSid: update.sid },
    data: { waStatus: update.status }
  });
  if (result.count > 0) {
    logger.info("whatsapp_status_updated", { sid: update.sid, status: update.status });
    if (message) publishEnquiryEvent({ type: "message_changed", threadId: message.threadId });
  }
}

/**
 * Process one Exotel WhatsApp webhook payload (inbound messages + delivery receipts).
 * Never throws — webhook route must always ack 200 to prevent retry storms.
 */
export async function processExotelWhatsAppCallback(payload: unknown): Promise<void> {
  try {
    const items = collectCallbackItems(payload);
    if (!items.length) {
      logger.warn("whatsapp_webhook_unrecognized_payload", {
        sample: JSON.stringify(payload).slice(0, 500)
      });
      return;
    }
    for (const item of items) {
      const parsed = parseCallbackItem(item);
      if (!parsed) {
        logger.warn("whatsapp_webhook_item_skipped", {
          sample: JSON.stringify(item).slice(0, 400)
        });
        continue;
      }
      if (parsed.kind === "message") {
        const stored = await upsertInboundMessage(parsed);
        if (stored && isExotelConfigured()) {
          await enqueueBotTurn({
            threadId: stored.threadId,
            phone: parsed.from,
            name: stored.customerName,
            text: parsed.body,
            replyId: parsed.replyId
          });
        }
      } else {
        await applyStatusUpdate(parsed);
      }
    }
  } catch (err) {
    logger.error("whatsapp_webhook_processing_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
