import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { uploadAsset } from "../../config/s3";
import { publishEnquiryEvent } from "../enquiries/enquiry-realtime";
import { completeOpenFollowUpsForThread } from "../enquiries/enquiry-follow-up.service";
import { ENQUIRY_MEDIA_S3_PREFIX } from "../enquiries/enquiries.constants";
import {
  isAllowedInstagramMediaUrl,
  parseInstagramWebhook,
  type InstagramInbound
} from "./instagram-webhook.parse";

const IG_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_INBOUND_MEDIA_BYTES = 25 * 1024 * 1024;

export function instagramConfig() {
  return {
    verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN?.trim() || "",
    appSecret: process.env.INSTAGRAM_APP_SECRET?.trim() || "",
    pageAccessToken: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() || "",
    igUserId: process.env.INSTAGRAM_IG_USER_ID?.trim() || "",
    graphVersion: process.env.INSTAGRAM_GRAPH_VERSION?.trim() || "v21.0"
  };
}

export function isInstagramMessagingConfigured(): boolean {
  const cfg = instagramConfig();
  return Boolean(cfg.appSecret && cfg.pageAccessToken && cfg.igUserId && cfg.verifyToken);
}

function syntheticIgEmail(igUserId: string): string {
  return `ig-${igUserId}@instagram.invalid`;
}

function graphBase(): string {
  return `https://graph.facebook.com/${instagramConfig().graphVersion}`;
}

async function fetchInstagramProfile(igsid: string): Promise<string | null> {
  const token = instagramConfig().pageAccessToken;
  if (!token) return null;
  try {
    const url = `${graphBase()}/${encodeURIComponent(igsid)}?fields=name,username`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { name?: string; username?: string };
    const username = json.username?.trim();
    const name = json.name?.trim();
    if (username) return `@${username.replace(/^@/, "")}`;
    return name || null;
  } catch {
    return null;
  }
}

function extFor(type: string, url: string, contentType: string | null): string {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();
  const fromPath = (path.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromPath && fromPath.length <= 5 && fromPath !== "php") return fromPath;
  const mime = (contentType || "").split(";")[0]!.trim().toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4") return "m4a";
  if (type === "video") return "mp4";
  if (type === "audio") return "mp3";
  if (type === "image") return "jpg";
  return "bin";
}

