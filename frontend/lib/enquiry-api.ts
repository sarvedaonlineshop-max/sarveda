import { getApiBase } from "@/lib/api";
import type { EnquirySource, EnquirySubjectValue } from "@/lib/enquiry-subjects";

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
};

export async function submitEnquiry(input: SubmitEnquiryInput): Promise<{ id: string; message: string }> {
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
  for (const file of input.attachments ?? []) {
    form.append("attachments", file);
  }

  const res = await fetch(`${getApiBase()}/api/enquiries`, {
    method: "POST",
    credentials: "include",
    body: form
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { id?: string; message?: string };
    error?: string;
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Could not send your message. Please email care@sarveda.com.");
  }
  return {
    id: json.data?.id ?? "",
    message: json.data?.message ?? "Thank you — we received your message."
  };
}
