import { logger } from "../../config/logger";
import { sendMail } from "../notifications/email";
import { ADMIN_CARE_EMAIL } from "./order-service-request.constants";

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda-demo.xyz";
  return raw.replace(/\/$/, "");
}

function emailShell(title: string, body: string): string {
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c352a">
    <div style="background:#1c352a;padding:20px 24px;border-radius:12px 12px 0 0">
      <p style="margin:0;font-size:18px;color:#f5f0e8">Sarveda</p>
    </div>
    <div style="background:#faf7f2;padding:24px;border:1px solid #e3d9c8;border-top:0;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#1c352a">${title}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280">Questions? Reply to this email or write to ${ADMIN_CARE_EMAIL}</p>
    </div>
  </div>`;
}

/** Best-effort — never blocks the main request if SMTP is down. */
export async function notifyServiceRequestSubmitted(opts: {
  orderNumber: string;
  customerEmail: string;
  customerName?: string | null;
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY";
  reasonLabel: string;
  message?: string | null;
}): Promise<void> {
  const kind = opts.type === "CANCEL_BEFORE_DELIVERY" ? "Cancellation" : "Return / refund";
  const subject = `${kind} request received — ${opts.orderNumber}`;
  const profileUrl = `${siteBaseUrl()}/profile`;
  const adminUrl = `${siteBaseUrl()}/admin/orders`;

  const detail = `
    <p style="font-size:14px;line-height:1.6">Hi${opts.customerName ? ` ${opts.customerName}` : ""},</p>
    <p style="font-size:14px;line-height:1.6">We received your <strong>${kind.toLowerCase()}</strong> request for order <strong>${opts.orderNumber}</strong>.</p>
    <p style="font-size:14px;line-height:1.6"><strong>Reason:</strong> ${opts.reasonLabel}</p>
    ${opts.message?.trim() ? `<p style="font-size:14px;line-height:1.6"><strong>Message:</strong> ${opts.message.trim()}</p>` : ""}
    <p style="font-size:14px;line-height:1.6;color:#633806;background:#faeeda;padding:12px;border-radius:8px">Your refund or cancellation is waiting for approval. We will email you once our team reviews it.</p>
    <p style="margin-top:16px"><a href="${profileUrl}" style="display:inline-block;background:#1c352a;color:#f5f0e8;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px">View your orders</a></p>
  `;

  const adminBody = `
    <p style="font-size:14px;line-height:1.6">New <strong>${kind}</strong> request on order <strong>${opts.orderNumber}</strong>.</p>
    <p style="font-size:14px;line-height:1.6">Customer: ${opts.customerEmail}</p>
    <p style="font-size:14px;line-height:1.6"><strong>Reason:</strong> ${opts.reasonLabel}</p>
    ${opts.message?.trim() ? `<p style="font-size:14px;line-height:1.6"><strong>Message:</strong> ${opts.message.trim()}</p>` : ""}
    <p style="margin-top:16px"><a href="${adminUrl}" style="display:inline-block;background:#1c352a;color:#f5f0e8;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px">Open admin orders</a></p>
  `;

  for (const [to, html] of [
    [opts.customerEmail, emailShell(`${kind} request received`, detail)],
    [ADMIN_CARE_EMAIL, emailShell(`[Admin] ${kind} request — ${opts.orderNumber}`, adminBody)]
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
  type: "CANCEL_BEFORE_DELIVERY" | "REFUND_AFTER_DELIVERY";
  approved: boolean;
  adminNote?: string | null;
}): Promise<void> {
  const kind = opts.type === "CANCEL_BEFORE_DELIVERY" ? "Cancellation" : "Return / refund";
  const subject = opts.approved
    ? `${kind} approved — ${opts.orderNumber}`
    : `${kind} request update — ${opts.orderNumber}`;

  const body = opts.approved
    ? `<p style="font-size:14px;line-height:1.6">Good news — your <strong>${kind.toLowerCase()}</strong> request for order <strong>${opts.orderNumber}</strong> has been <strong style="color:#085041">approved</strong>.</p>`
    : `<p style="font-size:14px;line-height:1.6">Your <strong>${kind.toLowerCase()}</strong> request for order <strong>${opts.orderNumber}</strong> was reviewed. Unfortunately we could not approve it at this time.</p>`;

  const note = opts.adminNote?.trim()
    ? `<p style="font-size:14px;line-height:1.6"><strong>Note from Sarveda:</strong> ${opts.adminNote.trim()}</p>`
    : "";

  const customerHtml = emailShell(
    opts.approved ? `${kind} approved` : `${kind} request update`,
    `${body}${note}<p style="margin-top:16px"><a href="${siteBaseUrl()}/profile" style="display:inline-block;background:#1c352a;color:#f5f0e8;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px">View your orders</a></p>`
  );

  const adminHtml = emailShell(
    `[Admin] ${kind} ${opts.approved ? "approved" : "rejected"} — ${opts.orderNumber}`,
    `<p style="font-size:14px;line-height:1.6">You ${opts.approved ? "approved" : "rejected"} the ${kind.toLowerCase()} request for ${opts.orderNumber} (${opts.customerEmail}).</p>${note}`
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
