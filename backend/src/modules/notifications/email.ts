import sgMail from "@sendgrid/mail";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { formatINR } from "../../utils/money";

export type OrderEmailEvent =
  | "order_confirmed"
  | "payment_failed"
  | "order_shipped"
  | "order_delivered"
  | "refund_initiated"
  | "order_cancelled";

const EVENT_SUBJECTS: Record<OrderEmailEvent, string> = {
  order_confirmed: "Your Sarveda order is confirmed",
  payment_failed: "Payment could not be completed — Sarveda",
  order_shipped: "Your Sarveda order has shipped",
  order_delivered: "Your Sarveda order was delivered",
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
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#44403c;">${l}</p>`).join("");
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

export async function sendOrderEmail(orderId: string, event: OrderEmailEvent): Promise<void> {
  const key = process.env.SENDGRID_API_KEY?.trim();
  const from = process.env.SENDGRID_FROM_EMAIL?.trim() || "hello@sarveda.com";
  if (!key) {
    logger.warn("order_email_skipped_no_sendgrid", { orderId, event });
    return;
  }

  const order = await loadOrderEmailContext(orderId);
  if (!order?.email) return;

  const total = formatINR(order.grandTotalInPaise);
  const view = orderViewUrl(order.orderNumber, order.email);
  const awb = order.shipments[0]?.awb;
  const tracking = awb ? trackUrl(awb) : view;

  let lines: string[] = [];
  switch (event) {
    case "order_confirmed":
      lines = [
        `Thank you for your order <strong>${order.orderNumber}</strong>.`,
        `Total: <strong>${total}</strong>.`,
        `We are preparing your items. You can view your order anytime:`,
        `<a href="${view}">${view}</a>`,
        `GST invoice: <a href="${invoiceUrl(order.orderNumber, order.email)}">Download invoice</a>`
      ];
      break;
    case "payment_failed":
      lines = [
        `We could not complete payment for order <strong>${order.orderNumber}</strong>.`,
        `Your cart is still saved. Retry checkout:`,
        `<a href="${siteBaseUrl()}/checkout?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(order.email)}">Continue checkout</a>`
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
        `We hope you love your purchase. Share your experience when you have a moment.`
      ];
      break;
    case "refund_initiated":
      lines = [
        `A refund has been initiated for order <strong>${order.orderNumber}</strong> (${total}).`,
        `It may take 5–10 business days to reflect in your account depending on your bank.`
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

  try {
    sgMail.setApiKey(key);
    await sgMail.send({
      to: order.email,
      from,
      subject,
      html,
      text: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n\n")
    });
    logger.info("order_email_sent", { orderId, event, to: order.email.replace(/@.*/, "@***") });
  } catch (err) {
    logger.error("order_email_failed", { orderId, event, err });
  }
}

/** Fire-and-forget — never block checkout/webhooks on email. */
export function notifyOrderEmail(orderId: string, event: OrderEmailEvent): void {
  void sendOrderEmail(orderId, event).catch((err) => {
    logger.error("order_email_async_failed", { orderId, event, err });
  });
}
