import nodemailer from "nodemailer";

import { prisma } from "../../config/db";
import { isEmailSmtpConfigured, resolveEmailSmtpConfig } from "../../config/email";
import { enqueueEmail } from "../../jobs/emailQueue";
import { logger } from "../../config/logger";

if (process.env.NODE_ENV === "production" && !isEmailSmtpConfigured()) {
  console.error(
    "[EMAIL_CONFIG_MISSING] Transactional email SMTP not configured in production. " +
      "Set Zoho ZeptoMail (ZEPTOMAIL_SMTP_PASS, ZEPTOMAIL_FROM_EMAIL) " +
      "or Amazon SES (AWS_SES_SMTP_HOST/USER/PASS/FROM_EMAIL). " +
      "No transactional emails will be sent."
  );
}

let transporter: nodemailer.Transporter | null = null;
let transporterProvider: string | null = null;

function getTransporter(): nodemailer.Transporter {
  const config = resolveEmailSmtpConfig();
  if (!config) {
    throw new Error(
      "Email SMTP not configured. Set ZEPTOMAIL_SMTP_PASS + ZEPTOMAIL_FROM_EMAIL " +
        "(preferred) or AWS_SES_SMTP_* credentials."
    );
  }

  if (transporter && transporterProvider === config.provider) return transporter;

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    pool: true,
    maxConnections: 5
  });
  transporterProvider = config.provider;

  logger.info("email_smtp_transporter_created", {
    provider: config.provider,
    host: config.host,
    port: config.port,
    from: config.fromEmail
  });
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  replyToEmail?: string
): Promise<void> {
  const config = resolveEmailSmtpConfig();
  if (!config) {
    throw new Error("Email SMTP not configured");
  }

  const from = config.fromEmail;
  const replyTo = replyToEmail?.trim() || config.replyTo;

  logger.info("send_mail_attempt", { to, subject, provider: config.provider });

  try {
    const info = await getTransporter().sendMail({
      from: `"Sarveda" <${from}>`,
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ""),
      ...(replyTo ? { replyTo } : {})
    });

    logger.info("send_mail_success", {
      to,
      subject,
      provider: config.provider,
      messageId: info.messageId
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("send_mail_failed", { to, subject, provider: config.provider, error: message });
    throw err;
  }
}

export async function sendMailWithRetry(
  to: string,
  subject: string,
  html: string,
  text?: string,
  retries = 3
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await sendMail(to, subject, html, text);
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("send_mail_retry", {
        to,
        attempt: i + 1,
        error: message,
      });
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

export type OrderEmailEvent =
  | "order_confirmed"
  | "payment_failed"
  | "payment_reminder"
  | "order_processing"
  | "order_shipped"
  | "order_delivered"
  | "order_returned"
  | "refund_initiated"
  | "order_cancelled";

const EVENT_SUBJECTS: Record<OrderEmailEvent, string> = {
  order_confirmed: "Your Sarveda order is confirmed",
  payment_failed: "Payment could not be completed — Sarveda",
  payment_reminder: "Complete your Sarveda order",
  order_processing: "Your Sarveda order is being prepared",
  order_shipped: "Your Sarveda order has shipped",
  order_delivered: "Your Sarveda order was delivered",
  order_returned: "Your Sarveda order was returned to us",
  refund_initiated: "Refund update for your Sarveda order",
  order_cancelled: "Your Sarveda order was cancelled",
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

function invoiceUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({ email: email.trim().toLowerCase() });
  return `${siteBaseUrl()}/api/orders/public/${encodeURIComponent(orderNumber)}/invoice?${q.toString()}`;
}

function trackUrl(awb: string): string {
  return `${siteBaseUrl()}/track/${encodeURIComponent(awb)}`;
}

/** Sarveda shop email shell — same brand language as Tasks (green + mustard). */
const BRAND = {
  green: "#1e3a2f",
  mustard: "#f5d88a",
  gold: "#c9a227",
  border: "#e0d8ce",
  text: "#2c2420",
  muted: "#6b5e54",
  bg: "#f7f3ee"
} as const;

type EmailCta = { href: string; label: string; primary?: boolean };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shopEmailHtml(opts: {
  banner: string;
  title: string;
  meta?: string;
  bodyHtml: string;
  ctas?: EmailCta[];
}): string {
  const ctas = (opts.ctas ?? [])
    .map((cta) => {
      if (cta.primary === false) {
        return `<a href="${cta.href}" style="display:inline-block;margin:8px 12px 0 0;padding:12px 20px;border-radius:8px;border:1px solid ${BRAND.green};color:${BRAND.green};text-decoration:none;font-weight:700;font-size:14px">${cta.label}</a>`;
      }
      return `<a href="${cta.href}" style="display:inline-block;margin:8px 12px 0 0;padding:12px 24px;border-radius:8px;background:${BRAND.green};color:${BRAND.mustard};text-decoration:none;font-weight:700;font-size:14px">${cta.label} →</a>`;
    })
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden">
  <div style="background:${BRAND.gold};padding:14px 20px">
    <p style="margin:0;color:#fff;font-size:14px;font-weight:700;letter-spacing:0.2px">${opts.banner}</p>
  </div>
  <div style="padding:22px 20px 24px">
    <h1 style="margin:0 0 8px;font-size:20px;line-height:1.35;color:${BRAND.text}">${opts.title}</h1>
    ${opts.meta ? `<p style="margin:0 0 14px;font-size:13px;color:${BRAND.muted}">${opts.meta}</p>` : ""}
    ${opts.bodyHtml}
    ${ctas ? `<div style="margin-top:18px">${ctas}</div>` : ""}
    <p style="margin:22px 0 0;font-size:13px;color:${BRAND.muted}">With warmth,<br/><strong style="color:${BRAND.green}">Team Sarveda</strong></p>
  </div>
</div>
</body></html>`;
}

/** Plain paragraphs inside the shop email shell (legacy-style content). */
function buildHtml(title: string, lines: string[], opts?: {
  banner?: string;
  meta?: string;
  ctas?: EmailCta[];
}): string {
  const body = lines
    .filter(Boolean)
    .map(
      (l) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${BRAND.text}">${l}</p>`
    )
    .join("");
  return shopEmailHtml({
    banner: opts?.banner ?? "Sarveda",
    title,
    meta: opts?.meta,
    bodyHtml: body,
    ctas: opts?.ctas
  });
}

function moneyRow(label: string, amount: string, strong = false): string {
  const weight = strong ? "700" : "500";
  const color = strong ? BRAND.text : BRAND.muted;
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:${color};font-weight:${weight}">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:${color};font-weight:${weight};text-align:right">${amount}</td>
  </tr>`;
}

function buildOrderConfirmedBody(order: {
  orderNumber: string;
  currency: string;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
  items: Array<{
    nameSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
  }>;
}): string {
  const fmt = (n: number) => formatOrderTotal(n, order.currency);
  const itemRows = order.items
    .map((item) => {
      const name = escapeHtml(item.nameSnapshot);
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};vertical-align:top">
          <strong>${name}</strong><br/>
          <span style="color:${BRAND.muted};font-size:12px">Qty ${item.qtyOrdered} · ${fmt(item.unitPriceInPaise)} each</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};text-align:right;vertical-align:top;white-space:nowrap">${fmt(item.lineTotalInPaise)}</td>
      </tr>`;
    })
    .join("");

  const splitRows = [
    moneyRow("Subtotal", fmt(order.subtotalInPaise)),
    order.discountInPaise > 0
      ? moneyRow("Discount", `−${fmt(order.discountInPaise)}`)
      : "",
    moneyRow("Shipping", order.shippingInPaise > 0 ? fmt(order.shippingInPaise) : "Free"),
    order.taxInPaise > 0 ? moneyRow("Tax", fmt(order.taxInPaise)) : "",
    moneyRow("Total", fmt(order.grandTotalInPaise), true)
  ]
    .filter(Boolean)
    .join("");

  return `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.text}">
      Thank you for your order. Here is a summary of what you purchased.
    </p>
    <div style="background:#faf8f5;border:1px solid ${BRAND.border};border-radius:10px;padding:4px 14px;margin:0 0 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${itemRows}
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px">
        ${splitRows}
      </table>
    </div>
    <p style="margin:0;padding:12px 14px;background:#fff8e8;border:1px solid #ead9a0;border-radius:8px;font-size:13px;line-height:1.5;color:${BRAND.text}">
      📦 Tracking ID will be shared as soon as we ship your order.
    </p>`;
}

