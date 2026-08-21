import nodemailer from "nodemailer";

import { prisma } from "../../config/db";
import { isEmailSmtpConfigured, resolveEmailSmtpConfig } from "../../config/email";
import { enqueueEmail } from "../../jobs/emailQueue";
import { logger } from "../../config/logger";
import {
  resolveCustomerWhatsApp,
  resolveSupportContactEmail
} from "../../utils/customerContact";
import { gstRatePercent } from "../../utils/gst";

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

/** Sarveda shop email shell — company first, gold status, greeting, details, gratitude. */
const BRAND = {
  green: "#1e3a2f",
  mustard: "#f5d88a",
  gold: "#c9a227",
  tickGreen: "#16a34a",
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

/** Official spiral mark + wordmark (same assets as website header). */
function emailLogoMarkUrl(): string {
  const override = process.env.EMAIL_LOGO_URL?.trim();
  if (override) return override;
  return `${siteBaseUrl()}/brand/sarveda-logo-with-name.png`;
}

function emailWordmarkUrl(): string {
  const override = process.env.EMAIL_WORDMARK_URL?.trim();
  if (override) return override;
  // Combined lockup already includes the wordmark — reuse for older templates.
  return `${siteBaseUrl()}/brand/sarveda-logo-with-name.png`;
}

function supportContactConfig(): {
  email: string;
  address: string;
  displayPhone: string;
  waLink: string;
} {
  const email = resolveSupportContactEmail();
  const address = process.env.SELLER_ADDRESS?.trim() || "";
  const wa = resolveCustomerWhatsApp();
  return {
    email,
    address,
    displayPhone: wa?.displayPhone || "",
    waLink: wa?.waLink || ""
  };
}

function greenTickHtml(): string {
  // Solid green disc + white check — readable in major email clients
  return `<span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#15803d;text-align:center;line-height:24px;margin-right:10px;vertical-align:middle;box-shadow:0 1px 3px rgba(21,128,61,0.35)"><span style="color:#ffffff;font-size:15px;font-weight:800;line-height:24px">✓</span></span>`;
}

/** Helps stop Gmail from collapsing body content behind “…” / quoted text. */
function gmailOpenSpacer(): string {
  const noise = Array.from({ length: 40 }, (_, i) => `&#8204;${i % 3 === 0 ? "&nbsp;" : ""}`).join("");
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff">${noise}</div>
<div style="white-space:nowrap;font:15px/0 monospace;color:#ffffff;max-height:0;overflow:hidden;opacity:0">${noise}</div>`;
}

export function shopEmailHtml(opts: {
  /** Gold bar status text (green tick added unless showTick is false). */
  banner: string;
  showTick?: boolean;
  /** e.g. Dear Priya, */
  greeting?: string;
  /** Short professional intro under greeting. */
  intro?: string;
  title?: string;
  meta?: string;
  bodyHtml: string;
  ctas?: EmailCta[];
}): string {
  const mark = emailLogoMarkUrl();
  const home = siteBaseUrl();
  const contact = supportContactConfig();
  const ctas = (opts.ctas ?? [])
    .map((cta) => {
      if (cta.primary === false) {
        return `<a href="${cta.href}" style="display:inline-block;margin:8px 12px 0 0;padding:12px 20px;border-radius:8px;border:1px solid ${BRAND.green};color:${BRAND.green};text-decoration:none;font-weight:700;font-size:14px">${cta.label}</a>`;
      }
      return `<a href="${cta.href}" style="display:inline-block;margin:8px 12px 0 0;padding:12px 24px;border-radius:8px;background:${BRAND.green};color:${BRAND.mustard};text-decoration:none;font-weight:700;font-size:14px">${cta.label} →</a>`;
    })
    .join("");

  const bannerInner = `${opts.showTick === false ? "" : greenTickHtml()}<span style="vertical-align:middle;color:#ffffff">${opts.banner}</span>`;

  const addressLine = contact.address
    ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(contact.address)}</p>`
    : "";
  const emailLine = `<p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">Email: <a href="mailto:${escapeHtml(contact.email)}" style="color:${BRAND.green};text-decoration:none;font-weight:600">${escapeHtml(contact.email)}</a></p>`;
  const phoneLine = contact.displayPhone
    ? `<p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">Mobile / WhatsApp: <a href="${contact.waLink || "#"}" style="color:${BRAND.green};text-decoration:none;font-weight:600">${escapeHtml(contact.displayPhone)}</a></p>`
    : "";

  const greetingBlock = opts.greeting
    ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${BRAND.text}">${opts.greeting}</p>`
    : "";
  const introBlock = opts.intro
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.text}">${opts.intro}</p>`
    : "";
  const titleBlock = opts.title
    ? `<h1 style="margin:0 0 10px;font-size:20px;line-height:1.35;color:${BRAND.text}">${opts.title}</h1>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:24px;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${gmailOpenSpacer()}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px">
  <tr>
    <td style="padding:20px 20px 14px;background:#ffffff">
      <a href="${home}" style="text-decoration:none">
        <img src="${mark}" alt="Sarveda" width="180" height="64" style="display:inline-block;vertical-align:middle;height:48px;width:auto;border:0;outline:none" />
      </a>
      ${addressLine}
      ${emailLine}
      ${phoneLine}
    </td>
  </tr>
  <tr>
    <td style="background:${BRAND.gold};padding:14px 20px">
      <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.2px;color:#ffffff">${bannerInner}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 20px 8px">
      ${greetingBlock}
      ${introBlock}
      ${titleBlock}
      ${opts.meta ? `<p style="margin:0 0 14px;font-size:14px;color:${BRAND.muted}">${opts.meta}</p>` : ""}
      ${opts.bodyHtml}
      ${ctas ? `<div style="margin-top:18px">${ctas}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:8px 20px 22px">
      <p style="margin:0;font-size:14px;line-height:1.55;color:${BRAND.text}">With gratitude,<br/><strong style="color:${BRAND.green}">Team Sarveda</strong></p>
      ${
        contact.waLink
          ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">Need help? <a href="${contact.waLink}" style="color:${BRAND.green};font-weight:600">Chat with us on WhatsApp</a> or email <a href="mailto:${escapeHtml(contact.email)}" style="color:${BRAND.green}">${escapeHtml(contact.email)}</a>.</p>`
          : `<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">Need help? Email us at <a href="mailto:${escapeHtml(contact.email)}" style="color:${BRAND.green}">${escapeHtml(contact.email)}</a>.</p>`
      }
    </td>
  </tr>
</table>
</body></html>`;
}

/** Plain paragraphs inside the shop email shell. */
export function buildShopEmail(
  title: string,
  lines: string[],
  opts?: {
    banner?: string;
    showTick?: boolean;
    greeting?: string;
    intro?: string;
    meta?: string;
    ctas?: EmailCta[];
  }
): string {
  const body = lines
    .filter(Boolean)
    .map(
      (l) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${BRAND.text}">${l}</p>`
    )
    .join("");
  return shopEmailHtml({
    banner: opts?.banner ?? "Sarveda",
    showTick: opts?.showTick,
    greeting: opts?.greeting,
    intro: opts?.intro,
    title,
    meta: opts?.meta,
    bodyHtml: body,
    ctas: opts?.ctas
  });
}

