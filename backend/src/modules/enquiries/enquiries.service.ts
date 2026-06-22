import { randomUUID } from "crypto";
import type {
  EnquiryMessageAuthor,
  EnquirySource,
  EnquirySubjectCategory,
  EnquiryThreadStatus
} from "@prisma/client";

import { prisma } from "../../config/db";
import { uploadAsset } from "../../config/s3";
import { logger } from "../../config/logger";
import { sendMail } from "../notifications/email";
import {
  ALLOWED_UPLOAD_MIME,
  CARE_INBOX_EMAIL,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  SOURCE_LABELS,
  SUBJECT_LABELS
} from "./enquiries.constants";

export type EnquiryAttachmentInput = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
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

async function uploadEnquiryFiles(
  files: EnquiryAttachmentInput[]
): Promise<Array<{ fileName: string; mimeType: string; fileSizeBytes: number; s3Key: string; s3Url: string }>> {
  const out: Array<{
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    s3Key: string;
    s3Url: string;
  }> = [];
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    if (!ALLOWED_UPLOAD_MIME.has(file.mimeType)) {
      throw new Error(`File type not allowed: ${file.fileName}`);
    }
    if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(`File too large (max 10 MB): ${file.fileName}`);
    }
    const ext = file.fileName.split(".").pop()?.toLowerCase() || "bin";
    const s3Key = `enquiries/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
    const s3Url = await uploadAsset(s3Key, file.buffer, file.mimeType);
    if (!s3Url) {
      throw new Error("Could not upload attachment. Please try again without files.");
    }
    out.push({
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSizeBytes: file.sizeBytes,
      s3Key,
      s3Url
    });
  }
  return out;
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
  const uploaded = await uploadEnquiryFiles(input.attachments ?? []);
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
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const where = {
    ...(params.unreadOnly ? { unreadByAdmin: true } : {}),
    ...(params.source ? { source: params.source } : {})
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

export async function replyToEnquiryThread(
  threadId: string,
  admin: { id: string; email: string; name: string | null },
  body: string,
  attachments: EnquiryAttachmentInput[] = []
) {
  const thread = await prisma.enquiryThread.findUnique({ where: { id: threadId } });
  if (!thread) return null;

  const uploaded = await uploadEnquiryFiles(attachments);
  const adminName = admin.name?.trim() || admin.email.split("@")[0] || "Sarveda Team";
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("Reply message is required");
  }

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

  return message;
}

export async function patchEnquiryThreadStatus(
  threadId: string,
  status: EnquiryThreadStatus
) {
  return prisma.enquiryThread.update({
    where: { id: threadId },
    data: { status }
  });
}
