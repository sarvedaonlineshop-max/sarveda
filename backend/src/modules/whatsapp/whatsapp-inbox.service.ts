/**
 * WhatsApp shared inbox (Exotel WABA).
 *
 * Inbound customer messages arrive on the Exotel webhook and are stored as
 * EnquiryThread/EnquiryMessage rows with source WHATSAPP, so they appear in
 * the existing admin Chats UI. Admin replies for WHATSAPP threads go out as
 * Exotel session text messages (24h window) instead of email.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { toWhatsAppE164 } from "../notifications/whatsapp";

export const WA_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Synthetic, non-routable email for WA-only contacts (EnquiryThread.customerEmail is required). */
function syntheticWaEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, "")}@whatsapp.invalid`;
}

function isExotelConfigured(): boolean {
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

function exotelBasicAuthHeader(): string {
  const key = process.env.EXOTEL_API_KEY!.trim();
  const token = process.env.EXOTEL_API_TOKEN!.trim();
  return `Basic ${Buffer.from(`${key}:${token}`, "utf8").toString("base64")}`;
}

/**
 * Send a free-form session text (valid only inside the customer's 24h window).
 * Returns the provider message sid when available.
 */
export async function sendWhatsAppSessionText(toE164: string, body: string): Promise<string | null> {
  if (!isExotelConfigured()) {
    throw new Error("WhatsApp is not configured on the server (Exotel env missing).");
  }
  const from = process.env.EXOTEL_WHATSAPP_FROM!.trim();

  const payload = {
    whatsapp: {
      messages: [
        {
          from,
          to: toE164,
          content: {
            recipient_type: "individual",
            type: "text",
            text: { body: body.slice(0, 4096) }
          }
        }
      ]
    }
  };

  const res = await fetch(messagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: exotelBasicAuthHeader()
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }

  if (!res.ok) {
    throw new Error(`Exotel WhatsApp HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  type ExotelMsg = { sid?: string; status?: string; error_data?: unknown };
  let msg0: ExotelMsg | undefined;
  if (parsed && typeof parsed === "object" && "response" in parsed) {
    const response = (parsed as { response?: { whatsapp?: { messages?: ExotelMsg[] } } }).response;
    msg0 = response?.whatsapp?.messages?.[0];
  }
  if (msg0?.status === "failure") {
    throw new Error(`Exotel WhatsApp message failure: ${JSON.stringify(msg0).slice(0, 800)}`);
  }

  logger.info("whatsapp_session_text_sent", { to: toE164, sid: msg0?.sid ?? null });
  return msg0?.sid ?? null;
}

// ---------------------------------------------------------------------------
// Auto-reply: greeting → welcome + support menu Flow (CTA button)
// ---------------------------------------------------------------------------

/** Bot display name for auto-replies recorded in the Chats inbox. */
export const WA_BOT_AUTHOR = "Sarveda Assistant";

/** Re-send guard: don't push the menu again within this window per thread. */
const WELCOME_DEBOUNCE_MS = 10 * 60 * 1000;

/** Greeting / menu keywords that (re)open the support menu. */
const GREETING_RE = /^\s*(hi+|hey+|hello+|helo|namaste|namaskara?m?|start|menu|help|options?)\b/i;

function supportFlowId(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_ID?.trim() || "1037332878669898";
}

function supportFlowScreen(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_SCREEN?.trim() || "SUPPORT_MENU";
}

function supportFlowCta(): string {
  return (process.env.WHATSAPP_SUPPORT_FLOW_CTA?.trim() || "Menu").slice(0, 20);
}

function welcomeBodyText(): string {
  return (
    process.env.WHATSAPP_WELCOME_TEXT?.trim() ||
    "Welcome to Sarveda \uD83D\uDE4F\n\n*How can we help you today?*\nTap the menu button below to explore options."
  );
}

/** True if the customer message is a greeting/menu keyword. */
export function isGreeting(body: string): boolean {
  return GREETING_RE.test(body || "");
}

/**
 * Send the published support-menu Flow as an interactive CTA message.
 * Valid inside the customer's 24h session window (a greeting just arrived).
 * Returns the provider message sid when available.
 */
