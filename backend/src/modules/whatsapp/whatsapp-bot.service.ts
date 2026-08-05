/**
 * WhatsApp support bot (interactive buttons + list menus).
 *
 * Routing is stateless: every option we send carries an id that encodes the
 * full context (`i:<orderId>:<issueCode>`), so tapping a stale button from an
 * old message still resolves correctly and we never need a session table.
 *
 * The bot deliberately goes quiet once a human is involved — see
 * `botShouldStayQuiet` — so it can't talk over an agent mid-conversation.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { publishEnquiryEvent } from "../enquiries/enquiry-realtime";
import {
  sendWhatsAppButtons,
  sendWhatsAppList,
  sendWhatsAppText,
  type ListRow
} from "./whatsapp-interactive";
import {
  findOwnedOrder,
  formatMoney,
  listOrders,
  statusLabel,
  type OwnedOrder
} from "./whatsapp-support.data";
import {
  consumeWhatsAppBotOptionToken,
  issueWhatsAppBotOptionToken
} from "../../jobs/whatsappBotIdleJob";
import {
  closeWhatsAppAgentSession,
  rateWhatsAppAgentSession,
  startWhatsAppAgentSession
} from "./whatsapp-agent-session.service";

/** Bot display name for replies recorded in the admin Chats inbox. */
export const WA_BOT_AUTHOR = "Sarveda Assistant";

/** Marker on EnquiryThread.contextTitle meaning "a human should take this over". */
const AGENT_FLAG = "WhatsApp · live agent requested";

/** Greeting / menu keywords that (re)open the support menu and resume the bot. */
const GREETING_RE = /^\s*(hi+|hey+|hello+|helo|namaste|namaskara?m?|start|menu|help|options?)\b/i;

/** Don't re-push the menu to someone typing free text more than once per window. */
const MENU_NUDGE_DEBOUNCE_MS = 10 * 60 * 1000;

const ISSUE_LABELS: Record<string, string> = {
  dmg: "Item broken or damaged",
  wrong: "Wrong item received",
  desc: "Not as described",
  missing: "Item missing from order",
  other: "Something else"
};

const RATING_LABELS: Record<string, string> = {
  "5": "Happy",
  "3": "Okay",
  "1": "Unhappy"
};

export function isGreeting(body: string): boolean {
  return GREETING_RE.test(body || "");
}

function syntheticWaEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, "")}@whatsapp.invalid`;
}

// ---------------------------------------------------------------------------
// Thread bookkeeping
// ---------------------------------------------------------------------------

async function recordBotMessage(threadId: string, body: string, sid: string | null): Promise<void> {
  await prisma.enquiryMessage.create({
    data: {
      threadId,
      authorType: "ADMIN",
      authorName: WA_BOT_AUTHOR,
      authorEmail: "bot@sarveda.com",
      body,
      waMessageSid: sid,
      waStatus: sid ? "sent" : null
    }
  });
  await prisma.enquiryThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() }
  });
  publishEnquiryEvent({ type: "message_changed", threadId });
}

/**
 * True when the bot must not auto-reply: a human agent has spoken recently, or
 * the customer explicitly asked for one. A greeting clears the agent flag.
 */
async function botShouldStayQuiet(threadId: string): Promise<boolean> {
  const thread = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { contextTitle: true }
  });
  if (thread?.contextTitle === AGENT_FLAG) return true;

  const humanReply = await prisma.enquiryMessage.findFirst({
    where: {
      threadId,
      authorType: "ADMIN",
      authorName: { not: WA_BOT_AUTHOR },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    select: { id: true }
  });
  return Boolean(humanReply);
}

async function flagForHuman(threadId: string, reason: string): Promise<void> {
  await Promise.all([
    startWhatsAppAgentSession(threadId, reason),
    prisma.enquiryThread.update({
      where: { id: threadId },
      data: {
        contextTitle: AGENT_FLAG,
        customSubject: reason,
        status: "OPEN",
        unreadByAdmin: true,
        lastMessageAt: new Date()
      }
    })
  ]);
}

async function clearAgentFlag(threadId: string): Promise<void> {
  await Promise.all([
    prisma.enquiryThread.updateMany({
      where: { id: threadId, contextTitle: AGENT_FLAG },
      data: { contextTitle: null }
    }),
    closeWhatsAppAgentSession(threadId, "customer_restarted")
  ]);
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function welcomeBody(): string {
  return (
    process.env.WHATSAPP_WELCOME_TEXT?.trim() ||
    "Welcome to Sarveda 🙏\n\n*How can we help you today?*\nTap the button below and choose an option."
  );
}

async function sendMainMenu(threadId: string, phone: string): Promise<void> {
  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const sid = await sendWhatsAppList(
    phone,
    {
      header: "Sarveda Support",
      body: welcomeBody(),
      footer: "We usually reply within a few minutes"
    },
    "Menu",
    [
      {
        title: "Orders",
        rows: [
          {
            id: `m:${token}:orders`,
            title: "Order-related issue",
            description: "Damaged, wrong or missing item"
          },
          { id: `m:${token}:track`, title: "Track my order", description: "Check delivery status" },
          {
            id: `m:${token}:pay`,
            title: "Paid but no order",
            description: "Money debited, order not confirmed"
          }
        ]
      },
      {
        title: "More help",
        rows: [
          {
            id: `m:${token}:agent`,
            title: "Chat with live agent",
            description: "Talk to our support team"
          },
          { id: `m:${token}:exit`, title: "Exit", description: "Close this conversation" }
        ]
      }
    ]
  );
  await recordBotMessage(threadId, "[Support menu sent]", sid);
}

async function sendNoOrdersFound(threadId: string, phone: string): Promise<void> {
  const body =
    "We couldn't find any order linked to this WhatsApp number.\n\n" +
    "If you ordered using a different number, our team can look it up for you.";
  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const sid = await sendWhatsAppButtons(phone, { body }, [
    { id: `m:${token}:agent`, title: "Chat with agent" },
    { id: `nav:${token}:menu`, title: "Main Menu" },
    { id: `nav:${token}:exit`, title: "Exit" }
  ]);
  await recordBotMessage(threadId, body, sid);
}

/** `intent` decides what tapping an order does next: report an issue, or track it. */
async function sendOrderList(
  threadId: string,
  phone: string,
  intent: "issue" | "track"
): Promise<void> {
  const orders = await listOrders(phone);
  if (orders.length === 0) {
    await sendNoOrdersFound(threadId, phone);
    return;
  }

  const prefix = intent === "issue" ? "o" : "t";
  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const rows: ListRow[] = orders.map((order) => ({
    id: `${prefix}:${token}:${order.id}`,
    title: order.title,
    description: order.description
  }));

  const body =
    intent === "issue"
      ? "Here are your recent orders.\n\n*Which order do you need help with?*"
      : "Here are your recent orders.\n\n*Which order would you like to track?*";

  const sid = await sendWhatsAppList(
    phone,
    { header: intent === "issue" ? "Your orders" : "Track order", body },
    "Select order",
    [{ title: "Recent orders", rows }]
  );
  await recordBotMessage(threadId, `${body}\n[${orders.length} order(s) listed]`, sid);
}

function orderDetailsText(order: OwnedOrder): string {
  const lines = [
    `*${order.orderNumber}*`,
    `Status: ${statusLabel(order.status)}`,
    `Placed: ${order.createdAt.toLocaleDateString("en-IN")}`,
    "",
    ...order.items.map(
      (item, index) =>
        `${index + 1}. ${item.nameSnapshot} × ${item.qtyOrdered} — ${formatMoney(
          item.lineTotalInPaise,
          order.currency
        )}`
    ),
    "",
    `Subtotal: ${formatMoney(order.subtotalInPaise, order.currency)}`
  ];

  if (order.discountInPaise > 0) {
    lines.push(`Discount: −${formatMoney(order.discountInPaise, order.currency)}`);
  }
  if (order.shippingInPaise > 0) {
    lines.push(`Shipping: ${formatMoney(order.shippingInPaise, order.currency)}`);
  }
  lines.push(`*Total: ${formatMoney(order.grandTotalInPaise, order.currency)}*`);

  return lines.join("\n");
}

async function sendOrderIssueMenu(
  threadId: string,
  phone: string,
  order: OwnedOrder
): Promise<void> {
  const details = orderDetailsText(order);
  const detailsSid = await sendWhatsAppText(phone, details);
  await recordBotMessage(threadId, details, detailsSid);

  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const rows: ListRow[] = Object.entries(ISSUE_LABELS).map(([code, label]) => ({
    id: `i:${token}:${order.id}:${code}`,
    title: label
  }));

  const body = `*What went wrong with ${order.orderNumber}?*\nChoose the closest option.`;
  const sid = await sendWhatsAppList(
    phone,
    { header: "Report an issue", body },
    "Select issue",
    [{ title: "Issue type", rows }]
  );
  await recordBotMessage(threadId, body, sid);
}

async function sendOrderTracking(
  threadId: string,
  phone: string,
  order: OwnedOrder
): Promise<void> {
  const shipment = order.shipments[0];
  const lines: string[] = [];

  if (shipment?.awb) {
    lines.push(
      `*Tracking ${order.orderNumber}*`,
      `Courier: ${shipment.courier}`,
      `AWB: ${shipment.awb}`,
      ...(shipment.trackingUrl ? [`Track: ${shipment.trackingUrl}`] : []),
      ""
    );
  } else {
    lines.push(
      `*Tracking ${order.orderNumber}*`,
      "Your order hasn't been handed to the courier yet. We'll share tracking as soon as it ships.",
      ""
    );
  }
  // Put tracking first so WhatsApp's 1,024-character interactive-body limit
  // can only trim lower-priority item detail, never the delivery result.
  lines.push(orderDetailsText(order));

  const body = lines.join("\n");
  // Keep the tracking result and navigation in one provider message. Exotel
  // accepts sequential sends in order, but WhatsApp can deliver two separate
  // messages out of order. One interactive message is atomic.
  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const sid = await sendWhatsAppButtons(phone, { body }, [
    { id: `nav:${token}:menu`, title: "Main Menu" },
    { id: `nav:${token}:exit`, title: "Exit" }
  ]);
  await recordBotMessage(threadId, body, sid);
}

// ---------------------------------------------------------------------------
// Actions that write back
// ---------------------------------------------------------------------------

async function recordOrderIssue(
  threadId: string,
  phone: string,
  name: string,
  order: OwnedOrder,
  issueCode: string
): Promise<void> {
  const issueLabel = ISSUE_LABELS[issueCode] ?? "Order issue";

  await prisma.$transaction([
    prisma.enquiryMessage.create({
      data: {
        threadId,
        authorType: "CUSTOMER",
        authorName: name,
        authorEmail: syntheticWaEmail(phone),
        body: `Reported an issue via WhatsApp\nOrder: ${order.orderNumber}\nIssue: ${issueLabel}`
      }
    }),
    prisma.enquiryThread.update({
      where: { id: threadId },
      data: {
        subjectCategory: "ORDER",
        customSubject: issueLabel,
        orderNumber: order.orderNumber,
        status: "OPEN",
        unreadByAdmin: true,
        lastMessageAt: new Date()
      }
    })
  ]);
}

async function recordFeedback(
  threadId: string,
  phone: string,
  name: string,
  order: OwnedOrder,
  rating: string
): Promise<void> {
  await prisma.$transaction([
    prisma.enquiryMessage.create({
      data: {
        threadId,
        authorType: "CUSTOMER",
        authorName: name,
        authorEmail: syntheticWaEmail(phone),
        body: `Chat feedback: ${RATING_LABELS[rating] ?? rating} · Order ${order.orderNumber}`
      }
    }),
    prisma.enquiryThread.update({
      where: { id: threadId },
      data: { unreadByAdmin: true, lastMessageAt: new Date() }
    })
  ]);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export type BotTurn = {
  threadId: string;
  phone: string;
  name: string;
  /** Free text the customer typed (button taps also carry their title here). */
  text: string;
  /** Reply id from an interactive button/list tap, when present. */
  replyId: string | null;
};

// The production backend runs as one PM2 fork. Serialize turns per customer so
// two rapid webhook requests cannot interleave multi-step bot responses.
const pendingTurns = new Map<string, Promise<void>>();

export function enqueueBotTurn(turn: BotTurn): Promise<void> {
  const previous = pendingTurns.get(turn.phone) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => handleBotTurn(turn));
  pendingTurns.set(turn.phone, current);
  void current.finally(() => {
    if (pendingTurns.get(turn.phone) === current) pendingTurns.delete(turn.phone);
  });
  return current;
}

async function handleMenuChoice(turn: BotTurn, choice: string): Promise<void> {
  const { threadId, phone } = turn;

  switch (choice) {
    case "orders":
      await sendOrderList(threadId, phone, "issue");
      return;

    case "track":
      await sendOrderList(threadId, phone, "track");
      return;

    case "pay": {
      const body =
        "Sorry about that. If money was debited but the order didn't confirm, it is usually " +
        "auto-refunded by your bank within 5–7 working days.\n\n" +
        "We've asked our team to check this for you — someone will reply here shortly.";
      const sid = await sendWhatsAppText(phone, body);
      await recordBotMessage(threadId, body, sid);
      await flagForHuman(threadId, "Payment debited, order not confirmed");
      return;
    }

    case "agent": {
      const body =
        "Sure — connecting you with our support team 🙏\n\n" +
        "Please describe your query here and an agent will reply shortly.";
      const sid = await sendWhatsAppText(phone, body);
      await recordBotMessage(threadId, body, sid);
      await flagForHuman(threadId, "Live agent requested");
      return;
    }

    case "exit":
    default: {
      const body = "Thank you for contacting Sarveda 🙏\nSend *Hi* any time to reopen the menu.";
      const sid = await sendWhatsAppText(phone, body);
      await recordBotMessage(threadId, body, sid);
      return;
    }
  }
}

async function handleReplyId(turn: BotTurn, replyId: string): Promise<boolean> {
  const { threadId, phone, name } = turn;
  const [kind, token, first, second] = replyId.split(":");
  const botKinds = new Set(["m", "nav", "o", "t", "i", "f", "a"]);
  if (!botKinds.has(kind)) return false;

  if (!token || !(await consumeWhatsAppBotOptionToken(threadId, token))) {
    const body =
      "That menu has expired or was already used.\n\n" +
      "Send *Hi* to open a fresh menu. 🙏";
    const sid = await sendWhatsAppText(phone, body);
    await recordBotMessage(threadId, body, sid);
    return true;
  }

  if (kind === "m") {
    await clearAgentFlag(threadId);
    await handleMenuChoice(turn, first ?? "exit");
    return true;
  }

  if (kind === "nav") {
    if (first === "menu") {
      await clearAgentFlag(threadId);
      await sendMainMenu(threadId, phone);
    } else {
      await handleMenuChoice(turn, "exit");
    }
    return true;
  }

  if (kind === "o" || kind === "t") {
    if (!first) return false;
    const order = await findOwnedOrder(phone, first);
    if (!order) {
      const body = "That order isn't linked to this WhatsApp number.";
      const sid = await sendWhatsAppText(phone, body);
      await recordBotMessage(threadId, body, sid);
      await sendMainMenu(threadId, phone);
      return true;
    }
    if (kind === "o") {
      await sendOrderIssueMenu(threadId, phone, order);
    } else {
      await sendOrderTracking(threadId, phone, order);
    }
    return true;
  }

  if (kind === "i") {
    if (!first || !second) return false;
    const order = await findOwnedOrder(phone, first);
    if (!order) return false;

    await recordOrderIssue(threadId, phone, name, order, second);
    await flagForHuman(threadId, `Order ${order.orderNumber}: ${ISSUE_LABELS[second] ?? "issue"}`);

    const issueLabel = (ISSUE_LABELS[second] ?? "issue").toLowerCase();
    const body =
      `We're really sorry about the ${issueLabel} with *${order.orderNumber}* 🙏\n\n` +
      "Our support team has been notified and will get back to you shortly with a resolution.";
    const sid = await sendWhatsAppText(phone, body);
    await recordBotMessage(threadId, body, sid);

    return true;
  }

  if (kind === "f") {
    if (!first || !second) return false;
    const order = await findOwnedOrder(phone, first);
    if (order) {
      await recordFeedback(threadId, phone, name, order, second);
    }
    const body =
      "Thank you for your feedback 🙏\n\n" +
      "Your request is with our support team. Send *Hi* any time to reopen the menu.";
    const sid = await sendWhatsAppText(phone, body);
    await recordBotMessage(threadId, body, sid);
    return true;
  }

  if (kind === "a") {
    if (!first || !second) return false;
    const rating = Number(second);
    const recorded = await rateWhatsAppAgentSession(threadId, first, rating);
    const body = recorded
      ? "Thank you for rating our support 🙏\nYour feedback helps us serve you better."
      : "This rating request was already completed or is no longer available.";
    const sid = await sendWhatsAppText(phone, body);
    await recordBotMessage(threadId, body, sid);
    return true;
  }

  return false;
}

/**
 * Handle one inbound customer message. Never throws — the webhook must always
 * ack 200 so Exotel doesn't retry.
 */
export async function handleBotTurn(turn: BotTurn): Promise<void> {
  try {
    if (turn.replyId) {
      const handled = await handleReplyId(turn, turn.replyId);
      if (handled) return;
    }

    if (isGreeting(turn.text)) {
      await clearAgentFlag(turn.threadId);
      await sendMainMenu(turn.threadId, turn.phone);
      return;
    }

    // Free text: stay out of the way if a human is handling this conversation.
    if (await botShouldStayQuiet(turn.threadId)) return;

    const recentNudge = await prisma.enquiryMessage.findFirst({
      where: {
        threadId: turn.threadId,
        authorType: "ADMIN",
        authorName: WA_BOT_AUTHOR,
        createdAt: { gte: new Date(Date.now() - MENU_NUDGE_DEBOUNCE_MS) }
      },
      select: { id: true }
    });
    if (recentNudge) return;

    await sendMainMenu(turn.threadId, turn.phone);
  } catch (err) {
    logger.error("whatsapp_bot_turn_failed", {
      threadId: turn.threadId,
      replyId: turn.replyId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
