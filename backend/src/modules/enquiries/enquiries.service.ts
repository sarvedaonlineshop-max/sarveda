import { randomUUID } from "crypto";
import type {
  EnquiryMessageAuthor,
  EnquirySource,
  EnquirySubjectCategory,
  EnquiryThreadStatus
} from "@prisma/client";

import { prisma } from "../../config/db";
import { getPublicMediaUrl, presignPutUploadUrl, uploadAsset } from "../../config/s3";
import { logger } from "../../config/logger";
import { sendMail } from "../notifications/email";
import { toWhatsAppE164, sendWhatsAppNamedTemplate } from "../notifications/whatsapp";
import {
  sendWhatsAppSessionMedia,
  sendWhatsAppSessionText,
  WA_SESSION_WINDOW_MS
} from "../whatsapp/whatsapp-inbox.service";
import {
  claimWhatsAppAgentSession,
  closeWhatsAppAgentSessionAndRequestRating,
  startWhatsAppAgentSession
} from "../whatsapp/whatsapp-agent-session.service";
import { CARE_INBOX_EMAIL, ENQUIRY_MEDIA_S3_PREFIX, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_MB, MAX_ATTACHMENTS, SOURCE_LABELS, SUBJECT_LABELS } from "./enquiries.constants";
import { isAllowedEnquiryMime, normalizeEnquiryMime } from "./enquiries.mime";
import { publishEnquiryEvent } from "./enquiry-realtime";
import { antiSpamHttpError, assertEnquiryMessageLooksHuman } from "./enquiry-anti-spam";

export type EnquiryAttachmentInput = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
};

export type PreUploadedEnquiryAttachment = {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  s3Key: string;
  s3Url: string;
};

export type CreateEnquiryInput = {
  source: EnquirySource;
  subjectCategory?: EnquirySubjectCategory | null;
  customSubject?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  message: string;
  orderNumber?: string | null;
  contextTitle?: string | null;
  contextUrl?: string | null;
  userId?: string | null;
  attachments?: EnquiryAttachmentInput[];
  preUploadedAttachments?: PreUploadedEnquiryAttachment[];
};

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda.com";
  return raw.replace(/\/$/, "");
}

function adminChatUrl(threadId: string): string {
  return `${siteBaseUrl()}/admin/chats/${threadId}`;
}

function formatThreadSubject(input: CreateEnquiryInput): string {
  if (input.customSubject?.trim()) return input.customSubject.trim();
  if (input.subjectCategory) return SUBJECT_LABELS[input.subjectCategory];
  return SOURCE_LABELS[input.source];
}

function validateAttachmentMeta(fileName: string, mimeType: string, sizeBytes: number): string {
  const normalized = normalizeEnquiryMime(mimeType, fileName);
  if (!isAllowedEnquiryMime(mimeType, fileName)) {
    throw new Error(`File type not allowed: ${fileName}`);
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large (max ${MAX_ATTACHMENT_MB} MB): ${fileName}`);
  }
  return normalized;
}

export async function presignEnquiryUploads(
  files: Array<{ fileName: string; mimeType: string; sizeBytes: number }>
) {
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`Maximum ${MAX_ATTACHMENTS} files allowed`);
  }
  const uploads: PreUploadedEnquiryAttachment[] = [];
  const signed: Array<PreUploadedEnquiryAttachment & { uploadUrl: string }> = [];

  for (const file of files) {
    const mimeType = validateAttachmentMeta(file.fileName, file.mimeType, file.sizeBytes);
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "bin";
    const s3Key = `${ENQUIRY_MEDIA_S3_PREFIX}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const uploadUrl = await presignPutUploadUrl(s3Key, mimeType);
    const s3Url = getPublicMediaUrl(s3Key);
    const row: PreUploadedEnquiryAttachment = {
      fileName: file.fileName,
      mimeType,
      fileSizeBytes: file.sizeBytes,
      s3Key,
      s3Url
    };
    uploads.push(row);
    signed.push({ ...row, uploadUrl });
  }

  return { uploads: signed };
}