/** @deprecated Use buildShopEmail */
function buildHtml(
  title: string,
  lines: string[],
  opts?: {
    banner?: string;
    showTick?: boolean;
    greeting?: string;
    intro?: string;
    meta?: string;
    ctas?: EmailCta[];
  }
): string {
  return buildShopEmail(title, lines, opts);
}

function moneyRow(label: string, amount: string, strong = false): string {
  const weight = strong ? "700" : "500";
  const color = strong ? BRAND.text : BRAND.muted;
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:${color};font-weight:${weight}">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:${color};font-weight:${weight};text-align:right">${amount}</td>
  </tr>`;
}

function isIndiaOrder(order: {
  currency: string;
  addresses: Array<{ type: string; country: string }>;
}): boolean {
  if (order.currency.toUpperCase() === "INR") return true;
  const ship = order.addresses.find((a) => a.type === "SHIPPING") || order.addresses[0];
  return (ship?.country || "").toUpperCase() === "IN";
}

function buildOrderConfirmedBody(order: {
  orderNumber: string;
  currency: string;
  subtotalInPaise: number;
  discountInPaise: number;
  shippingInPaise: number;
  taxInPaise: number;
  grandTotalInPaise: number;
  addresses: Array<{ type: string; country: string }>;
  items: Array<{
    nameSnapshot: string;
    qtyOrdered: number;
    unitPriceInPaise: number;
    lineTotalInPaise: number;
    variant?: { productRel?: { taxClass?: string | null } | null } | null;
  }>;
}): string {
  const fmt = (n: number) => formatOrderTotal(n, order.currency);
  const showGst = isIndiaOrder(order);
  const itemRows = order.items
    .map((item) => {
      const name = escapeHtml(item.nameSnapshot);
      const rate = gstRatePercent(item.variant?.productRel?.taxClass);
      const gstNote =
        showGst && rate > 0
          ? `<br/><span style="color:${BRAND.muted};font-size:12px">Inclusive of ${rate}% GST</span>`
          : showGst && rate === 0
            ? `<br/><span style="color:${BRAND.muted};font-size:12px">GST: Nil</span>`
            : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};vertical-align:top">
          <strong>${name}</strong><br/>
          <span style="color:${BRAND.muted};font-size:12px">Qty ${item.qtyOrdered} · ${fmt(item.unitPriceInPaise)} each</span>${gstNote}
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
    moneyRow("Total", fmt(order.grandTotalInPaise), true)
  ]
    .filter(Boolean)
    .join("");

  return `
    <div style="background:#faf8f5;border:1px solid ${BRAND.border};border-radius:10px;padding:4px 14px;margin:0 0 14px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
        ${itemRows}
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:8px">
        ${splitRows}
      </table>
    </div>
    <p style="margin:0;padding:12px 14px;background:#fff8e8;border:1px solid #ead9a0;border-radius:8px;font-size:13px;line-height:1.5;color:${BRAND.text}">
      📦 Your tracking ID will be shared as soon as we ship your order.
    </p>`;
}

async function loadOrderEmailContext(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: {
      items: {
        include: {
          variant: {
            include: {
              productRel: { select: { taxClass: true } }
            }
          }
        }
      },
      addresses: true,
      shipments: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

function customerFirstName(order: {
  email: string;
  addresses: Array<{ type: string; fullName: string }>;
}): string {
  const ship = order.addresses.find((a) => a.type === "SHIPPING") || order.addresses[0];
  const fromName = ship?.fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return order.email.split("@")[0] || "there";
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
  const firstName = escapeHtml(customerFirstName(order));
  const greeting = `Dear ${firstName},`;
  const warmIntro = `Warm greetings from Sarveda.`;
  const orderIdMeta = `<strong>Order ID:</strong> ${escapeHtml(order.orderNumber)}`;
  const metaWithTotal = `${orderIdMeta} · ${total}`;

  const subject = `${EVENT_SUBJECTS[event]} — ${order.orderNumber}`;
  let html = "";
  let text = "";

  switch (event) {
    case "order_confirmed": {
      html = shopEmailHtml({
        banner: "Your order is confirmed",
        greeting,
        intro: `${warmIntro} Your order has been confirmed. Please review the details below.`,
        meta: orderIdMeta,
        bodyHtml: buildOrderConfirmedBody(order),
        ctas: [
          { href: inv, label: "Download Invoice", primary: true },
          { href: view, label: "View order", primary: false }
        ]
      });
      text = [
        `Dear ${customerFirstName(order)},`,
        `Warm greetings from Sarveda. Your order has been confirmed.`,
        `Order ID: ${order.orderNumber}`,
        ...order.items.map((i) => {
          const rate = gstRatePercent(i.variant?.productRel?.taxClass);
          const gst =
            isIndiaOrder(order) && rate > 0
              ? ` (inclusive of ${rate}% GST)`
              : isIndiaOrder(order)
                ? " (GST: Nil)"
                : "";
          return `${i.nameSnapshot} × ${i.qtyOrdered} — ${formatOrderTotal(i.lineTotalInPaise, order.currency)}${gst}`;
        }),
        `Total: ${total}`,
        "Your tracking ID will be shared as soon as we ship your order.",
        `Invoice: ${inv}`,
        `View order: ${view}`
      ].join("\n");
      break;
    }
    case "payment_failed":
      html = buildHtml(
        "",
        [
          `We were unable to complete payment for order <strong>${escapeHtml(order.orderNumber)}</strong>.`,
          "This order has been cancelled.",
          "If any amount was deducted, it will be refunded within 5–10 business days, depending on your bank or payment provider.",
          "You may place a new order with the same items whenever you are ready."
        ],
        {
          banner: "Payment could not be completed",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [
            {
              href: orderCancelledUrl(order.orderNumber, order.email),
              label: "Reorder or view details"
            }
          ]
        }
      );
      text = `Dear ${customerFirstName(order)}, payment failed for ${order.orderNumber}. Order cancelled. If any amount was deducted, it will be refunded within 5–10 business days.`;
      break;
    case "payment_reminder":
      html = buildHtml(
        "",
        [
          `Your order <strong>${escapeHtml(order.orderNumber)}</strong> (${total}) is still awaiting payment.`,
          "Please complete checkout shortly while your items remain reserved."
        ],
        {
          banner: "⏰ Payment pending",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: metaWithTotal,
          ctas: [{ href: checkoutResume, label: "Pay now" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, complete payment for ${order.orderNumber}: ${checkoutResume}`;
      break;
    case "order_processing":
      html = buildHtml(
        "",
        [
          `We have started preparing your order <strong>${escapeHtml(order.orderNumber)}</strong>.`,
          "Your tracking ID will be shared as soon as we ship your order."
        ],
        {
          banner: "Preparing your order",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, order ${order.orderNumber} is being prepared.`;
      break;
    case "order_shipped":
      html = buildHtml(
        "",
        [
          `Good news — your order <strong>${escapeHtml(order.orderNumber)}</strong> is on its way.`,
          awb
            ? `📦 Tracking ID (AWB): <strong style="font-size:16px;letter-spacing:0.5px">${escapeHtml(awb)}</strong>`
            : "Your shipment has been handed over to the courier.",
          "You can follow your package using the button below."
        ].filter(Boolean),
        {
          banner: "📦 Your order has shipped",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [
            { href: tracking, label: "Track shipment" },
            { href: view, label: "View order", primary: false }
          ]
        }
      );
      text = `Dear ${customerFirstName(order)}, order ${order.orderNumber} shipped.${awb ? ` AWB: ${awb}.` : ""} Track: ${tracking}`;
      break;
    case "order_delivered":
      html = buildHtml(
        "",
        [
          `Your order <strong>${escapeHtml(order.orderNumber)}</strong> has been delivered.`,
          "We hope you enjoy your purchase. Thank you for choosing Sarveda."
        ],
        {
          banner: "Your order was delivered",
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, order ${order.orderNumber} delivered.`;
      break;
    case "order_returned":
      html = buildHtml(
        "",
        [
          `Your order <strong>${escapeHtml(order.orderNumber)}</strong> was returned to us by the courier (RTO).`,
          "Please contact us so we can arrange re-delivery or a refund.",
          "We apologise for the inconvenience."
        ],
        {
          banner: "Returned to origin",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, order ${order.orderNumber} returned (RTO).`;
      break;
    case "refund_initiated":
      html = buildHtml(
        "",
        [
          `A refund has been initiated for order <strong>${escapeHtml(order.orderNumber)}</strong> (${total}).`,
          "It may take 5–10 business days to appear, depending on your bank or card issuer."
        ],
        {
          banner: "Refund initiated",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, refund initiated for ${order.orderNumber} (${total}).`;
      break;
    case "order_cancelled":
      html = buildHtml(
        "",
        [
          `Order <strong>${escapeHtml(order.orderNumber)}</strong> has been cancelled.`,
          "If any amount was deducted, it will be refunded within 5–10 business days, depending on your bank or payment provider."
        ],
        {
          banner: "Order cancelled",
          showTick: false,
          greeting,
          intro: warmIntro,
          meta: orderIdMeta,
          ctas: [{ href: view, label: "View order" }]
        }
      );
      text = `Dear ${customerFirstName(order)}, order ${order.orderNumber} cancelled. If any amount was deducted, it will be refunded within 5–10 business days.`;
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
  const greeting = user.name ? `Dear ${escapeHtml(user.name)},` : "Dear Customer,";
  const lines = [
    `You left items in your Sarveda cart: <strong>${escapeHtml(names)}</strong>${cart.items.length > 3 ? " and more" : ""}.`,
    "Your cart is saved. You can continue whenever you are ready."
  ];
  const subject = "You left something in your cart — Sarveda";
  const html = buildHtml("", lines, {
    banner: "🛒 Your cart is waiting",
    showTick: false,
    greeting,
    intro: "Warm greetings from Sarveda.",
    ctas: [{ href: `${siteBaseUrl()}/cart`, label: "View cart" }]
  });
  const text = [
    greeting.replace(/<[^>]+>/g, ""),
    `You left items in your cart: ${names}`,
    `${siteBaseUrl()}/cart`
  ].join("\n\n");

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
    "Welcome to Sarveda — yoga, Ayurveda, and sound healing from India.",
    "Your account is ready. Browse the shop and save your favourites whenever you like."
  ];
  const html = buildHtml("", lines, {
    banner: "Welcome to Sarveda",
    greeting: `Dear ${safeName},`,
    intro: "Warm greetings from Sarveda.",
    ctas: [{ href: shopUrl, label: "Visit Sarveda shop" }]
  });
  const text = [
    `Dear ${name},`,
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
