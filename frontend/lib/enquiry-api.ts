import { getApiBase } from "@/lib/api";
import { parseApiResponse } from "@/lib/parse-api-response";
import type { EnquirySource, EnquirySubjectValue } from "@/lib/enquiry-subjects";
import {
  MAX_ENQUIRY_ATTACHMENT_BYTES,
  MAX_ENQUIRY_ATTACHMENTS,
  MAX_ENQUIRY_ATTACHMENT_MB
} from "@/lib/enquiry-limits";

export type SubmitEnquiryInput = {
  source: EnquirySource;
  subjectCategory?: EnquirySubjectValue;
  customSubject?: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  orderNumber?: string;
  contextTitle?: string;
  contextUrl?: string;
  attachments?: File[];
  onUploadProgress?: (fileIndex: number, percent: number) => void;
};

type PresignUpload = {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  s3Key: string;
  s3Url: string;
  uploadUrl: string;
};

function validateClientFiles(files: File[]) {
  if (files.length > MAX_ENQUIRY_ATTACHMENTS) {
    throw new Error(`Maximum ${MAX_ENQUIRY_ATTACHMENTS} files allowed.`);
  }
  for (const file of files) {
    if (file.size > MAX_ENQUIRY_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is too large (max ${MAX_ENQUIRY_ATTACHMENT_MB} MB per file).`);
    }
  }
}

async function uploadFilesViaPresign(files: File[]): Promise<PresignUpload[]> {
  if (!files.length) return [];
  validateClientFiles(files);

  const presignRes = await fetch(`${getApiBase()}/api/enquiries/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      files: files.map((f) => ({
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size
      }))
    })
  });
  const presignJson = await parseApiResponse<{ uploads: PresignUpload[] }>(presignRes);
  if (!presignRes.ok || !presignJson.success) {
    throw new Error(!presignJson.success ? presignJson.error : `Presign failed (${presignRes.status})`);
  }
  const uploads = presignJson.data.uploads;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const target = uploads[i];
    if (!target) throw new Error("Upload setup failed. Please try again.");

    const putRes = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": target.mimeType },
      body: file
    });
    if (!putRes.ok) {
      throw new Error(`Could not upload ${file.name}. Please try again.`);
    }
  }

  return uploads;
}

export async function submitEnquiry(input: SubmitEnquiryInput): Promise<{ id: string; message: string }> {
  const attachmentRefs = await uploadFilesViaPresign(input.attachments ?? []);

  const payload = {
    source: input.source,
    subjectCategory: input.subjectCategory,
    customSubject: input.customSubject,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || undefined,
    message: input.message.trim(),
    orderNumber: input.orderNumber?.trim() || undefined,
    contextTitle: input.contextTitle?.trim() || undefined,
    contextUrl: input.contextUrl?.trim() || undefined,
    attachmentRefs: attachmentRefs.map((u) => ({
      fileName: u.fileName,
      mimeType: u.mimeType,
      fileSizeBytes: u.fileSizeBytes,
      s3Key: u.s3Key,
      s3Url: u.s3Url
    }))
  };

  const res = await fetch(`${getApiBase()}/api/enquiries`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await parseApiResponse<{ id?: string; message?: string }>(res);
  if (!res.ok || !json.success) {
    throw new Error(json.success ? `Request failed (${res.status})` : json.error);
  }
  return {
    id: json.data.id ?? "",
    message: json.data.message ?? "Thank you — we received your message."
  };
}