export async function sendSupportMenuFlow(toE164: string): Promise<string | null> {
  if (!isExotelConfigured()) {
    throw new Error("WhatsApp is not configured on the server (Exotel env missing).");
  }
  const from = process.env.EXOTEL_WHATSAPP_FROM!.trim();

  const payload = {
    whatsapp: {
      messages: [
        {
          from,
          to: toE164,
          content: {
            type: "interactive",
            interactive: {
              type: "flow",
              body: { text: welcomeBodyText().slice(0, 1024) },
              action: {
                name: "flow",
                parameters: {
                  mode: "published",
                  flow_message_version: "3",
                  flow_id: supportFlowId(),
                  flow_token: `sarveda-${Date.now()}`,
                  flow_cta: supportFlowCta(),
                  flow_action: "navigate",
                  flow_action_payload: { screen: supportFlowScreen() }
                }
              }
            }
          }
        }
      ]
    }
  };

  const res = await fetch(messagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: exotelBasicAuthHeader()
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* keep text */
  }

  if (!res.ok) {
    throw new Error(`Exotel WhatsApp HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  type ExotelMsg = { sid?: string; status?: string; error_data?: unknown };
  let msg0: ExotelMsg | undefined;
  if (parsed && typeof parsed === "object" && "response" in parsed) {
    const response = (parsed as { response?: { whatsapp?: { messages?: ExotelMsg[] } } }).response;
    msg0 = response?.whatsapp?.messages?.[0];
  }
  if (msg0?.status === "failure") {
    throw new Error(`Exotel WhatsApp flow send failure: ${JSON.stringify(msg0).slice(0, 800)}`);
  }

  logger.info("whatsapp_support_menu_sent", { to: toE164, sid: msg0?.sid ?? null });
  return msg0?.sid ?? null;
}

/**
 * If the inbound message is a greeting, reply with the support-menu Flow and
 * record the bot reply in the thread. Debounced per thread; never throws.
 */
async function maybeSendSupportMenu(threadId: string, toE164: string, body: string): Promise<void> {
  if (!isExotelConfigured() || !isGreeting(body)) return;

  try {
    const recentBot = await prisma.enquiryMessage.findFirst({
      where: {
        threadId,
        authorType: "ADMIN",
        authorName: WA_BOT_AUTHOR,
        createdAt: { gte: new Date(Date.now() - WELCOME_DEBOUNCE_MS) }
      },
      select: { id: true }
    });
    if (recentBot) {
      logger.info("whatsapp_support_menu_debounced", { threadId });
      return;
    }

    const sid = await sendSupportMenuFlow(toE164);

    await prisma.enquiryMessage.create({
      data: {
        threadId,
        authorType: "ADMIN",
        authorName: WA_BOT_AUTHOR,
        authorEmail: "bot@sarveda.com",
        body: `${welcomeBodyText()}\n\n[Support menu sent]`,
        waMessageSid: sid,
        waStatus: sid ? "sent" : null
      }
    });
    await prisma.enquiryThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() }
    });
  } catch (err) {
    logger.error("whatsapp_support_menu_failed", {
      threadId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

// ---------------------------------------------------------------------------
// Inbound webhook parsing (tolerant — Exotel payload shapes vary by account)
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRecord) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Human-readable body from an Exotel/Meta-style content object. */
function extractBody(content: AnyRecord | null, fallback: AnyRecord): string {
  if (!content) {
    return asString(fallback.body) ?? asString(fallback.text) ?? "";
  }
  const type = asString(content.type) ?? "";

  const text = asRecord(content.text);
  if (text) {
    const body = asString(text.body);
    if (body) return body;
  }

  const button = asRecord(content.button);
  if (button) {
    const t = asString(button.text) ?? asString(button.payload);
    if (t) return t;
  }

  const interactive = asRecord(content.interactive);
  if (interactive) {
    const br = asRecord(interactive.button_reply);
    const lr = asRecord(interactive.list_reply);
    const t = asString(br?.title) ?? asString(lr?.title);
    if (t) return t;
  }

  for (const mediaType of ["image", "video", "audio", "document", "sticker"]) {
    const media = asRecord(content[mediaType]);
    if (media) {
      const caption = asString(media.caption);
      const link = asString(media.link) ?? asString(media.url);
      const name = asString(media.filename);
      const parts = [`[${mediaType}]`];
      if (name) parts.push(name);
      if (caption) parts.push(caption);
      if (link) parts.push(link);
      return parts.join(" ");
    }
  }

  const location = asRecord(content.location);
  if (location) {
    return `[location] ${asString(location.latitude) ?? location.latitude},${asString(location.longitude) ?? location.longitude}`;
  }

  if (type) return `[${type} message]`;
  return "";
}

type ParsedInbound = {
  kind: "message";
  sid: string | null;
  from: string;
  profileName: string | null;
  body: string;
};

type ParsedStatus = {
  kind: "status";
  sid: string;
  status: string;
};

function parseCallbackItem(item: AnyRecord): ParsedInbound | ParsedStatus | null {
  const callbackType = asString(item.callback_type) ?? "";
  const sid = asString(item.sid) ?? asString(item.message_sid) ?? null;
  const status = asString(item.status);

  // Delivery receipt: dlr / message-status callbacks carry sid + status, no content.
  const looksLikeDlr =
    callbackType === "dlr" ||
    callbackType === "message-status" ||
    (Boolean(status) && !item.content && !item.text && !asString(item.body));
  if (looksLikeDlr) {
    if (!sid || !status) return null;
    return { kind: "status", sid, status: status.toLowerCase() };
  }

  const fromRaw =
    asString(item.from) ?? asString(asRecord(item.whatsapp)?.from) ?? asString(item.mobile);
  const from = fromRaw ? toWhatsAppE164(fromRaw) : null;
  if (!from) return null;

  const profile = asRecord(item.profile);
  const profileName = asString(item.profile_name) ?? asString(profile?.name);
  const body = extractBody(asRecord(item.content), item);
  if (!body) return null;

  return { kind: "message", sid, from, profileName, body };
}

/** Flatten known Exotel webhook shapes into individual callback items. */
function collectCallbackItems(payload: unknown): AnyRecord[] {
  const root = asRecord(payload);
  if (!root) return [];

  const wa = asRecord(root.whatsapp);
  const fromWa = Array.isArray(wa?.messages) ? (wa!.messages as unknown[]) : null;
  const topMessages = Array.isArray(root.messages) ? (root.messages as unknown[]) : null;

  const list = fromWa ?? topMessages ?? [root];
  return list.map(asRecord).filter((r): r is AnyRecord => r !== null);
}

async function upsertInboundMessage(msg: ParsedInbound): Promise<string | null> {
  // Idempotency: Exotel retries webhooks; skip if we already stored this sid.
  if (msg.sid) {
    const existing = await prisma.enquiryMessage.findUnique({
      where: { waMessageSid: msg.sid },
      select: { id: true }
    });
    if (existing) {
      logger.info("whatsapp_inbound_duplicate_skipped", { sid: msg.sid });
      return null;
    }
  }

  const now = new Date();
  const displayName = msg.profileName || msg.from;
  const email = syntheticWaEmail(msg.from);

  let thread = await prisma.enquiryThread.findFirst({
    where: { source: "WHATSAPP", waPhone: msg.from },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, customerName: true }
  });

  if (!thread) {
    thread = await prisma.enquiryThread.create({
      data: {
        source: "WHATSAPP",
        customerName: displayName,
        customerEmail: email,
        customerPhone: msg.from,
        waPhone: msg.from,
        unreadByAdmin: true,
        lastMessageAt: now,
        lastCustomerMessageAt: now
      },
      select: { id: true, customerName: true }
    });
  }

  await prisma.enquiryMessage.create({
    data: {
      threadId: thread.id,
      authorType: "CUSTOMER",
      authorName: displayName,
      authorEmail: email,
      body: msg.body,
      waMessageSid: msg.sid
    }
  });

  await prisma.enquiryThread.update({
    where: { id: thread.id },
    data: {
      status: "OPEN",
      unreadByAdmin: true,
      lastMessageAt: now,
      lastCustomerMessageAt: now,
      // Keep the profile name fresh if the contact was created from a bare number.
      ...(msg.profileName && thread.customerName === msg.from
        ? { customerName: msg.profileName }
        : {})
    }
  });

  logger.info("whatsapp_inbound_stored", { threadId: thread.id, from: msg.from, sid: msg.sid });
  return thread.id;
}

async function applyStatusUpdate(update: ParsedStatus): Promise<void> {
  const result = await prisma.enquiryMessage.updateMany({
    where: { waMessageSid: update.sid },
    data: { waStatus: update.status }
  });
  if (result.count > 0) {
    logger.info("whatsapp_status_updated", { sid: update.sid, status: update.status });
  }
}

/**
 * Process one Exotel WhatsApp webhook payload (inbound messages + delivery receipts).
 * Never throws — webhook route must always ack 200 to prevent retry storms.
 */
export async function processExotelWhatsAppCallback(payload: unknown): Promise<void> {
  try {
    const items = collectCallbackItems(payload);
    if (!items.length) {
      logger.warn("whatsapp_webhook_unrecognized_payload", {
        sample: JSON.stringify(payload).slice(0, 500)
      });
      return;
    }
    for (const item of items) {
      const parsed = parseCallbackItem(item);
      if (!parsed) {
        logger.warn("whatsapp_webhook_item_skipped", {
          sample: JSON.stringify(item).slice(0, 400)
        });
        continue;
      }
      if (parsed.kind === "message") {
        const threadId = await upsertInboundMessage(parsed);
        if (threadId) {
          await maybeSendSupportMenu(threadId, parsed.from, parsed.body);
        }
      } else {
        await applyStatusUpdate(parsed);
      }
    }
  } catch (err) {
    logger.error("whatsapp_webhook_processing_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