async function loadOrderEmailContext(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: true,
      addresses: true,
      shipments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function sendOrderEmail(
  orderId: string,
  event: OrderEmailEvent
): Promise<void> {
  const order = await loadOrderEmailContext(orderId);
  if (!order?.email) return;

  const total = formatOrderTotal(order.grandTotalInPaise, order.currency);
  const view = orderViewUrl(order.orderNumber, order.email);
  const inv = invoiceUrl(order.orderNumber, order.email);
  const awb = order.shipments[0]?.awb;
  const tracking = awb ? trackUrl(awb) : view;
  const checkoutResume = `${siteBaseUrl()}/checkout?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.email)}`;
  const meta = `Order ${order.orderNumber} · ${total}`;

  const subject = `${EVENT_SUBJECTS[event]} — ${order.orderNumber}`;
  let html = "";
  let text = "";

  switch (event) {
    case "order_confirmed": {
      html = shopEmailHtml({
        banner: "✓ Order confirmed",
        title: "Thank you for your purchase",
        meta,
        bodyHtml: buildOrderConfirmedBody(order),
        ctas: [
          { href: inv, label: "Download Invoice", primary: true },
          { href: view, label: "View order", primary: false }
        ]
      });
      text = [
        `Order ${order.orderNumber} confirmed. Total ${total}.`,
        ...order.items.map(
          (i) =>
            `${i.nameSnapshot} × ${i.qtyOrdered} — ${formatOrderTotal(i.lineTotalInPaise, order.currency)}`
        ),
        "Tracking ID will be shared as soon as we ship your order.",
        `Invoice: ${inv}`,
        `View order: ${view}`
      ].join("\n");
      break;
    }
    case "payment_failed":
      html = buildHtml(
        "Payment could not be completed",
        [
          `We could not complete payment for order <strong>${order.orderNumber}</strong>.`,
          "This order has been cancelled and reserved stock has been released.",
          "You can place a fresh order with the same items."
        ],
        {
          banner: "Payment failed",
          meta,
          ctas: [
            {
              href: orderCancelledUrl(order.orderNumber, order.email),
              label: "Reorder or view details"
            }
          ]
        }
      );
      text = `Payment failed for ${order.orderNumber}. Order cancelled. Reorder: ${orderCancelledUrl(order.orderNumber, order.email)}`;
      break;
    case "payment_reminder":
      html = buildHtml(
        "Complete your Sarveda order",
        [
          `Your order <strong>${order.orderNumber}</strong> (${total}) is waiting for payment.`,
          "Complete checkout within a few minutes while stock is reserved."
        ],
        {
          banner: "⏰ Payment pending",
          meta,
          ctas: [{ href: checkoutResume, label: "Pay now" }]
        }
      );
      text = `Complete payment for ${order.orderNumber}: ${checkoutResume}`;
      break;
    case "order_processing":
      html = buildHtml(
        "Your order is being prepared",
        [
          `We have started preparing order <strong>${order.orderNumber}</strong>.`,
          "Tracking ID will be shared as soon as we ship your order."
        ],
        {
          banner: "Preparing your order",
          meta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Order ${order.orderNumber} is being prepared. Tracking will follow when shipped.`;
      break;
    case "order_shipped":
      html = buildHtml(
        "Your order has shipped",
        [
          `Good news — order <strong>${order.orderNumber}</strong> is on its way.`,
          awb ? `Tracking ID (AWB): <strong>${awb}</strong>` : "Your shipment is with the courier."
        ].filter(Boolean),
        {
          banner: "📦 Order shipped",
          meta,
          ctas: [
            { href: tracking, label: "Track shipment" },
            { href: view, label: "View order", primary: false }
          ]
        }
      );
      text = `Order ${order.orderNumber} shipped.${awb ? ` AWB: ${awb}.` : ""} Track: ${tracking}`;
      break;
    case "order_delivered":
      html = buildHtml(
        "Your order was delivered",
        [
          `Your order <strong>${order.orderNumber}</strong> has been delivered.`,
          "We hope you love your purchase."
        ],
        {
          banner: "✓ Delivered",
          meta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Order ${order.orderNumber} delivered. View: ${view}`;
      break;
    case "order_returned":
      html = buildHtml(
        "Your order was returned to us",
        [
          `Your order <strong>${order.orderNumber}</strong> was returned to us by the courier (RTO).`,
          `Please contact <a href="mailto:care@sarveda.com" style="color:${BRAND.green}">care@sarveda.com</a> to arrange re-delivery or a refund.`,
          "We are sorry for the inconvenience."
        ],
        {
          banner: "Returned to origin",
          meta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Order ${order.orderNumber} returned (RTO). Contact care@sarveda.com.`;
      break;
    case "refund_initiated":
      html = buildHtml(
        "Refund update for your order",
        [
          `A refund has been initiated for order <strong>${order.orderNumber}</strong> (${total}).`,
          "It may take 5–10 business days to reflect depending on your bank or card issuer."
        ],
        {
          banner: "Refund initiated",
          meta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Refund initiated for ${order.orderNumber} (${total}).`;
      break;
    case "order_cancelled":
      html = buildHtml(
        "Your order was cancelled",
        [
          `Order <strong>${order.orderNumber}</strong> has been cancelled.`,
          "If you were charged, any refund will follow your payment provider's timeline."
        ],
        {
          banner: "Order cancelled",
          meta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Order ${order.orderNumber} cancelled.`;
      break;
  }

  try {
    await sendMailWithRetry(order.email, subject, html, text);
    logger.info("order_email_sent", {
      orderId,
      event,
      to: order.email.replace(/@.*/, "@***"),
    });
  } catch (err) {
    logger.error("order_email_failed", { orderId, event, err });
  }
}

/** Logged-in shopper left items in cart (2h+). Returns true if email was sent. */
export async function sendAbandonedCartEmail(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user?.email) return false;

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        take: 3,
        include: {
          variant: { include: { productRel: { select: { name: true } } } },
        },
      },
    },
  });
  if (!cart?.items.length) return false;

  const names = cart.items.map((i) => i.variant.productRel.name).join(", ");
  const lines = [
    user.name ? `Hi ${escapeHtml(user.name)},` : "Hi there,",
    `You left items in your Sarveda cart: <strong>${escapeHtml(names)}</strong>${cart.items.length > 3 ? " and more" : ""}.`,
    "Your cart is saved. Continue when you are ready."
  ];
  const subject = "You left something in your cart — Sarveda";
  const html = buildHtml("Your cart is waiting", lines, {
    banner: "🛒 Cart reminder",
    ctas: [{ href: `${siteBaseUrl()}/cart`, label: "View cart" }]
  });
  const text = lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n");

  try {
    await sendMail(user.email, subject, html, text);
    logger.info("abandoned_cart_email_sent", { userId });
    return true;
  } catch (err) {
    logger.error("abandoned_cart_email_failed", { userId, err });
    return false;
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const shopUrl = `${siteBaseUrl()}/shop`;
  const safeName = escapeHtml(name);
  const lines = [
    `Hi ${safeName},`,
    "Welcome to Sarveda — yoga, Ayurveda, and sound healing from India.",
    "Your account is ready. Browse the shop and save your favourites."
  ];
  const html = buildHtml("Welcome to Sarveda", lines, {
    banner: "Welcome",
    ctas: [{ href: shopUrl, label: "Visit Sarveda shop" }]
  });
  const text = [
    `Hi ${name},`,
    "Welcome to Sarveda — your account is ready.",
    `Shop: ${shopUrl}`
  ].join("\n\n");
  await sendMail(email, "Welcome to Sarveda — your account is ready", html, text);
}

export function notifyOrderEmail(orderId: string, event: OrderEmailEvent): void {
  void enqueueEmail(
    { type: "order_email", orderId, event },
    `order-email:${orderId}:${event}`
  ).catch((err) => {
    logger.error("email_enqueue_failed", { orderId, event, err });
  });

  // Same shopper events as email → WhatsApp (Exotel). Complaints/tasks use sendMail only.
  void import("./whatsapp")
    .then(({ notifyOrderWhatsApp }) => {
      notifyOrderWhatsApp(orderId, event);
    })
    .catch((err) => {
      logger.error("whatsapp_import_failed", { orderId, event, err });
    });
}