async function uploadEnquiryFiles(
  files: EnquiryAttachmentInput[]
): Promise<PreUploadedEnquiryAttachment[]> {
  const out: PreUploadedEnquiryAttachment[] = [];
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    const mimeType = validateAttachmentMeta(file.fileName, file.mimeType, file.sizeBytes);
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "bin";
    const s3Key = `${ENQUIRY_MEDIA_S3_PREFIX}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const s3Url = await uploadAsset(s3Key, file.buffer, mimeType);
    if (!s3Url) {
      throw new Error("Could not upload attachment. Please try again without files.");
    }
    out.push({
      fileName: file.fileName,
      mimeType,
      fileSizeBytes: file.sizeBytes,
      s3Key,
      s3Url
    });
  }
  return out;
}

function assertPreUploadedKeys(attachments: PreUploadedEnquiryAttachment[]) {
  for (const a of attachments) {
    const ok =
      a.s3Key.startsWith(`${ENQUIRY_MEDIA_S3_PREFIX}/`) ||
      // Legacy keys (private under bucket policy — still accept for in-flight clients)
      a.s3Key.startsWith("enquiries/");
    if (!ok) {
      throw new Error("Invalid attachment reference");
    }
  }
}

function attachmentLinesHtml(
  attachments: Array<{ fileName: string; s3Url: string }>
): string {
  if (!attachments.length) return "";
  const items = attachments
    .map((a) => `<li><a href="${a.s3Url}">${a.fileName}</a></li>`)
    .join("");
  return `<p><strong>Attachments:</strong></p><ul>${items}</ul>`;
}

export async function createEnquiryThread(input: CreateEnquiryInput) {
  const email = input.customerEmail.trim().toLowerCase();
  const name = input.customerName.trim();
  const message = input.message.trim();
  assertEnquiryMessageLooksHuman(message);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCustomerMessages = await prisma.enquiryMessage.count({
    where: {
      authorType: "CUSTOMER",
      authorEmail: email,
      createdAt: { gte: hourAgo }
    }
  });
  if (recentCustomerMessages >= 8) {
    throw antiSpamHttpError(
      "Too many messages from this email. Please wait a bit and try again, or reply in your existing chat.",
      "EMAIL_RATE_LIMIT",
      429
    );
  }

  const preUploaded = input.preUploadedAttachments ?? [];
  if (preUploaded.length) {
    assertPreUploadedKeys(preUploaded);
  }
  const uploaded =
    preUploaded.length > 0
      ? preUploaded
      : await uploadEnquiryFiles(input.attachments ?? []);
  const now = new Date();
  const subjectLine = formatThreadSubject(input);

  // Dedupe: same email + source with an OPEN thread in the last 7 days → append, don't spam inbox.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const existing = await prisma.enquiryThread.findFirst({
    where: {
      customerEmail: email,
      source: input.source,
      status: "OPEN",
      lastMessageAt: { gte: sevenDaysAgo }
    },
    orderBy: { lastMessageAt: "desc" }
  });

  if (existing) {
    const thread = await prisma.enquiryThread.update({
      where: { id: existing.id },
      data: {
        unreadByAdmin: true,
        lastMessageAt: now,
        customerName: name || existing.customerName,
        customerPhone: input.customerPhone?.trim() || existing.customerPhone,
        orderNumber: input.orderNumber?.trim() || existing.orderNumber,
        contextTitle: input.contextTitle?.trim() || existing.contextTitle,
        contextUrl: input.contextUrl?.trim() || existing.contextUrl,
        messages: {
          create: {
            authorType: "CUSTOMER",
            authorName: name,
            authorEmail: email,
            body: message,
            attachments: {
              create: uploaded.map((u) => ({
                fileName: u.fileName,
                mimeType: u.mimeType,
                fileSizeBytes: u.fileSizeBytes,
                s3Key: u.s3Key,
                s3Url: u.s3Url
              }))
            }
          }
        }
      },
      include: {
        messages: { include: { attachments: true }, orderBy: { createdAt: "asc" } }
      }
    });

    void import("../../config/firebase")
      .then(({ sendPushToAdmins }) =>
        sendPushToAdmins(
          "Chat reply",
          `${name}: ${subjectLine}`.slice(0, 180),
          { type: "chat", chatId: thread.id, source: input.source }
        )
      )
      .catch(() => undefined);

    logger.info("enquiry_appended_existing_thread", {
      threadId: thread.id,
      source: input.source,
      email
    });
    return thread;
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threadsToday = await prisma.enquiryThread.count({
    where: { customerEmail: email, createdAt: { gte: dayAgo } }
  });
  if (threadsToday >= 5) {
    throw antiSpamHttpError(
      "Too many new conversations from this email today. Please wait or use your existing chat.",
      "EMAIL_THREAD_LIMIT",
      429
    );
  }

  const thread = await prisma.enquiryThread.create({
    data: {
      source: input.source,
      subjectCategory: input.subjectCategory ?? null,
      customSubject: input.customSubject?.trim() || null,
      customerName: name,
      customerEmail: email,
      customerPhone: input.customerPhone?.trim() || null,
      orderNumber: input.orderNumber?.trim() || null,
      contextTitle: input.contextTitle?.trim() || null,
      contextUrl: input.contextUrl?.trim() || null,
      userId: input.userId ?? null,
      unreadByAdmin: true,
      lastMessageAt: now,
      messages: {
        create: {
          authorType: "CUSTOMER",
          authorName: name,
          authorEmail: email,
          body: message,
          attachments: {
            create: uploaded.map((u) => ({
              fileName: u.fileName,
              mimeType: u.mimeType,
              fileSizeBytes: u.fileSizeBytes,
              s3Key: u.s3Key,
              s3Url: u.s3Url
            }))
          }
        }
      }
    },
    include: {
      messages: { include: { attachments: true }, orderBy: { createdAt: "asc" } }
    }
  });

  const html = `<p><strong>New enquiry</strong> (${SOURCE_LABELS[input.source]})</p>
<p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
${input.customerPhone ? `<p><strong>Phone:</strong> ${input.customerPhone}</p>` : ""}
${input.orderNumber ? `<p><strong>Order:</strong> ${input.orderNumber}</p>` : ""}
${input.contextTitle ? `<p><strong>Regarding:</strong> ${input.contextTitle}</p>` : ""}
${input.contextUrl ? `<p><strong>Page:</strong> <a href="${input.contextUrl}">${input.contextUrl}</a></p>` : ""}
<p><strong>Subject:</strong> ${subjectLine}</p>
<p><strong>Message:</strong></p><p>${message.replace(/\n/g, "<br/>")}</p>
${attachmentLinesHtml(uploaded)}
<p style="margin-top:16px;"><a href="${adminChatUrl(thread.id)}">Open in Sarveda Admin → Chats</a></p>
<p style="color:#78716c;font-size:12px;">Thread ID: ${thread.id}</p>`;

  const text = [
    `New enquiry (${SOURCE_LABELS[input.source]})`,
    `From: ${name} <${email}>`,
    input.customerPhone ? `Phone: ${input.customerPhone}` : "",
    input.orderNumber ? `Order: ${input.orderNumber}` : "",
    input.contextTitle ? `Regarding: ${input.contextTitle}` : "",
    `Subject: ${subjectLine}`,
    "",
    message,
    "",
    `Admin: ${adminChatUrl(thread.id)}`
  ]
    .filter(Boolean)
    .join("\n");

  // Push first (do not wait on email) — ZeptoMail latency was delaying alerts.
  void import("../../config/firebase")
    .then(({ sendPushToAdmins }) =>
      sendPushToAdmins(
        "New chat",
        `${name}: ${subjectLine}`.slice(0, 180),
        {
          type: "chat",
          chatId: thread.id,
          source: input.source
        }
      )
    )
    .catch(() => undefined);

  void sendMail(
    CARE_INBOX_EMAIL,
    `[Sarveda] ${subjectLine} — ${name}`,
    html,
    text,
    email
  ).catch((err) => {
    logger.error("enquiry_notify_email_failed", {
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err)
    });
  });

  logger.info("enquiry_created", {
    threadId: thread.id,
    source: input.source,
    email
  });

  return thread;
}

export async function listEnquiryThreads(params: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  source?: EnquirySource;
  /** Search name, email, phone, order number, context */
  q?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const q = params.q?.trim();
  const digits = q ? q.replace(/\D/g, "") : "";
  const searchWhere =
    q && q.length > 0
      ? {
          OR: [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerEmail: { contains: q, mode: "insensitive" as const } },
            { customerPhone: { contains: q, mode: "insensitive" as const } },
            { waPhone: { contains: q, mode: "insensitive" as const } },
            { orderNumber: { contains: q, mode: "insensitive" as const } },
            { contextTitle: { contains: q, mode: "insensitive" as const } },
            ...(digits.length >= 3
              ? [
                  { customerPhone: { contains: digits } },
                  { waPhone: { contains: digits } }
                ]
              : [])
          ]
        }
      : {};
  const where = {
    ...(params.unreadOnly ? { unreadByAdmin: true } : {}),
    ...(params.source ? { source: params.source } : {}),
    ...searchWhere
  };
  const [items, total, unreadCount] = await Promise.all([
    prisma.enquiryThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, authorType: true, createdAt: true }
        }
      }
    }),
    prisma.enquiryThread.count({ where }),
    prisma.enquiryThread.count({ where: { unreadByAdmin: true } })
  ]);
  return { items, total, page, limit, unreadCount };
}

export async function getEnquiryUnreadCount(): Promise<number> {
  return prisma.enquiryThread.count({ where: { unreadByAdmin: true } });
}

export async function getEnquiryThread(id: string) {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: true,
          adminUser: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });
  if (!thread) return null;

  await prisma.enquiryThread.update({
    where: { id },
    data: { unreadByAdmin: false }
  });

  return { ...thread, unreadByAdmin: false };
}

function syntheticWaEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, "")}@whatsapp.invalid`;
}

