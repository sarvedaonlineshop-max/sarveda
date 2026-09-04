import { logger } from "../../config/logger";
import { buildShopEmail, sendMail } from "../notifications/email";
import { ADMIN_CARE_EMAIL } from "./order-service-request.constants";

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda-demo.xyz";
  return raw.replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serviceRequestKindLabel(
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY" | "ADJUST_BEFORE_DELIVERY"
): string {
  if (type === "CANCEL_BEFORE_DELIVERY") return "Cancellation";
  if (type === "ADJUST_BEFORE_DELIVERY") return "Order change";
  return "Return / refund";
}

/** Best-effort — never blocks the main request if SMTP is down. */
export async function notifyServiceRequestSubmitted(opts: {
  orderNumber: string;
  customerEmail: string;
  customerName?: string | null;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY" | "ADJUST_BEFORE_DELIVERY";
  reasonLabel: string;
  message?: string | null;
}): Promise<void> {
  const kind = serviceRequestKindLabel(opts.type);
  const subject = `${kind} request received — ${opts.orderNumber}`;
  const profileUrl = `${siteBaseUrl()}/profile`;
  const adminUrl = `${siteBaseUrl()}/admin/orders`;
  const name = opts.customerName?.trim() ? escapeHtml(opts.customerName.trim()) : "";
  const reason = escapeHtml(opts.reasonLabel);
  const message = opts.message?.trim() ? escapeHtml(opts.message.trim()) : "";

  const customerHtml = buildShopEmail(
    "",
    [
      `We received your <strong>${kind.toLowerCase()}</strong> request for order <strong>${escapeHtml(opts.orderNumber)}</strong>.`,
      `<strong>Reason:</strong> ${reason}`,
      message ? `<strong>Message:</strong> ${message}` : "",
      "Your request is awaiting approval. We will email you once our team has reviewed it."
    ].filter(Boolean),
    {
      banner: `${kind} request received`,
      showTick: false,
      greeting: name ? `Dear ${name},` : "Dear Customer,",
      intro: "Warm greetings from Sarveda.",
      meta: `<strong>Order ID:</strong> ${escapeHtml(opts.orderNumber)}`,
      ctas: [{ href: profileUrl, label: "View your orders" }]
    }
  );

  const adminHtml = buildShopEmail(
    "",
    [
      `New <strong>${kind}</strong> request on order <strong>${escapeHtml(opts.orderNumber)}</strong>.`,
      `Customer: ${escapeHtml(opts.customerEmail)}`,
      `<strong>Reason:</strong> ${reason}`,
      message ? `<strong>Message:</strong> ${message}` : ""
    ].filter(Boolean),
    {
      banner: "Admin alert",
      showTick: false,
      greeting: "Dear Team,",
      intro: "A customer service request needs your attention.",
      meta: `<strong>Order ID:</strong> ${escapeHtml(opts.orderNumber)}`,
      ctas: [{ href: adminUrl, label: "Open admin orders" }]
    }
  );

  for (const [to, html] of [
    [opts.customerEmail, customerHtml],
    [ADMIN_CARE_EMAIL, adminHtml]
  ] as const) {
    try {
      await sendMail(to, subject, html);
    } catch (err) {
      logger.error("service_request_email_failed", {
        to,
        orderNumber: opts.orderNumber,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

export async function notifyServiceRequestReviewed(opts: {
  orderNumber: string;
  customerEmail: string;
  customerName?: string | null;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY" | "ADJUST_BEFORE_DELIVERY";
  approved: boolean;
  adminNote?: string | null;
  /** When approving a physical-return case, customer copy mentions receive + inspect first. */
  physicalReturnRequired?: boolean;
}): Promise<void> {
  const kind = serviceRequestKindLabel(opts.type);
  const decision = opts.approved ? "approved" : "declined";
  const subject = opts.approved
    ? `${kind} approved — ${opts.orderNumber}`
    : `${kind} request update — ${opts.orderNumber}`;
  const profileUrl = `${siteBaseUrl()}/profile`;
  const name = opts.customerName?.trim() ? escapeHtml(opts.customerName.trim()) : "";
  const note = opts.adminNote?.trim() ? escapeHtml(opts.adminNote.trim()) : "";
  const orderNo = escapeHtml(opts.orderNumber);

  let approvalBody: string;
  if (!opts.approved) {
    approvalBody = `Your <strong>${kind.toLowerCase()}</strong> request for order <strong>${orderNo}</strong> was reviewed. Unfortunately we could not approve it at this time.`;
  } else if (opts.type === "REFUND_AFTER_DELIVERY" && opts.physicalReturnRequired) {
    approvalBody =
      `Your return/refund request for order <strong>${orderNo}</strong> has been <strong>approved</strong>. ` +
      `Your refund will be processed after we receive and inspect the returned item.`;
  } else if (opts.type === "REFUND_AFTER_DELIVERY") {
    approvalBody =
      `Your return/refund request for order <strong>${orderNo}</strong> has been <strong>approved</strong>. ` +
      `Your refund is being processed.`;
  } else {
    approvalBody = `Good news — your <strong>${kind.toLowerCase()}</strong> request for order <strong>${orderNo}</strong> has been <strong>approved</strong>.`;
  }

  const customerHtml = buildShopEmail(
    "",
    [
      approvalBody,
      note ? `<strong>Note from Sarveda:</strong> ${note}` : "",
      opts.approved
        ? opts.type === "REFUND_AFTER_DELIVERY" && opts.physicalReturnRequired
          ? "Once inspection is complete, any refund will follow your payment provider's timeline."
          : "If a refund applies, it will follow your payment provider's timeline."
        : "If you have questions, please reply to this email or contact us on WhatsApp."
    ].filter(Boolean),
    {
      banner: opts.approved ? "Request approved" : "Request update",
      showTick: opts.approved,
      greeting: name ? `Dear ${name},` : "Dear Customer,",
      intro: "Warm greetings from Sarveda.",
      meta: `<strong>Order ID:</strong> ${orderNo}`,
      ctas: [{ href: profileUrl, label: "View your orders" }]
    }
  );

  const adminHtml = buildShopEmail(
    "",
    [
      `You ${decision} the ${kind.toLowerCase()} request for <strong>${orderNo}</strong> (${escapeHtml(opts.customerEmail)}).`,
      note ? `<strong>Note:</strong> ${note}` : ""
    ].filter(Boolean),
    {
      banner: "Admin alert",
      showTick: false,
      greeting: "Dear Team,",
      intro: "A service request decision was recorded.",
      meta: `<strong>Order ID:</strong> ${orderNo}`
    }
  );

  for (const [to, html] of [
    [opts.customerEmail, customerHtml],
    [ADMIN_CARE_EMAIL, adminHtml]
  ] as const) {
    try {
      await sendMail(to, subject, html);
    } catch (err) {
      logger.error("service_request_review_email_failed", {
        to,
        orderNumber: opts.orderNumber,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
