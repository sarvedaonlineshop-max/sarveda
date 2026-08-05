/**
 * WhatsApp shared inbox (Exotel WABA).
 *
 * Inbound customer messages arrive on the Exotel webhook and are stored as
 * EnquiryThread/EnquiryMessage rows with source WHATSAPP, so they appear in
 * the existing admin Chats UI. Admin replies for WHATSAPP threads go out as
 * Exotel session text messages (24h window) instead of email.
 *
 * Auto-replies are handled by the interactive button/list bot in
 * `whatsapp-bot.service`.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { toWhatsAppE164 } from "../notifications/whatsapp";
import { handleBotTurn } from "./whatsapp-bot.service";
import { isExotelConfigured, sendExotelWhatsAppContent } from "./whatsapp-exotel";
import { createSupportFlowToken } from "./whatsapp-flow.token";

export const WA_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export { WA_BOT_AUTHOR, isGreeting } from "./whatsapp-bot.service";

/** Synthetic, non-routable email for WA-only contacts (EnquiryThread.customerEmail is required). */
function syntheticWaEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, "")}@whatsapp.invalid`;
}

/**
 * Send a free-form session text (valid only inside the customer's 24h window).
 * Returns the provider message sid when available.
 */
export async function sendWhatsAppSessionText(toE164: string, body: string): Promise<string | null> {
  return sendExotelWhatsAppContent(
    toE164,
    {
      recipient_type: "individual",
      type: "text",
      text: { body: body.slice(0, 4096) }
    },
    "whatsapp_session_text_sent"
  );
}

// ---------------------------------------------------------------------------
// Meta Flow CTA (parked)
//
// Kept for the dynamic Flow path, which is blocked on Meta signing our business
// public key. The live support menu uses interactive lists instead — see
// `whatsapp-bot.service`.
// ---------------------------------------------------------------------------

function supportFlowId(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_ID?.trim() || "1037332878669898";
}

function supportFlowScreen(): string {
  return process.env.WHATSAPP_SUPPORT_FLOW_SCREEN?.trim() || "SUPPORT_MENU";
}

function supportFlowCta(): string {
  return (process.env.WHATSAPP_SUPPORT_FLOW_CTA?.trim() || "Menu").slice(0, 20);
}

/** Send the published support-menu Flow as an interactive CTA message. */
export async function sendSupportMenuFlow(toE164: string): Promise<string | null> {
  return sendExotelWhatsAppContent(
    toE164,
    {
      type: "interactive",
      interactive: {
        type: "flow",
        header: { type: "text", text: "Sarveda Support" },
        body: { text: "How can we help you today?" },
        footer: { text: "We're here to help." },
        action: {
          name: "flow",
          parameters: {
            mode: "published",
            flow_message_version: "3",
            flow_id: supportFlowId(),
            flow_token: createSupportFlowToken(toE164),
            flow_cta: supportFlowCta(),
            flow_action: "navigate",
            flow_action_payload: { screen: supportFlowScreen() }
          }
        }
      }
    },
    "whatsapp_support_menu_sent"
  );
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

/**
 * Stable id behind a tapped button or list row. The bot routes on this rather
 * than the visible title, so wording changes can't break routing.
 */
function extractReplyId(content: AnyRecord | null): string | null {
  if (!content) return null;

  const interactive = asRecord(content.interactive);
  if (interactive) {
    const br = asRecord(interactive.button_reply);
    const lr = asRecord(interactive.list_reply);
    const id = asString(br?.id) ?? asString(lr?.id);
    if (id) return id;
  }

  // Template quick-reply buttons surface the id as a payload instead.
  const button = asRecord(content.button);
  if (button) {
    const payload = asString(button.payload);
    if (payload) return payload;
  }

  return null;
}

type ParsedInbound = {
  kind: "message";
  sid: string | null;
  from: string;
  profileName: string | null;
  body: string;
  replyId: string | null;
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
  const content = asRecord(item.content);
  const body = extractBody(content, item);
  if (!body) return null;

  return { kind: "message", sid, from, profileName, body, replyId: extractReplyId(content) };
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

type StoredInbound = { threadId: string; customerName: string };

async function upsertInboundMessage(msg: ParsedInbound): Promise<StoredInbound | null> {
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
  return { threadId: thread.id, customerName: displayName };
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
        const stored = await upsertInboundMessage(parsed);
        if (stored && isExotelConfigured()) {
          await handleBotTurn({
            threadId: stored.threadId,
            phone: parsed.from,
            name: stored.customerName,
            text: parsed.body,
            replyId: parsed.replyId
          });
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
