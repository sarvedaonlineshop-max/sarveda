/**
 * WhatsApp inbound media is stored as plain text like:
 *   [image] optional caption https://exotel-media...
 * Parse that for admin chat rendering.
 */

export type ParsedWhatsAppBody = {
  mediaType: "image" | "video" | "audio" | "document" | "sticker" | null;
  caption: string;
  url: string | null;
  /** Best-effort original document name when present in the body. */
  fileName: string | null;
  /** Remaining plain text when not media (or caption-only fallback). */
  text: string;
};

const MEDIA_RE =
  /^\[(image|video|audio|document|sticker)\]\s*([\s\S]*)$/i;

function stripMarkup(raw: string): string {
  return raw
    .replace(/<\/?blockquote[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+_+/g, " ")
    .replace(/_+\s+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function parseWhatsAppMessageBody(raw: string): ParsedWhatsAppBody {
  const cleaned = stripMarkup(raw);
  const match = cleaned.match(MEDIA_RE);
  if (!match) {
    return { mediaType: null, caption: "", url: null, fileName: null, text: cleaned };
  }

  const mediaType = match[1].toLowerCase() as NonNullable<ParsedWhatsAppBody["mediaType"]>;
  const rest = (match[2] ?? "").trim();
  const urlMatch = rest.match(/https?:\/\/\S+/i);
  const url = urlMatch?.[0]?.replace(/[),.;]+$/, "") ?? null;
  const caption = url && urlMatch?.index != null
    ? rest.slice(0, urlMatch.index).trim()
    : rest;
  const fileNameGuess =
    mediaType === "document" && caption && !/^https?:/i.test(caption)
      ? caption.split(/\s+/).find((p) => /\.[a-z0-9]{1,8}$/i.test(p)) || caption
      : null;

  return {
    mediaType,
    caption,
    url,
    fileName: fileNameGuess,
    text: caption || `[${mediaType}]`,
  };
}

export function whatsAppPreviewLabel(raw: string): string {
  const parsed = parseWhatsAppMessageBody(raw);
  if (!parsed.mediaType) return parsed.text;
  const labels: Record<string, string> = {
    image: "📷 Photo",
    video: "🎬 Video",
    audio: "🎵 Audio",
    document: "📄 Document",
    sticker: "🎨 Sticker",
  };
  const label = labels[parsed.mediaType] ?? `[${parsed.mediaType}]`;
  return parsed.caption ? `${label} — ${parsed.caption}` : label;
}
