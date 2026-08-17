import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import type { OrderEmailEvent } from "./email";

type TemplateParams = string[];

const TEMPLATE_BY_EVENT: Record<OrderEmailEvent, string> = {
  order_confirmed: "order_confirmed",
  payment_failed: "payment_failed",
  payment_reminder: "payment_reminder",
  order_processing: "order_processing",
  order_shipped: "order_shipped",
  order_delivered: "order_delivered",
  order_returned: "order_returned",
  refund_initiated: "refund_initiated",
  order_cancelled: "order_cancelled"
};

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda-demo.xyz";
  return raw.replace(/\/$/, "");
}

function formatOrderTotal(minor: number, currency: string): string {
  const c = currency.toUpperCase();
  const major = minor / 100;
  if (c === "INR") {
    return `₹${major.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(major);
  } catch {
    return `${c} ${major.toFixed(2)}`;
  }
}

function orderViewUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  return `${siteBaseUrl()}/order/details?orderNumber=${encodeURIComponent(orderNumber)}&${q.toString()}`;
}

function orderCancelledUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  return `${siteBaseUrl()}/order/cancelled?orderNumber=${encodeURIComponent(orderNumber)}&${q.toString()}`;
}

function trackUrl(awb: string): string {
  return `${siteBaseUrl()}/track/${encodeURIComponent(awb)}`;
}

/** Normalize to E.164 for India-first checkout; pass through if already +country. */
export function toWhatsAppE164(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const raw = phone.trim();
  if (raw.startsWith("+") && /^\+\d{10,15}$/.test(raw.replace(/[\s-]/g, ""))) {
    return raw.replace(/[\s-]/g, "");
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function firstNameFromOrder(fullName: string | null | undefined, email: string): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName.slice(0, 60);
  const local = email.split("@")[0]?.trim();
  return (local || "there").slice(0, 60);
}

/** Compact line-item block for WhatsApp template {{3}} on order_confirmed. {{4}} is shipping, {{5}} is grand total. */
function formatOrderItemsForWhatsApp(
  items: Array<{ nameSnapshot: string; qtyOrdered: number; lineTotalInPaise: number }>,
  currency: string
): string {
  if (!items.length) return "—";
  const lines = items.map(
    (i) => `${i.nameSnapshot} × ${i.qtyOrdered} — ${formatOrderTotal(i.lineTotalInPaise, currency)}`
  );
  let text = lines.join("\n");
  if (text.length <= 1024) return text;

  let kept: string[] = [];
  for (const line of lines) {
    const next = kept.length ? `${kept.join("\n")}\n${line}` : line;
    if (next.length > 980) break;
    kept.push(line);
  }
  const omitted = lines.length - kept.length;
  const suffix = omitted > 0 ? `\n…and ${omitted} more item${omitted === 1 ? "" : "s"}` : "";
  return `${kept.join("\n")}${suffix}`.slice(0, 1024);
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
  const host = (process.env.EXOTEL_API_HOST?.trim() || "api.exotel.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/v2/accounts/${encodeURIComponent(sid)}/messages`;
}

function exotelBasicAuthHeader(): string {
  const key = process.env.EXOTEL_API_KEY!.trim();
  const token = process.env.EXOTEL_API_TOKEN!.trim();
  // Node fetch (undici) rejects URLs with embedded user:pass@ — use Basic auth header instead.
  return `Basic ${Buffer.from(`${key}:${token}`, "utf8").toString("base64")}`;
}

type ExotelMsg = {
  status?: string;
  error_data?: unknown;
  sid?: string;
  data?: { sid?: string };
};

/**
 * Send an approved WhatsApp template (works outside the 24h session window).
 * Returns the provider message sid when Exotel returns one.
 */
export async function sendWhatsAppNamedTemplate(
  toE164: string,
  templateName: string,
  bodyParams: TemplateParams = [],
  languageCode?: string
): Promise<string | null> {
  if (!isExotelConfigured()) {
    throw new Error("WhatsApp is not configured on the server (Exotel env missing).");
  }
  const from = process.env.EXOTEL_WHATSAPP_FROM!.trim();
  const lang =
    languageCode?.trim() ||
    process.env.EXOTEL_WHATSAPP_LANG?.trim() ||
    "en";

  const payload = {
    whatsapp: {
      messages: [
        {
          from,
          to: toE164,
          content: {
            recipient_type: "individual",
            type: "template",
            template: {
              name: templateName,
              language: { code: lang, policy: "deterministic" },
              ...(bodyParams.length > 0
                ? {
                    components: [
                      {
                        type: "body",
                        parameters: bodyParams.map((text) => ({
                          type: "text",
                          text: text.slice(0, 1024)
                        }))
                      }
                    ]
                  }
                : {})
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

  let msg0: ExotelMsg | undefined;
  if (parsed && typeof parsed === "object" && "response" in parsed) {
    const response = (parsed as { response?: { whatsapp?: { messages?: ExotelMsg[] } } }).response;
    msg0 = response?.whatsapp?.messages?.[0];
  }
  if (msg0?.status === "failure") {
    throw new Error(`Exotel WhatsApp message failure: ${JSON.stringify(msg0).slice(0, 800)}`);
  }

  const sid = msg0?.data?.sid ?? msg0?.sid ?? null;
  logger.info("whatsapp_template_sent", { to: toE164, templateName, sid });
  return sid;
}

async function sendWhatsAppTemplate(
  toE164: string,
  templateName: string,
  bodyParams: TemplateParams
): Promise<void> {
  await sendWhatsAppNamedTemplate(toE164, templateName, bodyParams);
}

function buildBodyParams(
  event: OrderEmailEvent,
  ctx: {
    name: string;
    orderNumber: string;
    total: string;
    itemsSummary: string;
    shipping: string;
    view: string;
    cancelledUrl: string;
    checkoutResume: string;
    awb: string;
    tracking: string;
  }
): TemplateParams {
  switch (event) {
    case "order_confirmed":
      return [ctx.name, ctx.orderNumber, ctx.itemsSummary, ctx.shipping, ctx.total];
    case "payment_failed":
      return [ctx.name, ctx.orderNumber, ctx.cancelledUrl];
    case "payment_reminder":
      return [ctx.name, ctx.orderNumber, ctx.total, ctx.checkoutResume];
    case "order_processing":
      return [ctx.name, ctx.orderNumber];
    case "order_shipped":
      return [ctx.name, ctx.orderNumber, ctx.awb || "pending", ctx.tracking];
    case "order_delivered":
      return [ctx.name, ctx.orderNumber];
    case "order_returned":
      return [ctx.name, ctx.orderNumber];
    case "refund_initiated":
      return [ctx.name, ctx.orderNumber, ctx.total];
    case "order_cancelled":
      return [ctx.name, ctx.orderNumber];
    default:
      return [ctx.name, ctx.orderNumber];
  }
}

/**
 * Send order WhatsApp in parallel with order emails.
 * Skips silently if Exotel is not configured or phone is missing.
 * Not used for complaints/tasks (those call sendMail directly).
 */
export async function sendOrderWhatsApp(orderId: string, event: OrderEmailEvent): Promise<void> {
  if (!isExotelConfigured()) {
    logger.info("whatsapp_skipped_not_configured", { orderId, event });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: { orderBy: { nameSnapshot: "asc" } },
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
      addresses: { where: { type: "SHIPPING" }, take: 1 }
    }
  });

  if (!order) return;

  const to = toWhatsAppE164(order.phone) || toWhatsAppE164(order.addresses[0]?.phone);
  if (!to) {
    logger.warn("whatsapp_skipped_no_phone", { orderId, event });
    return;
  }

  const templateName = TEMPLATE_BY_EVENT[event];
  const total = formatOrderTotal(order.grandTotalInPaise, order.currency);
  const shipping =
    order.shippingInPaise > 0
      ? formatOrderTotal(order.shippingInPaise, order.currency)
      : "Free";
  const view = orderViewUrl(order.orderNumber, order.email);
  const awb = order.shipments[0]?.awb?.trim() || "";
  const tracking = awb ? trackUrl(awb) : view;
  const checkoutResume = `${siteBaseUrl()}/checkout?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.email)}`;
  const name = firstNameFromOrder(order.addresses[0]?.fullName, order.email);
  const itemsSummary = formatOrderItemsForWhatsApp(order.items, order.currency);

  const bodyParams = buildBodyParams(event, {
    name,
    orderNumber: order.orderNumber,
    total,
    itemsSummary,
    shipping,
    view,
    cancelledUrl: orderCancelledUrl(order.orderNumber, order.email),
    checkoutResume,
    awb,
    tracking
  });

  try {
    await sendWhatsAppTemplate(to, templateName, bodyParams);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("whatsapp_send_failed", { orderId, event, templateName, to, error: message });
  }
}

/** Fire-and-forget; safe to call beside notifyOrderEmail. */
export function notifyOrderWhatsApp(orderId: string, event: OrderEmailEvent): void {
  void sendOrderWhatsApp(orderId, event).catch((err) => {
    logger.error("whatsapp_notify_failed", { orderId, event, err });
  });
}
