import { prisma } from "../../config/db";
import { getCategoryTree } from "../categories/categories.service";
import { suggestProducts } from "../products/products.service";

export type ChatProductSuggestion = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceInPaise: number | null;
};

export type ChatIntent = "order" | "product" | "general";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatContextBundle = {
  intent: ChatIntent;
  systemSections: string[];
  products: ChatProductSuggestion[];
  showProductCards: boolean;
};

const ORDER_NUMBER_RE = /\bSRV-\d{6,}\b/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const ORDER_HINT_RE =
  /\b(order|tracking|track|shipped|shipping|delivery|deliver|awb|receive|arrived|where\s+is\s+my|when\s+will\s+i|my\s+package)\b/i;

const PRODUCT_HINT_RE =
  /\b(price|cost|how\s+much|buy|purchase|product|available|stock|recommend|suggest|looking\s+for|do\s+you\s+have|show\s+me|want\s+a|need\s+a|sing(?:ing)?\s+bowl|yoga|meditation|ayurveda|herb)\b/i;

function formatInr(paise: number | null): string {
  if (paise == null) return "price on request";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function humanStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING_PAYMENT: "Awaiting payment",
    PAID: "Payment received — order confirmed",
    PROCESSING: "Being prepared in our warehouse",
    PACKED: "Packed and ready to ship",
    SHIPPED: "Shipped — on the way",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded"
  };
  return map[status] ?? status;
}

function humanShipmentStatus(status: string): string {
  const map: Record<string, string> = {
    CREATED: "Label created",
    PICKED: "Picked up by courier",
    INTRANSIT: "In transit",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    RTO: "Returned to origin"
  };
  return map[status] ?? status;
}

function deliveryGuidance(orderStatus: string, shipmentStatus: string | null, isCod: boolean): string {
  if (orderStatus === "DELIVERED") return "This order has been marked delivered.";
  if (orderStatus === "CANCELLED" || orderStatus === "REFUNDED") {
    return "This order is not active for delivery.";
  }
  if (orderStatus === "PENDING_PAYMENT") {
    return isCod
      ? "Complete checkout to confirm your COD order."
      : "Complete payment to confirm the order, then we dispatch within 1–2 business days.";
  }
  if (shipmentStatus === "OUT_FOR_DELIVERY") {
    return "Usually arrives within 1–2 days.";
  }
  if (shipmentStatus === "INTRANSIT" || shipmentStatus === "PICKED" || orderStatus === "SHIPPED") {
    return "Typically 3–6 more business days across India after dispatch (location dependent).";
  }
  if (orderStatus === "PAID" || orderStatus === "PROCESSING" || orderStatus === "PACKED") {
    return "We usually dispatch within 1–2 business days, then allow 5–8 business days for delivery in India.";
  }
  return "Standard India delivery is about 5–8 business days after dispatch.";
}

export function detectChatIntent(latestUserText: string, allUserText: string): ChatIntent {
  const latest = latestUserText.toLowerCase();
  const all = allUserText.toLowerCase();

  if (ORDER_NUMBER_RE.test(all) || ORDER_HINT_RE.test(latest) || ORDER_HINT_RE.test(all)) {
    return "order";
  }
  if (PRODUCT_HINT_RE.test(latest)) {
    return "product";
  }
  return "general";
}

