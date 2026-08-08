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
import {
  CARE_INBOX_EMAIL,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  MAX_ATTACHMENTS,
  SOURCE_LABELS,
  SUBJECT_LABELS
} from "./enquiries.constants";
import { isAllowedEnquiryMime, normalizeEnquiryMime } from "./enquiries.mime";
import { publishEnquiryEvent } from "./enquiry-realtime";

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
    "https://sarveda-demo.xyz";
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
    const s3Key = `enquiries/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
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
    const s3Key = `enquiries/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
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
    if (!a.s3Key.startsWith("enquiries/")) {
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

  const thread = await prisma.enquiryThread.create({
    data: {
      source: input.source,
      subjectCategory: input.subjectCategory ?? null,
      customSubject: input.customSubject?.trim() || null,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim().toLowerCase(),
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
          authorName: input.customerName.trim(),
          authorEmail: input.customerEmail.trim().toLowerCase(),
          body: input.message.trim(),
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
<p><strong>From:</strong> ${input.customerName} &lt;${input.customerEmail}&gt;</p>
${input.customerPhone ? `<p><strong>Phone:</strong> ${input.customerPhone}</p>` : ""}
${input.orderNumber ? `<p><strong>Order:</strong> ${input.orderNumber}</p>` : ""}
${input.contextTitle ? `<p><strong>Regarding:</strong> ${input.contextTitle}</p>` : ""}
${input.contextUrl ? `<p><strong>Page:</strong> <a href="${input.contextUrl}">${input.contextUrl}</a></p>` : ""}
<p><strong>Subject:</strong> ${subjectLine}</p>
<p><strong>Message:</strong></p><p>${input.message.replace(/\n/g, "<br/>")}</p>
${attachmentLinesHtml(uploaded)}
<p style="margin-top:16px;"><a href="${adminChatUrl(thread.id)}">Open in Sarveda Admin → Chats</a></p>
<p style="color:#78716c;font-size:12px;">Thread ID: ${thread.id}</p>`;

  const text = [
    `New enquiry (${SOURCE_LABELS[input.source]})`,
    `From: ${input.customerName} <${input.customerEmail}>`,
    input.customerPhone ? `Phone: ${input.customerPhone}` : "",
    input.orderNumber ? `Order: ${input.orderNumber}` : "",
    input.contextTitle ? `Regarding: ${input.contextTitle}` : "",
    `Subject: ${subjectLine}`,
    "",
    input.message,
    "",
    `Admin: ${adminChatUrl(thread.id)}`
  ]
    .filter(Boolean)
    .join("\n");

  await sendMail(
    CARE_INBOX_EMAIL,
    `[Sarveda] ${subjectLine} — ${input.customerName}`,
    html,
    text,
    input.customerEmail
  );

  logger.info("enquiry_created", {
    threadId: thread.id,
    source: input.source,
    email: input.customerEmail
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
