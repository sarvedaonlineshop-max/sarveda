import sgMail from "@sendgrid/mail";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

if (process.env.NODE_ENV === "production" && !process.env.SENDGRID_API_KEY) {
  console.error(
    "[EMAIL_CONFIG_MISSING] SENDGRID_API_KEY not set in production. " +
      "No order emails will be sent. Set this env var immediately."
  );
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
  order_cancelled: "Your Sarveda order was cancelled"
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
      shipments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

type SendGridMailPayload = Parameters<typeof sgMail.send>[0];

function sendGridErrorStatus(err: unknown): number {
  const response = (err as { response?: { status?: number } })?.response;
  return response?.status ?? 0;
}

async function sendMailWithRetry(
  payload: SendGridMailPayload,
  context: { orderId?: string; event?: OrderEmailEvent; maxAttempts?: number }
): Promise<void> {
  const maxAttempts = context.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sgMail.send(payload);
      return;
    } catch (err: unknown) {
      const status = sendGridErrorStatus(err);
      const isTransient = status >= 500 || status === 0;
      if (!isTransient || attempt === maxAttempts) {
        logger.error("order_email_failed_final", {
          orderId: context.orderId,
          event: context.event,
          attempt,
          status,
          err
        });
        return;
      }
      logger.warn("order_email_retry", {
        orderId: context.orderId,
        event: context.event,
        attempt,
        status
      });
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
  replyToEmail?: string
): Promise<void> {
  const key = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || "hello@sarveda.com";
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "Sarveda";
  const reply =
    replyToEmail?.trim() || process.env.SENDGRID_REPLY_TO?.trim() || fromEmail;
  if (!key) {
    logger.warn("email_skipped_no_sendgrid", { to: to.replace(/@.*/, "@***") });
    return;
  }
  sgMail.setApiKey(key);
  await sgMail.send({
    to,
    from: { email: fromEmail, name: fromName },
    replyTo: { email: reply, name: fromName },
    subject,
    html,
    text,
    categories: ["sarveda-transactional"],
    mailSettings: {
      bypassListManagement: { enable: true },
      footer: { enable: false }
    },
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false }
    }
  });
}

export async function sendOrderEmail(orderId: string, event: OrderEmailEvent): Promise<void> {
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
        `GST invoice: <a href="${invoiceUrl(order.orderNumber, order.email)}">Download invoice</a>`
      ];
      break;
    case "payment_failed":
      lines = [
        `We could not complete payment for order <strong>${order.orderNumber}</strong>.`,
        `Your cart is still saved. Retry checkout:`,
        `<a href="${checkoutResume}">Continue checkout</a>`
      ];
      break;
    case "payment_reminder":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> (${total}) is waiting for payment.`,
        `Complete checkout within a few minutes while stock is reserved:`,
        `<a href="${checkoutResume}">Pay now</a>`
      ];
      break;
    case "order_processing":
      lines = [
        `We have started preparing order <strong>${order.orderNumber}</strong>.`,
        `You will receive tracking details when your package ships.`
      ];
      break;
    case "order_shipped":
      lines = [
        `Good news — order <strong>${order.orderNumber}</strong> is on its way.`,
        awb ? `Tracking (AWB): <strong>${awb}</strong>` : "",
        `Track shipment: <a href="${tracking}">${tracking}</a>`
      ].filter(Boolean);
      break;
    case "order_delivered":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> has been delivered.`,
        `We hope you love your purchase.`
      ];
      break;
    case "order_returned":
      lines = [
        `Your order <strong>${order.orderNumber}</strong> was returned to us by the courier (RTO).`,
        `Please contact <a href="mailto:support@sarveda.com">support@sarveda.com</a> to arrange re-delivery or a refund.`,
        `We are sorry for the inconvenience.`
      ];
      break;
    case "refund_initiated":
      lines = [
        `A refund has been initiated for order <strong>${order.orderNumber}</strong> (${total}).`,
        `It may take 5–10 business days to reflect depending on your bank or card issuer.`
      ];
      break;
    case "order_cancelled":
      lines = [
        `Order <strong>${order.orderNumber}</strong> has been cancelled.`,
        `If you were charged, any refund will follow your payment provider's timeline.`
      ];
      break;
  }

  const subject = `${EVENT_SUBJECTS[event]} — ${order.orderNumber}`;
  const html = buildHtml(EVENT_SUBJECTS[event], lines);
  const text = lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n");

  const key = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || "hello@sarveda.com";
  const fromName = process.env.SENDGRID_FROM_NAME?.trim() || "Sarveda";
  const reply = process.env.SENDGRID_REPLY_TO?.trim() || fromEmail;

  if (!key) {
    logger.warn("email_skipped_no_sendgrid", { orderId, event, to: order.email.replace(/@.*/, "@***") });
    return;
  }
  sgMail.setApiKey(key);

  try {
    await sendMailWithRetry(
      {
        to: order.email,
        from: { email: fromEmail, name: fromName },
        replyTo: { email: reply, name: fromName },
        subject,
        html,
        text,
        categories: ["sarveda-transactional"],
        mailSettings: {
          bypassListManagement: { enable: true },
          footer: { enable: false }
        },
        trackingSettings: {
          clickTracking: { enable: false, enableText: false },
          openTracking: { enable: false }
        }
      },
      { orderId, event }
    );
    logger.info("order_email_sent", { orderId, event, to: order.email.replace(/@.*/, "@***") });
  } catch (err) {
    logger.error("order_email_failed", { orderId, event, err });
  }
}

/** Logged-in shopper left items in cart (2h+). Returns true if email was sent. */
export async function sendAbandonedCartEmail(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true }
  });
  if (!user?.email) return false;

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        take: 3,
        include: {
          variant: { include: { productRel: { select: { name: true } } } }
        }
      }
    }
  });
  if (!cart?.items.length) return false;

  const names = cart.items.map((i) => i.variant.productRel.name).join(", ");
  const lines = [
    user.name ? `Hi ${user.name},` : "Hi there,",
    `You left items in your Sarveda cart: <strong>${names}</strong>${cart.items.length > 3 ? " and more" : ""}.`,
    `Your cart is saved. Continue when you are ready:`,
    `<a href="${siteBaseUrl()}/cart">View cart</a>`
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

export function notifyOrderEmail(orderId: string, event: OrderEmailEvent): void {
  void sendOrderEmail(orderId, event).catch((err) => {
    logger.error("order_email_async_failed", { orderId, event, err });
  });
}