function extractOrderNumber(text: string): string | null {
  const m = text.match(ORDER_NUMBER_RE);
  return m ? m[0].toUpperCase() : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function collectConversationText(messages: ChatTurn[]): string {
  return messages.map((m) => m.content).join("\n");
}

async function loadOrderForChat(orderNumber: string, email: string): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      addresses: true,
      payments: { take: 1 },
      shipments: { orderBy: { createdAt: "desc" }, take: 3 }
    }
  });

  if (!order || order.deletedAt || order.email.toLowerCase() !== email.toLowerCase()) {
    return null;
  }

  const ship = order.addresses.find((a) => a.type === "SHIPPING");
  const paymentProvider = order.payments[0]?.provider ?? null;
  const isCod = paymentProvider === "COD";
  const latestShipment = order.shipments[0];
  const lines: string[] = [
    `Order number: ${order.orderNumber}`,
    `Order status: ${humanStatus(order.status)}`,
    `Payment: ${order.paymentStatus}${isCod ? " (Cash on Delivery)" : ""}`,
    `Total: ${formatInr(order.grandTotalInPaise)} (incl. shipping ${formatInr(order.shippingInPaise)})`,
    `Placed: ${(order.placedAt ?? order.createdAt).toISOString().slice(0, 10)}`,
    `Items: ${order.items.map((i) => `${i.nameSnapshot} ×${i.qtyOrdered}`).join("; ")}`
  ];

  if (ship) {
    lines.push(`Ship to: ${ship.city}, ${ship.state} ${ship.postalCode}, ${ship.country}`);
  }

  if (latestShipment) {
    lines.push(
      `Courier: ${latestShipment.courier}`,
      `Shipment status: ${humanShipmentStatus(latestShipment.status)}`
    );
    if (latestShipment.awb) lines.push(`AWB: ${latestShipment.awb}`);
    if (latestShipment.trackingUrl) lines.push(`Tracking: ${latestShipment.trackingUrl}`);
    if (latestShipment.deliveredAt) {
      lines.push(`Delivered on: ${latestShipment.deliveredAt.toISOString().slice(0, 10)}`);
    }
  } else {
    lines.push("Shipment: not created yet");
  }

  lines.push(`Delivery expectation: ${deliveryGuidance(order.status, latestShipment?.status ?? null, isCod)}`);

  return lines.join("\n");
}

async function loadRecentOrdersForEmail(email: string, limit = 5): Promise<string | null> {
  const orders = await prisma.order.findMany({
    where: { email: email.toLowerCase(), deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      items: { take: 2 },
      shipments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });

  if (orders.length === 0) return null;

  const lines = orders.map((o) => {
    const ship = o.shipments[0];
    const itemHint = o.items[0]?.nameSnapshot ?? "items";
    const track = ship?.awb ? ` | AWB ${ship.awb}` : "";
    return `- ${o.orderNumber}: ${humanStatus(o.status)} | ${itemHint}${track}`;
  });

  return lines.join("\n");
}

async function gatherProductContext(query: string): Promise<ChatProductSuggestion[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const seen = new Set<string>();
  const out: ChatProductSuggestion[] = [];

  const add = (items: ChatProductSuggestion[]) => {
    for (const p of items) {
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push(p);
      if (out.length >= 6) return;
    }
  };

  add(await suggestProducts(term, 6));

  if (out.length < 3) {
    const words = term
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);
    for (const w of words) {
      add(await suggestProducts(w, 3));
      if (out.length >= 6) break;
    }
  }

  return out;
}

