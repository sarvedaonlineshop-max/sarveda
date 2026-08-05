/**
 * Exotel WhatsApp transport.
 *
 * Single place that knows how to POST a `content` object to the Exotel
 * messages API. Callers build the content (text / interactive / flow) and get
 * back the provider message sid.
 */
import { logger } from "../../config/logger";

export function isExotelConfigured(): boolean {
  return Boolean(
    process.env.EXOTEL_ACCOUNT_SID?.trim() &&
      process.env.EXOTEL_API_KEY?.trim() &&
      process.env.EXOTEL_API_TOKEN?.trim() &&
      process.env.EXOTEL_WHATSAPP_FROM?.trim()
  );
}

function messagesUrl(): string {
  const sid = process.env.EXOTEL_ACCOUNT_SID!.trim();
  const host = (process.env.EXOTEL_API_HOST?.trim() || "api.exotel.com")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `https://${host}/v2/accounts/${encodeURIComponent(sid)}/messages`;
}

function basicAuthHeader(): string {
  const key = process.env.EXOTEL_API_KEY!.trim();
  const token = process.env.EXOTEL_API_TOKEN!.trim();
  return `Basic ${Buffer.from(`${key}:${token}`, "utf8").toString("base64")}`;
}

type ExotelMsg = { sid?: string; status?: string; error_data?: unknown };

/**
 * Send one WhatsApp message content object. Valid only inside the customer's
 * 24h session window for non-template content. Returns the provider sid.
 */
export async function sendExotelWhatsAppContent(
  toE164: string,
  content: Record<string, unknown>,
  logEvent = "whatsapp_message_sent"
): Promise<string | null> {
  if (!isExotelConfigured()) {
    throw new Error("WhatsApp is not configured on the server (Exotel env missing).");
  }
  const from = process.env.EXOTEL_WHATSAPP_FROM!.trim();

  const res = await fetch(messagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: basicAuthHeader()
    },
    body: JSON.stringify({
      whatsapp: { messages: [{ from, to: toE164, content }] }
    })
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Exotel WhatsApp HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }

  let msg0: ExotelMsg | undefined;
  if (parsed && typeof parsed === "object" && "response" in parsed) {
    const response = (parsed as { response?: { whatsapp?: { messages?: ExotelMsg[] } } }).response;
    msg0 = response?.whatsapp?.messages?.[0];
  }
  if (msg0?.status === "failure") {
    throw new Error(`Exotel WhatsApp message failure: ${JSON.stringify(msg0).slice(0, 800)}`);
  }

  logger.info(logEvent, { to: toE164, sid: msg0?.sid ?? null });
  return msg0?.sid ?? null;
}