function isWhatsAppSessionOpen(lastCustomerMessageAt: Date | null | undefined): boolean {
  if (!lastCustomerMessageAt) return false;
  return Date.now() - lastCustomerMessageAt.getTime() <= WA_SESSION_WINDOW_MS;
}

/**
 * Compose E.164 from dial code + national number (or pass-through if national already has +).
 */
export function composeWhatsAppE164(countryDialCode: string, nationalNumber: string): string | null {
  const national = nationalNumber.trim();
  if (national.startsWith("+")) {
    return toWhatsAppE164(national);
  }
  const dial = countryDialCode.replace(/\D/g, "");
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  if (!dial || !digits) return null;
  return toWhatsAppE164(`+${dial}${digits}`);
}

export type StartWhatsAppChatInput = {
  countryDialCode: string;
  phone: string;
  customerName?: string | null;
  /** Body text for template param {{2}} — required. */
  message: string;
  admin: { id: string; email: string; name: string | null };
};

export type StartWhatsAppChatResult = {
  threadId: string;
  created: boolean;
  waPhone: string;
  sessionWindowOpen: boolean;
  messageSent: boolean;
  outreachSent: boolean;
  warning: string | null;
};

/**
 * Open (or create) a WhatsApp enquiry thread and send the approved outreach template.
 * Template params: {{1}} = customer first name, {{2}} = admin message.
 * (WhatsApp Business API requires a template outside the 24h customer-service window.)
 */
