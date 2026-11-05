import { createHmac, timingSafeEqual } from "crypto";

export type InstagramInboundAttachment = {
  type: string;
  url: string;
};

export type InstagramInbound = {
  mid: string;
  senderId: string;
  text: string;
  attachments: InstagramInboundAttachment[];
};

const MEDIA_HOST_SUFFIXES = [".fbsbx.com", ".fbcdn.net", ".cdninstagram.com", ".facebook.com"];

export function verifyInstagramSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  const header = signatureHeader?.trim() || "";
  const secret = appSecret.trim();
  if (!header.startsWith("sha256=") || !secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Meta attachment URLs only. Rejects anything else so a webhook cannot make us fetch internal hosts. */
export function isAllowedInstagramMediaUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return MEDIA_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attachmentLabel(type: string): string {
  if (type === "image" || type === "video" || type === "audio") return `[${type}]`;
  if (type === "story_mention") return "[Instagram story mention]";
  if (type === "share" || type === "ig_reel") return "[Instagram share]";
  return "[attachment]";
}

/**
 * Pull customer DMs out of a Meta Instagram webhook body.
 * Echoes (messages we sent), read receipts, and events without a message id are skipped.
 */
export function parseInstagramWebhook(body: unknown): InstagramInbound[] {
  const root = asRecord(body);
  if (!root || root.object !== "instagram") return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const out: InstagramInbound[] = [];

  for (const entry of entries) {
    const messaging = Array.isArray(asRecord(entry)?.messaging) ? (asRecord(entry)!.messaging as unknown[]) : [];
    for (const item of messaging) {
      const event = asRecord(item);
      const message = asRecord(event?.message);
      if (!event || !message) continue;
      if (message.is_echo === true) continue;
      const mid = asString(message.mid);
      const senderId = asString(asRecord(event.sender)?.id);
      if (!mid || !senderId) continue;

      const attachments: InstagramInboundAttachment[] = [];
      const rawAttachments = Array.isArray(message.attachments) ? message.attachments : [];
      for (const raw of rawAttachments) {
        const att = asRecord(raw);
        const type = asString(att?.type) || "file";
        const url = asString(asRecord(att?.payload)?.url);
        if (url && isAllowedInstagramMediaUrl(url)) attachments.push({ type, url });
      }

      const text = asString(message.text);
      const labels = attachments.map((att) => attachmentLabel(att.type));
      const bodyText = [text, ...labels.filter((label) => !text || !text.includes(label))].filter(Boolean).join("\n");
      out.push({
        mid,
        senderId,
        text: bodyText || (attachments.length ? attachmentLabel(attachments[0]!.type) : "[message]"),
        attachments
      });
    }
  }

  return out;
}