function flattenCategoryNames(nodes: Awaited<ReturnType<typeof getCategoryTree>>, depth = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${"  ".repeat(depth)}${n.name}`);
    if (n.children.length > 0 && depth < 1) {
      lines.push(...flattenCategoryNames(n.children, depth + 1));
    }
  }
  return lines;
}

export async function buildChatContext(
  messages: ChatTurn[],
  user?: { name?: string | null; email?: string | null }
): Promise<ChatContextBundle> {
  const userTurns = messages.filter((m) => m.role === "user");
  const latestUser = userTurns[userTurns.length - 1]?.content ?? "";
  const allUserText = userTurns.map((m) => m.content).join(" ");
  const fullConversation = collectConversationText(messages);

  const intent = detectChatIntent(latestUser, allUserText);
  const sections: string[] = [];
  let products: ChatProductSuggestion[] = [];

  if (user?.name || user?.email) {
    sections.push(
      `Customer session: ${user.name?.trim() || "signed-in customer"}${user.email ? ` (${user.email})` : ""}.`
    );
  }

  if (intent === "order") {
    const orderNumber =
      extractOrderNumber(fullConversation) ?? extractOrderNumber(latestUser);
    const guestEmail =
      extractEmail(fullConversation) ?? extractEmail(latestUser) ?? user?.email?.toLowerCase() ?? null;

    if (orderNumber && guestEmail) {
      const detail = await loadOrderForChat(orderNumber, guestEmail);
      if (detail) {
        sections.push(`ORDER DATA (authoritative — answer the customer's order question using this):\n${detail}`);
      } else {
        sections.push(
          `ORDER LOOKUP: No order found for ${orderNumber} with that email. Politely ask them to double-check the order number (format SRV-…) and the email used at checkout. Do not guess status.`
        );
      }
    } else if (user?.email) {
      const recent = await loadRecentOrdersForEmail(user.email);
      if (recent) {
        sections.push(
          `CUSTOMER RECENT ORDERS (logged in — use for "my order" questions; if they need one order in detail, ask for order number SRV-…):\n${recent}`
        );
      } else {
        sections.push(
          "ORDER LOOKUP: Customer is logged in but has no orders on this account. Suggest they check the checkout email or share order number SRV-… and email."
        );
      }
    } else {
      sections.push(
        "ORDER LOOKUP: Customer asked about an order but did not provide enough info. Ask for: (1) order number starting with SRV-, and (2) email used at checkout. Be warm and brief."
      );
    }
  }

  if (intent === "product") {
    products = await gatherProductContext(latestUser || allUserText);
    if (products.length > 0) {
      const productBlock = products
        .map((p) => `- ${p.name} | ${formatInr(p.priceInPaise)} | /product/${p.slug}`)
        .join("\n");
      sections.push(`PRODUCT CATALOG MATCHES (use for price/availability questions — only these):\n${productBlock}`);
    } else {
      sections.push(
        "PRODUCT SEARCH: No close catalog match. Suggest they browse /shop or /search, or describe the item differently. Do not invent products or prices."
      );
    }
  }

  if (intent === "general") {
    const categories = await getCategoryTree();
    const categoryLines = flattenCategoryNames(categories).slice(0, 12);
    sections.push(
      `STORE INFO: Sarveda sells yoga, meditation, sound healing, Ayurveda, and eco products. Browse /shop or /search.\nMain categories:\n${categoryLines.join("\n")}`
    );
    sections.push(
      "POLICIES (general): India — Razorpay + COD where available. International — Stripe/PayPal. Typical India delivery 5–8 business days after dispatch. Support: hello@sarveda.com or /my-account."
    );
  }

  return {
    intent,
    systemSections: sections,
    products,
    showProductCards: intent === "product" && products.length > 0
  };
}

export function buildChatSystemPrompt(sections: string[], intent: ChatIntent): string {
  const intentGuide: Record<ChatIntent, string> = {
    order:
      "The customer is asking about their order, delivery, or tracking. Answer that directly using ORDER DATA or RECENT ORDERS. Do NOT push unrelated products.",
    product:
      "The customer wants product info, prices, or recommendations. Answer using PRODUCT CATALOG MATCHES only. Mention exact names and INR prices.",
    general:
      "Answer their general question helpfully. Do NOT list random products unless they asked for shopping help."
  };

  return `You are the live Sarveda customer support assistant on sarveda.com — like a helpful human on chat, not a marketing bot.

${intentGuide[intent]}

How to reply:
- Answer exactly what they asked, in 2–5 short sentences unless they need a list.
- Warm, natural English. Use "you" and "we". No robotic disclaimers.
- Use ONLY the live data sections below for facts (orders, prices, tracking). Never invent order status, AWB, or prices.
- If data is missing, ask one clear follow-up (e.g. order number + email) — do not dump generic links unless helpful.
- Links: /my-account (orders), /track/[awb] if AWB given, /product/[slug], /shop, hello@sarveda.com
- Wellness products: no medical cure claims.

--- LIVE DATA ---
${sections.join("\n\n")}
--- END LIVE DATA ---`;
}