export async function startWhatsAppChatByPhone(
  input: StartWhatsAppChatInput
): Promise<StartWhatsAppChatResult> {
  const waPhone = composeWhatsAppE164(input.countryDialCode, input.phone);
  if (!waPhone) {
    throw new Error("Enter a valid mobile number with country code.");
  }

  const trimmedMessage = input.message?.trim() || "";
  if (!trimmedMessage) {
    throw new Error("Message is required.");
  }

  const now = new Date();
  const displayName = input.customerName?.trim() || waPhone;
  const email = syntheticWaEmail(waPhone);

  let thread = await prisma.enquiryThread.findFirst({
    where: { source: "WHATSAPP", waPhone },
    orderBy: { lastMessageAt: "desc" }
  });

  let created = false;
  if (!thread) {
    thread = await prisma.enquiryThread.create({
      data: {
        source: "WHATSAPP",
        customerName: displayName,
        customerEmail: email,
        customerPhone: waPhone,
        waPhone,
        status: "OPEN",
        unreadByAdmin: false,
        lastMessageAt: now
      }
    });
    created = true;
    logger.info("whatsapp_chat_started_by_admin", {
      threadId: thread.id,
      waPhone,
      adminId: input.admin.id
    });
  } else {
    const nameUpdate = input.customerName?.trim()
      ? { customerName: input.customerName.trim() }
      : {};
    thread = await prisma.enquiryThread.update({
      where: { id: thread.id },
      data: {
        status: "OPEN",
        unreadByAdmin: false,
        ...nameUpdate
      }
    });
  }

  const sessionWindowOpen = isWhatsAppSessionOpen(thread.lastCustomerMessageAt);
  let messageSent = false;
  let outreachSent = false;
  let warning: string | null = null;

  const adminName =
    input.admin.name?.trim() || input.admin.email.split("@")[0] || "Sarveda Team";
  const outreachName =
    input.customerName?.trim()?.split(/\s+/)[0] ||
    (thread.customerName !== waPhone ? thread.customerName.split(/\s+/)[0] : null) ||
    "there";

  const templateName =
    process.env.WHATSAPP_ADMIN_OUTREACH_TEMPLATE?.trim() || "sarveda_support_outreach";
  const nameParam = outreachName.slice(0, 60);
  const messageParam = trimmedMessage.slice(0, 1024);
  const sid = await sendWhatsAppNamedTemplate(waPhone, templateName, [nameParam, messageParam]);
  const bodyPreview = `Namaste ${nameParam},\n\n${messageParam}`;

  await prisma.enquiryMessage.create({
    data: {
      threadId: thread.id,
      authorType: "ADMIN",
      adminUserId: input.admin.id,
      authorName: adminName,
      authorEmail: input.admin.email,
      body: bodyPreview,
      waMessageSid: sid,
      waStatus: "sent"
    }
  });
  await prisma.enquiryThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), status: "OPEN", unreadByAdmin: false }
  });
  await startWhatsAppAgentSession(thread.id, "Admin outreach template");
  await claimWhatsAppAgentSession(thread.id, input.admin.id);
  outreachSent = true;
  messageSent = true;
  logger.info("whatsapp_admin_outreach_sent", {
    threadId: thread.id,
    waPhone,
    templateName,
    sid,
    adminId: input.admin.id
  });

  if (!sessionWindowOpen) {
    warning = "Outreach template sent. Free chat unlocks after the customer replies.";
  }

  publishEnquiryEvent({ type: "thread_changed", threadId: thread.id });
  publishEnquiryEvent({ type: "message_changed", threadId: thread.id });

  return {
    threadId: thread.id,
    created,
    waPhone,
    sessionWindowOpen,
    messageSent,
    outreachSent,
    warning
  };
}

