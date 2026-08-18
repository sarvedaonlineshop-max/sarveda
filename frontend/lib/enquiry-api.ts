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

/** Browser → Express (Lightsail) → S3. Never PUT from the browser to S3. */
export async function submitEnquiry(input: SubmitEnquiryInput): Promise<{ id: string; message: string }> {
  const files = input.attachments ?? [];
  validateClientFiles(files);

  const form = new FormData();
  form.append(
    "data",
    JSON.stringify({
      source: input.source,
      subjectCategory: input.subjectCategory,
      customSubject: input.customSubject,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || undefined,
      message: input.message.trim(),
      orderNumber: input.orderNumber?.trim() || undefined,
      contextTitle: input.contextTitle?.trim() || undefined,
      contextUrl: input.contextUrl?.trim() || undefined
    })
  );
  for (const file of files) {
    form.append("attachments", file);
  }

  const res = await fetch(`${getApiBase()}/api/enquiries`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    body: form
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