async function fetchAllowedMedia(startUrl: string, timeoutMs: number): Promise<Response | null> {
  const token = instagramConfig().pageAccessToken;
  let current = startUrl;
  for (let hop = 0; hop < 3; hop++) {
    if (!isAllowedInstagramMediaUrl(current)) return null;
    const res = await fetch(current, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "*/*",
        "User-Agent": "SarvedaInstagramInbox/1.0"
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual"
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  return null;
}

async function mirrorInstagramMedia(input: {
  messageId: string;
  type: string;
  url: string;
}): Promise<boolean> {
  if (!isAllowedInstagramMediaUrl(input.url)) return false;
  const res = await fetchAllowedMedia(input.url, input.type === "video" ? 90_000 : 45_000);
  if (!res || !res.ok) {
    logger.warn("instagram_inbound_media_fetch_failed", {
      status: res?.status ?? 0,
      messageId: input.messageId
    });
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_INBOUND_MEDIA_BYTES) return false;
  const ext = extFor(input.type, input.url, res.headers.get("content-type"));
  const mime = (res.headers.get("content-type") || "").split(";")[0]!.trim() || "application/octet-stream";
  const s3Key = `${ENQUIRY_MEDIA_S3_PREFIX}/${new Date().getFullYear()}/ig-${randomUUID()}.${ext}`;
  const s3Url = await uploadAsset(s3Key, buf, mime);
  if (!s3Url) return false;
  await prisma.enquiryAttachment.create({
    data: {
      messageId: input.messageId,
      fileName: `instagram-${input.type}.${ext}`,
      mimeType: mime,
      fileSizeBytes: buf.length,
      s3Key,
      s3Url
    }
  });
  return true;
}

export async function storeInstagramInbound(msg: InstagramInbound): Promise<void> {
  const existing = await prisma.enquiryMessage.findUnique({
    where: { igMessageMid: msg.mid },
    select: { id: true }
  });
  if (existing) {
    logger.info("instagram_inbound_duplicate_skipped", { mid: msg.mid });
    return;
  }

  const now = new Date();
  const profileName = await fetchInstagramProfile(msg.senderId);
  const displayName = profileName || "Instagram";
  const email = syntheticIgEmail(msg.senderId);

  let thread = await prisma.enquiryThread.findFirst({
    where: { source: "INSTAGRAM", igUserId: msg.senderId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, customerName: true }
  });

  if (!thread) {
    thread = await prisma.enquiryThread.create({
      data: {
        source: "INSTAGRAM",
        customerName: displayName,
        customerEmail: email,
        igUserId: msg.senderId,
        unreadByAdmin: true,
        lastMessageAt: now,
        lastCustomerMessageAt: now
      },
      select: { id: true, customerName: true }
    });
  }

  let created: { id: string };
  try {
    created = await prisma.enquiryMessage.create({
      data: {
        threadId: thread.id,
        authorType: "CUSTOMER",
        authorName: displayName,
        authorEmail: email,
        body: msg.text,
        igMessageMid: msg.mid
      },
      select: { id: true }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.info("instagram_inbound_duplicate_skipped", { mid: msg.mid });
      return;
    }
    throw err;
  }

  void import("../../config/firebase")
    .then(({ sendPushToAdmins }) =>
      sendPushToAdmins("New Instagram chat", `${displayName}: ${msg.text.slice(0, 140)}`, {
        type: "chat",
        chatId: thread.id,
        source: "INSTAGRAM"
      })
    )
    .catch(() => undefined);

  for (const attachment of msg.attachments) {
    try {
      await mirrorInstagramMedia({
        messageId: created.id,
        type: attachment.type,
        url: attachment.url
      });
    } catch (err) {
      logger.warn("instagram_inbound_media_mirror_failed", {
        messageId: created.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  await completeOpenFollowUpsForThread(thread.id, "customer_reply");
  await prisma.enquiryThread.update({
    where: { id: thread.id },
    data: {
      status: "OPEN",
      unreadByAdmin: true,
      lastMessageAt: now,
      lastCustomerMessageAt: now,
      ...(profileName && (thread.customerName === "Instagram" || !thread.customerName.trim())
        ? { customerName: profileName }
        : {})
    }
  });

  publishEnquiryEvent({ type: "message_changed", threadId: thread.id });
  logger.info("instagram_inbound_stored", { threadId: thread.id, mid: msg.mid });
}

export async function ingestInstagramWebhook(body: unknown): Promise<number> {
  const messages = parseInstagramWebhook(body);
  for (const message of messages) {
    await storeInstagramInbound(message);
  }
  return messages.length;
}

type OutboundAttachment = {
  s3Url: string;
  s3Key: string;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
};

function outboundKind(file: OutboundAttachment): "image" | "video" | "audio" | "file" {
  const mime = file.mimeType.toLowerCase();
  const name = file.fileName.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov)$/.test(name)) return "video";
  if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|aac)$/.test(name)) return "audio";
  return "file";
}

async function graphSend(payload: Record<string, unknown>): Promise<string> {
  const cfg = instagramConfig();
  if (!cfg.pageAccessToken || !cfg.igUserId) {
    throw new Error("Instagram messaging is not configured on the server.");
  }
  const res = await fetch(`${graphBase()}/${encodeURIComponent(cfg.igUserId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.pageAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25_000)
  });
  const json = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    const detail = json.error?.message?.trim() || `Instagram rejected the reply (${res.status}).`;
    throw new Error(detail);
  }
  return json.message_id?.trim() || "";
}

export async function sendInstagramAdminReply(input: {
  thread: {
    id: string;
    igUserId: string | null;
    lastCustomerMessageAt: Date | null;
  };
  admin: { id: string; email: string; name: string | null };
  adminName: string;
  body: string;
  attachments: OutboundAttachment[];
}) {
  const igUserId = input.thread.igUserId?.trim();
  if (!igUserId) throw new Error("This Instagram chat has no customer id.");
  const last = input.thread.lastCustomerMessageAt;
  if (!last || Date.now() - last.getTime() > IG_SESSION_WINDOW_MS) {
    throw new Error(
      "Instagram only allows a reply within 24 hours of the customer's last message. Wait until they write again."
    );
  }

  let mid = "";
  const text = input.body.trim();
  if (text.length > 1000) {
    throw new Error("Instagram replies can be at most 1,000 characters.");
  }
  if (text) {
    mid = await graphSend({
      recipient: { id: igUserId },
      message: { text }
    });
  }
  for (const file of input.attachments) {
    const sent = await graphSend({
      recipient: { id: igUserId },
      message: {
        attachment: {
          type: outboundKind(file),
          payload: { url: file.s3Url }
        }
      }
    });
    if (!mid) mid = sent;
  }

  const now = new Date();
  const message = await prisma.enquiryMessage.create({
    data: {
      threadId: input.thread.id,
      authorType: "ADMIN",
      adminUserId: input.admin.id,
      authorName: input.adminName,
      authorEmail: input.admin.email,
      body: input.body.trim() || input.attachments.map((file) => file.fileName).join(", "),
      igMessageMid: mid || null,
      attachments: {
        create: input.attachments.map((file) => ({
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSizeBytes: file.fileSizeBytes,
          s3Key: file.s3Key,
          s3Url: file.s3Url
        }))
      }
    },
    include: { attachments: true }
  });

  await prisma.enquiryThread.update({
    where: { id: input.thread.id },
    data: { lastMessageAt: now, status: "OPEN", unreadByAdmin: false }
  });
  publishEnquiryEvent({ type: "message_changed", threadId: input.thread.id });
  logger.info("enquiry_instagram_replied", {
    threadId: input.thread.id,
    adminId: input.admin.id,
    mid: mid || null,
    attachmentCount: input.attachments.length
  });
  return message;
}