export async function replyToEnquiryThread(
  threadId: string,
  admin: { id: string; email: string; name: string | null },
  body: string,
  attachments: EnquiryAttachmentInput[] = []
) {
  const thread = await prisma.enquiryThread.findUnique({ where: { id: threadId } });
  if (!thread) return null;

  const adminName = admin.name?.trim() || admin.email.split("@")[0] || "Sarveda Team";
  const trimmed = body.trim();
  if (!trimmed && attachments.length === 0) {
    throw new Error("Reply message or attachment is required");
  }

  // WhatsApp threads: deliver via Exotel session message, not email.
  if (thread.source === "WHATSAPP") {
    const to = thread.waPhone || toWhatsAppE164(thread.customerPhone);
    if (!to) {
      throw new Error("This WhatsApp thread has no customer number.");
    }
    const last = thread.lastCustomerMessageAt;
    if (!last || Date.now() - last.getTime() > WA_SESSION_WINDOW_MS) {
      throw new Error(
        "WhatsApp 24-hour reply window has closed. The customer must message again before you can reply here."
      );
    }

    const uploaded = await uploadEnquiryFiles(attachments);

    // Validate WhatsApp media constraints before calling Exotel (avoid false "sent" then failed).
    for (const file of uploaded) {
      const mime = file.mimeType.toLowerCase();
      const name = file.fileName.toLowerCase();
      const isVideo =
        mime.startsWith("video/") || /\.(mp4|webm|mov|avi|mpeg|mpg|m4v|3gp)$/i.test(name);
      if (isVideo) {
        const okMp4 =
          mime === "video/mp4" ||
          mime === "video/3gpp" ||
          name.endsWith(".mp4") ||
          name.endsWith(".3gp");
        if (!okMp4) {
          throw new Error(
            `WhatsApp only accepts MP4 video (not ${file.fileName}). Export/convert to MP4 (H.264) under 16 MB and try again.`
          );
        }
        if (file.fileSizeBytes > 16 * 1024 * 1024) {
          throw new Error(
            `${file.fileName} is too large for WhatsApp video (max 16 MB). Compress it and try again.`
          );
        }
      }
    }

    let sid: string | null = null;

    if (uploaded.length === 0) {
      sid = await sendWhatsAppSessionText(to, trimmed);
    } else {
      for (let i = 0; i < uploaded.length; i++) {
        const file = uploaded[i]!;
        const caption = i === 0 ? trimmed || undefined : undefined;
        const mediaSid = await sendWhatsAppSessionMedia(to, {
          link: file.s3Url,
          mimeType: file.mimeType,
          fileName: file.fileName,
          caption
        });
        if (i === 0) sid = mediaSid;
      }
    }

    const waNow = new Date();
    const message = await prisma.enquiryMessage.create({
      data: {
        threadId,
        authorType: "ADMIN" as EnquiryMessageAuthor,
        adminUserId: admin.id,
        authorName: adminName,
        authorEmail: admin.email,
        body: trimmed || uploaded.map((u) => u.fileName).join(", "),
        waMessageSid: sid,
        waStatus: "sent",
        attachments: {
          create: uploaded.map((u) => ({
            fileName: u.fileName,
            mimeType: u.mimeType,
            fileSizeBytes: u.fileSizeBytes,
            s3Key: u.s3Key,
            s3Url: u.s3Url
          }))
        }
      },
      include: { attachments: true }
    });

    await prisma.enquiryThread.update({
      where: { id: threadId },
      data: { lastMessageAt: waNow, status: "OPEN", unreadByAdmin: false }
    });
    await startWhatsAppAgentSession(threadId, "Admin replied");
    await claimWhatsAppAgentSession(threadId, admin.id);
    publishEnquiryEvent({ type: "message_changed", threadId });

    logger.info("enquiry_whatsapp_replied", {
      threadId,
      adminId: admin.id,
      sid,
      attachmentCount: uploaded.length
    });
    return message;
  }

  const uploaded = await uploadEnquiryFiles(attachments);

  const now = new Date();
  const message = await prisma.enquiryMessage.create({
    data: {
      threadId,
      authorType: "ADMIN" as EnquiryMessageAuthor,
      adminUserId: admin.id,
      authorName: adminName,
      authorEmail: admin.email,
      body: trimmed,
      attachments: {
        create: uploaded.map((u) => ({
          fileName: u.fileName,
          mimeType: u.mimeType,
          fileSizeBytes: u.fileSizeBytes,
          s3Key: u.s3Key,
          s3Url: u.s3Url
        }))
      }
    },
    include: { attachments: true }
  });

  await prisma.enquiryThread.update({
    where: { id: threadId },
    data: { lastMessageAt: now, status: "OPEN", unreadByAdmin: false }
  });

  const sentAt = now.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });

  const subjectLine = formatThreadSubject({
    source: thread.source,
    subjectCategory: thread.subjectCategory,
    customSubject: thread.customSubject,
    customerName: thread.customerName,
    customerEmail: thread.customerEmail,
    message: trimmed
  });

  const html = `<p>Hi ${thread.customerName},</p>
<p>${trimmed.replace(/\n/g, "<br/>")}</p>
${attachmentLinesHtml(uploaded)}
<p style="margin-top:20px;color:#78716c;font-size:13px;">
  Replied by <strong>${adminName}</strong> on ${sentAt} (IST)<br/>
  Sarveda Support
</p>
<p style="font-size:12px;color:#a8a29e;">Reply to this email if you need further help.</p>`;

  const text = [
    `Hi ${thread.customerName},`,
    "",
    trimmed,
    "",
    `— ${adminName}, Sarveda Support (${sentAt} IST)`
  ].join("\n");

  await sendMail(
    thread.customerEmail,
    `Re: ${subjectLine} — Sarveda`,
    html,
    text,
    CARE_INBOX_EMAIL
  );

  logger.info("enquiry_replied", { threadId, adminId: admin.id });
  publishEnquiryEvent({ type: "message_changed", threadId });

  return message;
}

