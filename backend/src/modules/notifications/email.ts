import nodemailer from "nodemailer";

import { prisma } from "../../config/db";
import { enqueueEmail } from "../../jobs/emailQueue";
import { logger } from "../../config/logger";

if (
  process.env.NODE_ENV === "production" &&
  !process.env.AWS_SES_SMTP_HOST?.trim()
) {
  console.error(
    "[EMAIL_CONFIG_MISSING] AWS SES SMTP not configured in production. " +
      "Set AWS_SES_SMTP_HOST, AWS_SES_SMTP_USER, AWS_SES_SMTP_PASS. " +
      "No transactional emails will be sent."
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = process.env.AWS_SES_SMTP_HOST;
  const port = Number(process.env.AWS_SES_SMTP_PORT ?? 587);
  const user = process.env.AWS_SES_SMTP_USER;
  const pass = process.env.AWS_SES_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "AWS SES SMTP not configured. " +
        "Set AWS_SES_SMTP_HOST, AWS_SES_SMTP_USER, " +
        "AWS_SES_SMTP_PASS in .env"
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
  });

  logger.info("ses_smtp_transporter_created", { host, port });
  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text?: string,
  replyToEmail?: string
): Promise<void> {
  const from =
    process.env.AWS_SES_FROM_EMAIL?.trim() ?? "noreply@sarveda-demo.xyz";
  const replyTo =
    replyToEmail?.trim() || process.env.AWS_SES_REPLY_TO?.trim();

  logger.info("send_mail_attempt", { to, subject });

  try {
    const info = await getTransporter().sendMail({
      from: `"Sarveda" <${from}>`,
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ""),
      ...(replyTo ? { replyTo } : {}),
    });

    logger.info("send_mail_success", {
      to,
      subject,
      messageId: info.messageId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("send_mail_failed", { to, subject, error: message });
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
  return `${siteBaseUrl()}/order/confirmed?orderNumber=${encodeURIComponent(orderNumber)}&${q.toString()}`;
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

function buildHtml(title: string, lines: string[]): string {
  const body = lines
    .map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#44403c;">${l}</p>`)
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#fafaf9;padding:24px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e7e5e4;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1c1917;">${title}</h1>
${body}
<p style="margin:24px 0 0;font-size:13px;color:#78716c;">With warmth,<br/>Team Sarveda</p>
</div></body></html>`;
}

async function loadOrderEmailContext(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: true,
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
  const awb = order.shipments[0]?.awb;
  const tracking = awb ? trackUrl(awb) : view;
  const checkoutResume = `${siteBaseUrl()}/checkout?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.email)}`;

  let lines: string[] = [];
  switch (event) {
    case "order_confirmed":
      lines = [
        `Thank you for your order <strong>${order.orderNumber}</strong>.`,
        `Total: <strong>${total}</strong>.`,
        `We are preparing your items. View your order:`,
        `<a href="${view}">${view}</a>`,
        `GST invoice: <a href="${invoiceUrl(order.orderNumber, order.email)}">Download invoice</a>`,
      ];
      break;
    case "payment_failed":
      lines = [
        `We could not complete payment for order <strong>${order.orderNumber}</strong>.`,
        `This order has been cancelled and reserved stock has been released.`,
        `You can place a fresh order with the same items:`,
        `<a href="${orderCancelledUrl(order.orderNumber, order.email)}">Reorder or view details</a>`,
      ];
      break;
    case "payment_reminder":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> (${total}) is waiting for payment.`,
        `Complete checkout within a few minutes while stock is reserved:`,
        `<a href="${checkoutResume}">Pay now</a>`,
      ];
      break;
    case "order_processing":
      lines = [
        `We have started preparing order <strong>${order.orderNumber}</strong>.`,
        `You will receive tracking details when your package ships.`,
      ];
      break;
    case "order_shipped":
      lines = [
        `Good news — order <strong>${order.orderNumber}</strong> is on its way.`,
        awb ? `Tracking (AWB): <strong>${awb}</strong>` : "",
        `Track shipment: <a href="${tracking}">${tracking}</a>`,
      ].filter(Boolean);
      break;
    case "order_delivered":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> has been delivered.`,
        `We hope you love your purchase.`,
      ];
      break;
    case "order_returned":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> was returned to us by the courier (RTO).`,
        `Please contact <a href="mailto:support@sarveda.com">support@sarveda.com</a> to arrange re-delivery or a refund.`,
        `We are sorry for the inconvenience.`,
      ];
      break;
    case "refund_initiated":
      lines = [
        `A refund has been initiated for order <strong>${order.orderNumber}</strong> (${total}).`,
        `It may take 5–10 business days to reflect depending on your bank or card issuer.`,
      ];
      break;
    case "order_cancelled":
      lines = [
        `Order <strong>${order.orderNumber}</strong> has been cancelled.`,
        `If you were charged, any refund will follow your payment provider's timeline.`,
      ];
      break;
  }

  const subject = `${EVENT_SUBJECTS[event]} — ${order.orderNumber}`;
  const html = buildHtml(EVENT_SUBJECTS[event], lines);
  const text = lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n");

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
    user.name ? `Hi ${user.name},` : "Hi there,",
    `You left items in your Sarveda cart: <strong>${names}</strong>${cart.items.length > 3 ? " and more" : ""}.`,
    `Your cart is saved. Continue when you are ready:`,
    `<a href="${siteBaseUrl()}/cart">View cart</a>`,
  ];
  const subject = "You left something in your cart — Sarveda";
  const html = buildHtml("Your cart is waiting", lines);
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
  const lines = [
    `Hi ${name},`,
    "Welcome to Sarveda — yoga, Ayurveda, and sound healing from India.",
    `Your account is ready. Browse the shop and save your favourites:`,
    `<a href="${shopUrl}">Visit Sarveda shop</a>`,
  ];
  const html = buildHtml("Welcome to Sarveda", lines);
  const text = [
    `Hi ${name},`,
    "Welcome to Sarveda — your account is ready.",
    `Shop: ${shopUrl}`,
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
