/** Evidence upload limits for return cases (images + optional video). */

export const RETURN_EVIDENCE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const RETURN_EVIDENCE_VIDEO_MAX_BYTES = Number.parseInt(
  process.env.RETURN_EVIDENCE_VIDEO_MAX_BYTES ?? String(80 * 1024 * 1024),
  10
);
export const RETURN_EVIDENCE_MAX_FILES = 48;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif"
]);

const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo"
]);

export function isAllowedEvidenceMime(mime: string): boolean {
  const m = mime.toLowerCase().trim();
  return ALLOWED_IMAGE_MIME.has(m) || ALLOWED_VIDEO_MIME.has(m) || m.startsWith("image/");
}

export function mediaKindForMime(mime: string): "IMAGE" | "VIDEO" {
  const m = mime.toLowerCase().trim();
  if (ALLOWED_VIDEO_MIME.has(m) || m.startsWith("video/")) return "VIDEO";
  return "IMAGE";
}

export function maxBytesForMime(mime: string): number {
  return mediaKindForMime(mime) === "VIDEO"
    ? RETURN_EVIDENCE_VIDEO_MAX_BYTES
    : RETURN_EVIDENCE_IMAGE_MAX_BYTES;
}

export function assertEvidenceFileAllowed(file: {
  mimetype: string;
  size: number;
}): void {
  const mime = file.mimetype || "";
  if (!isAllowedEvidenceMime(mime)) {
    throw Object.assign(new Error("Only image or allowed video files may be uploaded"), {
      statusCode: 400,
      code: "INVALID_EVIDENCE_TYPE"
    });
  }
  const max = maxBytesForMime(mime);
  if (file.size > max) {
    const kind = mediaKindForMime(mime);
    throw Object.assign(
      new Error(
        kind === "VIDEO"
          ? `Video evidence must be under ${Math.round(max / (1024 * 1024))}MB`
          : `Image evidence must be under ${Math.round(max / (1024 * 1024))}MB`
      ),
      { statusCode: 400, code: "EVIDENCE_TOO_LARGE" }
    );
  }
}