export async function patchEnquiryThreadStatus(
  threadId: string,
  status: EnquiryThreadStatus
) {
  const thread = await prisma.enquiryThread.update({
    where: { id: threadId },
    data: { status }
  });
  if (status === "CLOSED" && thread.source === "WHATSAPP") {
    const phone = thread.waPhone || toWhatsAppE164(thread.customerPhone);
    if (phone) {
      try {
        await closeWhatsAppAgentSessionAndRequestRating(threadId, phone);
      } catch (error) {
        logger.error("whatsapp_agent_rating_request_failed", {
          threadId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  publishEnquiryEvent({ type: "thread_changed", threadId });
  return thread;
}

/** Soft-remove an admin-authored message from the thread.
 * WhatsApp cannot recall messages via Exotel — when the 24h window is open we send a
 * "please disregard" notice so the customer is told, and store that notice in the thread.
 */
export async function deleteAdminEnquiryMessage(
  threadId: string,
  messageId: string,
  admin?: { id: string; email: string; name: string | null },
  options?: { notifyCustomer?: boolean }
) {
  const message = await prisma.enquiryMessage.findFirst({
    where: { id: messageId, threadId },
    include: { attachments: true, thread: true }
  });
  if (!message) return null;
  if (message.authorType !== "ADMIN") {
    throw new Error("Only messages sent by admin can be deleted.");
  }

  const notify =
    options?.notifyCustomer !== false &&
    message.thread.source === "WHATSAPP" &&
    Boolean(admin);

  let whatsAppNotified = false;
  let noticeMessage: Awaited<ReturnType<typeof prisma.enquiryMessage.create>> | null = null;

  if (notify && admin) {
    const sessionOpen = isWhatsAppSessionOpen(message.thread.lastCustomerMessageAt);
    const to = message.thread.waPhone || toWhatsAppE164(message.thread.customerPhone);
    if (sessionOpen && to) {
      const hasMedia = message.attachments.length > 0;
      const noticeBody = hasMedia
        ? "Please disregard the previous file I sent."
        : "Please disregard my previous message.";
      const sid = await sendWhatsAppSessionText(to, noticeBody);
      const adminName = admin.name?.trim() || admin.email.split("@")[0] || "Sarveda Team";
      const waNow = new Date();
      noticeMessage = await prisma.enquiryMessage.create({
        data: {
          threadId,
          authorType: "ADMIN" as EnquiryMessageAuthor,
          adminUserId: admin.id,
          authorName: adminName,
          authorEmail: admin.email,
          body: noticeBody,
          waMessageSid: sid,
          waStatus: "sent"
        }
      });
      await prisma.enquiryThread.update({
        where: { id: threadId },
        data: { lastMessageAt: waNow, status: "OPEN", unreadByAdmin: false }
      });
      whatsAppNotified = true;
    }
  }

  await prisma.enquiryMessage.delete({ where: { id: messageId } });

  if (!noticeMessage) {
    const last = await prisma.enquiryMessage.findFirst({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    await prisma.enquiryThread.update({
      where: { id: threadId },
      data: { lastMessageAt: last?.createdAt ?? new Date() }
    });
  }

  publishEnquiryEvent({ type: "message_changed", threadId });
  publishEnquiryEvent({ type: "thread_changed", threadId });
  logger.info("enquiry_admin_message_deleted", {
    threadId,
    messageId,
    attachmentCount: message.attachments.length,
    whatsAppNotified
  });
  return {
    deleted: true as const,
    messageId,
    whatsAppNotified,
    notice:
      whatsAppNotified === false && message.thread.source === "WHATSAPP"
        ? "Removed from admin only. WhatsApp window is closed (or no number), so the customer was not notified."
        : whatsAppNotified
          ? "Removed from admin. Customer was asked to disregard the previous message."
          : null
  };
}

/**
 * Edit an admin text message. WhatsApp cannot rewrite an already-delivered bubble —
 * when the session is open we send a Correction follow-up so the customer gets the fix.
 */
export async function updateAdminEnquiryMessage(
  threadId: string,
  messageId: string,
  body: string,
  admin?: { id: string; email: string; name: string | null },
  options?: { notifyCustomer?: boolean }
) {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmed.length > 8000) {
    throw new Error("Message is too long.");
  }

  const message = await prisma.enquiryMessage.findFirst({
    where: { id: messageId, threadId },
    include: { attachments: true, thread: true }
  });
  if (!message) return null;
  if (message.authorType !== "ADMIN") {
    throw new Error("Only messages sent by admin can be edited.");
  }
  if (message.attachments.length > 0) {
    throw new Error("Media messages cannot be edited. Delete and resend instead.");
  }

  const notify =
    options?.notifyCustomer !== false &&
    message.thread.source === "WHATSAPP" &&
    Boolean(admin);

  let whatsAppNotified = false;
  let correctionSid: string | null = null;

  if (notify && admin) {
    const sessionOpen = isWhatsAppSessionOpen(message.thread.lastCustomerMessageAt);
    const to = message.thread.waPhone || toWhatsAppE164(message.thread.customerPhone);
    if (sessionOpen && to) {
      // Keep under WhatsApp text limits; prefix is short.
      const outbound = `*Correction:*\n\n${trimmed}`.slice(0, 4096);
      correctionSid = await sendWhatsAppSessionText(to, outbound);
      whatsAppNotified = true;
      const adminName = admin.name?.trim() || admin.email.split("@")[0] || "Sarveda Team";
      const waNow = new Date();
      await prisma.enquiryMessage.create({
        data: {
          threadId,
          authorType: "ADMIN" as EnquiryMessageAuthor,
          adminUserId: admin.id,
          authorName: adminName,
          authorEmail: admin.email,
          body: outbound,
          waMessageSid: correctionSid,
          waStatus: "sent"
        }
      });
      await prisma.enquiryThread.update({
        where: { id: threadId },
        data: { lastMessageAt: waNow, status: "OPEN", unreadByAdmin: false }
      });
    }
  }

  const updated = await prisma.enquiryMessage.update({
    where: { id: messageId },
    data: {
      body: trimmed,
      editedAt: new Date()
    },
    include: {
      attachments: true,
      adminUser: { select: { id: true, name: true, email: true } }
    }
  });

  publishEnquiryEvent({ type: "message_changed", threadId });
  if (whatsAppNotified) {
    publishEnquiryEvent({ type: "thread_changed", threadId });
  }
  logger.info("enquiry_admin_message_edited", {
    threadId,
    messageId,
    whatsAppNotified,
    correctionSid
  });

  return {
    ...updated,
    whatsAppNotified,
    notice:
      message.thread.source === "WHATSAPP"
        ? whatsAppNotified
          ? "Saved in admin and a Correction message was sent to the customer on WhatsApp."
          : "Saved in admin only. WhatsApp window is closed (or no number), so the customer still sees the old text."
        : null
  };
}
