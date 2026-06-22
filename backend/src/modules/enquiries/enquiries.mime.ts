import { ALLOWED_UPLOAD_MIME } from "./enquiries.constants";

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav"
};

export function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function normalizeEnquiryMime(mimeType: string, fileName: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed && trimmed !== "application/octet-stream") {
    return trimmed;
  }
  const ext = extensionOf(fileName);
  return EXT_MIME[ext] ?? trimmed;
}

export function isAllowedEnquiryMime(mimeType: string, fileName: string): boolean {
  const normalized = normalizeEnquiryMime(mimeType, fileName);
  if (ALLOWED_UPLOAD_MIME.has(normalized)) return true;
  const ext = extensionOf(fileName);
  const fromExt = EXT_MIME[ext];
  return !!fromExt && ALLOWED_UPLOAD_MIME.has(fromExt);
}
