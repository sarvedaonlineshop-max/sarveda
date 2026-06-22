export const MAX_ENQUIRY_ATTACHMENTS = 10;
export const MAX_ENQUIRY_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ENQUIRY_ATTACHMENT_MB = 25;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
