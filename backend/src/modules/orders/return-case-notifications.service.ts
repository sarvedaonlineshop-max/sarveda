/**
 * Return / refund / replacement customer notifications (MAN-007).
 *
 * Email: send now via existing shop email branding.
 * WhatsApp: prepare payloads + env-mapped template names; skip if template
 * not configured/approved — never fail the business transaction.
 *
 * Amounts for refund events MUST come from authoritative persisted refund
 * totals (case refundTotalInPaise / Refund.amountInPaise) — never order.grandTotal.
 */
import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { getRedisConnection } from "../../config/redisConnection";
import { buildShopEmail, sendMail } from "../notifications/email";
import { toWhatsAppE164 } from "../notifications/whatsapp";

export type ReturnCaseNotifyEvent =
  | "RETURN_REQUEST_SUBMITTED"
  | "RETURN_MORE_INFO_REQUIRED"
  | "RETURN_APPROVED_PHYSICAL"
  | "RETURN_APPROVED_NO_RETURN"
  | "RETURN_PARTIALLY_APPROVED"
  | "RETURN_REJECTED"
  | "RETURN_PICKUP_CREATED"
  | "RETURN_SELF_SHIP"
  | "RETURN_RECEIVED"
  | "RETURN_QC_COMPLETED"
  | "RETURN_REFUND_INITIATED"
  | "RETURN_REFUND_PROCESSED"
  | "RETURN_REPLACEMENT_APPROVED"
  | "RETURN_REPLACEMENT_SHIPPED"
  | "RETURN_CASE_CLOSED";

const CLAIM_TTL_SEC = 30 * 24 * 60 * 60;

/** Env keys → Meta template names once approved. Missing env = skip WA. */
const WA_TEMPLATE_ENV: Record<ReturnCaseNotifyEvent, string> = {
  RETURN_REQUEST_SUBMITTED: "WA_TEMPLATE_RETURN_REQUEST_RECEIVED",
  RETURN_MORE_INFO_REQUIRED: "WA_TEMPLATE_RETURN_MORE_INFO_REQUIRED",
  RETURN_APPROVED_PHYSICAL: "WA_TEMPLATE_RETURN_APPROVED",
  RETURN_APPROVED_NO_RETURN: "WA_TEMPLATE_RETURN_APPROVED",
  RETURN_PARTIALLY_APPROVED: "WA_TEMPLATE_RETURN_PARTIALLY_APPROVED",
  RETURN_REJECTED: "WA_TEMPLATE_RETURN_REJECTED",
  RETURN_PICKUP_CREATED: "WA_TEMPLATE_RETURN_PICKUP_CREATED",
  RETURN_SELF_SHIP: "WA_TEMPLATE_RETURN_PICKUP_CREATED",
  RETURN_RECEIVED: "WA_TEMPLATE_RETURN_RECEIVED",
  RETURN_QC_COMPLETED: "WA_TEMPLATE_RETURN_INSPECTION_COMPLETED",
  RETURN_REFUND_INITIATED: "WA_TEMPLATE_REFUND_INITIATED",
  RETURN_REFUND_PROCESSED: "WA_TEMPLATE_REFUND_PROCESSED",
  RETURN_REPLACEMENT_APPROVED: "WA_TEMPLATE_REPLACEMENT_APPROVED",
  RETURN_REPLACEMENT_SHIPPED: "WA_TEMPLATE_REPLACEMENT_SHIPPED",
  RETURN_CASE_CLOSED: "WA_TEMPLATE_RETURN_CASE_CLOSED"
};

/** Suggested Meta template names (handoff) — not sent unless env maps them. */
export const SUGGESTED_WA_TEMPLATE_NAMES: Record<ReturnCaseNotifyEvent, string> = {
  RETURN_REQUEST_SUBMITTED: "sarveda_return_request_received",
  RETURN_MORE_INFO_REQUIRED: "sarveda_return_more_info_required",
  RETURN_APPROVED_PHYSICAL: "sarveda_return_approved",
  RETURN_APPROVED_NO_RETURN: "sarveda_return_approved",
  RETURN_PARTIALLY_APPROVED: "sarveda_return_partially_approved",
  RETURN_REJECTED: "sarveda_return_rejected",
  RETURN_PICKUP_CREATED: "sarveda_return_pickup_created",
  RETURN_SELF_SHIP: "sarveda_return_pickup_created",
  RETURN_RECEIVED: "sarveda_return_received",
  RETURN_QC_COMPLETED: "sarveda_return_inspection_completed",
  RETURN_REFUND_INITIATED: "sarveda_refund_initiated",
  RETURN_REFUND_PROCESSED: "sarveda_refund_processed",
  RETURN_REPLACEMENT_APPROVED: "sarveda_replacement_approved",
  RETURN_REPLACEMENT_SHIPPED: "sarveda_replacement_shipped",
  RETURN_CASE_CLOSED: "sarveda_return_case_closed"
};

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

export function formatMoneyMinor(minor: number, currency = "INR"): string {
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

function customerFacingDisposition(disposition: string | null | undefined): string {
  switch (disposition) {
    case "RESTOCKABLE":
    case "SELLABLE":
      return "Item accepted for refund processing";
    case "DAMAGED_NON_RESTOCKABLE":
    case "NON_RESTOCKABLE":
    case "WRITE_OFF":
    case "QUARANTINE":
      return "Inspection completed — we will proceed with your approved resolution";
    case "NEEDS_REVIEW":
      return "Inspection in progress";
    default:
      return "Inspection has been completed";
  }
}

export type ReturnCaseNotifyPayload = {
  orderNumber: string;
  caseNumber: string | null;
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  itemSummary: string;
  quantity?: number | null;
  customerReason?: string | null;
  requestedResolution?: string | null;
  moreInfoPrompt?: string | null;
  rejectionNote?: string | null;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  pickupWindow?: string | null;
  selfShip?: boolean;
  receivedAt?: Date | null;
  /** Authoritative refund amount in paise — REQUIRED for refund events. */
  refundAmountInPaise?: number | null;
  currency?: string;
  paymentProvider?: string | null;
  providerRefundId?: string | null;
  initiatedAt?: Date | null;
  completedAt?: Date | null;
  replacementItem?: string | null;
  approvedItemSummary?: string | null;
  rejectedItemSummary?: string | null;
  physicalReturnRequired?: boolean;
  qcOutcome?: "refund" | "replacement" | "other";
  closureKind?: "refund" | "replacement" | "missing_part" | "rejection" | "other";
};

/** Pure builders — used by email + WhatsApp + tests. Never invent refund amounts. */
export function buildReturnCaseMessage(
  event: ReturnCaseNotifyEvent,
  payload: ReturnCaseNotifyPayload
): {
  subject: string;
  banner: string;
  lines: string[];
  textBody: string;
  /** Formatted refund amount when event is refund-related; null otherwise. */
  refundAmountFormatted: string | null;
  waBodyParams: string[];
} {
  const name = payload.customerName?.trim() || "Customer";
  const orderNo = payload.orderNumber;
  const caseId = payload.caseNumber?.trim() || "—";
  const profileUrl = `${siteBaseUrl()}/profile`;
  const currency = payload.currency ?? "INR";

  const refundFmt =
    payload.refundAmountInPaise != null && payload.refundAmountInPaise > 0
      ? formatMoneyMinor(payload.refundAmountInPaise, currency)
      : null;

  switch (event) {
    case "RETURN_REQUEST_SUBMITTED": {
      const lines = [
        "We have received your return/refund request.",
        `Order: ${orderNo}`,
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        payload.quantity != null ? `Quantity: ${payload.quantity}` : "",
        payload.customerReason ? `Reason: ${payload.customerReason}` : "",
        payload.requestedResolution
          ? `Requested resolution: ${payload.requestedResolution}`
          : "",
        "Current status: Awaiting review",
        "We will email you once our team has reviewed your request. This does not mean your request has been approved."
      ].filter(Boolean);
      return {
        subject: `Return request received — ${orderNo}`,
        banner: "Return request received",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_MORE_INFO_REQUIRED": {
      const lines = [
        `We need a little more information to continue processing your return for order ${orderNo}.`,
        `Return Case: ${caseId}`,
        payload.moreInfoPrompt
          ? `What we need: ${payload.moreInfoPrompt}`
          : "Please check your account for details.",
        "Processing is waiting for your response.",
        `You can reply from your orders page: ${profileUrl}`
      ];
      return {
        subject: `More information needed — ${orderNo}`,
        banner: "More information needed",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.moreInfoPrompt?.slice(0, 200) || "details"]
      };
    }
    case "RETURN_APPROVED_PHYSICAL": {
      const lines = [
        "Your return/refund request has been approved.",
        "Your refund will be processed after we receive and inspect the returned item.",
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        payload.quantity != null ? `Approved quantity: ${payload.quantity}` : "",
        "Next step: Please return the item using the shipping instructions we provide."
      ].filter(Boolean);
      return {
        subject: `Return approved — ${orderNo}`,
        banner: "Return approved",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_APPROVED_NO_RETURN": {
      const lines = [
        "Your refund request has been approved.",
        "Your refund is being processed.",
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        "No physical return is required for this request."
      ].filter(Boolean);
      return {
        subject: `Refund approved — ${orderNo}`,
        banner: "Refund approved",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_PARTIALLY_APPROVED": {
      const lines = [
        "Your return request has been reviewed.",
        "",
        payload.approvedItemSummary ? `Approved:\n${payload.approvedItemSummary}` : "Approved: —",
        "",
        payload.rejectedItemSummary
          ? `Not approved:\n${payload.rejectedItemSummary}`
          : "Not approved: —",
        "",
        `Return Case: ${caseId}`,
        payload.physicalReturnRequired
          ? "For approved items that need to be returned, please use the shipping instructions we provide. Refund follows after we receive and inspect those items."
          : "Refund for approved items will be processed according to the resolution on your case."
      ];
      return {
        subject: `Return reviewed (partial) — ${orderNo}`,
        banner: "Return request reviewed",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [
          name,
          orderNo,
          caseId,
          payload.approvedItemSummary || "approved items",
          payload.rejectedItemSummary || "not approved"
        ]
      };
    }
    case "RETURN_REJECTED": {
      const lines = [
        `We reviewed your return/refund request for order ${orderNo}.`,
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        "Unfortunately we could not approve this request at this time.",
        payload.rejectionNote ? `Note: ${payload.rejectionNote}` : "",
        "If you have questions, reply to this email or contact Sarveda support."
      ].filter(Boolean);
      return {
        subject: `Return request update — ${orderNo}`,
        banner: "Request update",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.rejectionNote?.slice(0, 200) || "see email"]
      };
    }
    case "RETURN_PICKUP_CREATED": {
      const lines = [
        `Your return pickup for order ${orderNo} has been scheduled.`,
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Items for pickup: ${payload.itemSummary}` : "",
        payload.courier ? `Courier: ${payload.courier}` : "",
        payload.awb ? `Return tracking ID (AWB): ${payload.awb}` : "",
        payload.trackingUrl ? `Track your pickup: ${payload.trackingUrl}` : "",
        payload.pickupWindow ? `Pickup window: ${payload.pickupWindow}` : "",
        "",
        "Please pack the items securely in their original packaging (or equivalent protective packing) before the courier arrives.",
        "Include all accessories and ensure the package is sealed and labeled for easy identification.",
        "Keep your phone reachable at the delivery address so the pickup executive can contact you.",
        "Your refund or replacement will be processed after we receive and inspect the returned item(s)."
      ].filter((l) => l !== undefined);
      return {
        subject: `Return pickup scheduled — ${orderNo}`,
        banner: "Return pickup scheduled",
        lines: lines.filter((l) => l !== ""),
        textBody: lines.filter(Boolean).join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [
          name,
          orderNo,
          caseId,
          payload.itemSummary || "your item",
          payload.courier || "courier",
          payload.awb || "pending",
          payload.trackingUrl || profileUrl
        ]
      };
    }
    case "RETURN_SELF_SHIP": {
      const lines = [
        `Please ship your return for case ${caseId} using a courier of your choice.`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        "Once shipped, share the courier name and tracking ID from your orders page.",
        "Your refund will be processed after we receive and inspect the item."
      ].filter(Boolean);
      return {
        subject: `Return shipping instructions — ${orderNo}`,
        banner: "Return shipping instructions",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_RECEIVED": {
      const when = payload.receivedAt
        ? payload.receivedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "today";
      const lines = [
        "We have received your returned item at our warehouse.",
        "It will now undergo inspection.",
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        `Received: ${when}`
      ].filter(Boolean);
      return {
        subject: `Return received — ${orderNo}`,
        banner: "Return received",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, caseId, payload.itemSummary || "your item", when]
      };
    }
    case "RETURN_QC_COMPLETED": {
      const outcome =
        payload.qcOutcome === "replacement"
          ? "Inspection has been completed. Your replacement will now be processed."
          : "Inspection has been completed. Your approved refund will now be processed.";
      const lines = [
        outcome,
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : ""
      ].filter(Boolean);
      return {
        subject: `Inspection completed — ${orderNo}`,
        banner: "Inspection completed",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_REFUND_INITIATED": {
      if (refundFmt == null) {
        throw new Error("RETURN_REFUND_INITIATED requires authoritative refundAmountInPaise");
      }
      const providerLabel = payload.paymentProvider
        ? `Original ${payload.paymentProvider} payment method`
        : "Original payment method";
      const lines = [
        `A refund of ${refundFmt} has been initiated for Sarveda order ${orderNo}.`,
        `Return Case: ${caseId}`,
        `Refund method: ${providerLabel}`,
        payload.providerRefundId ? `Reference: ${payload.providerRefundId}` : "",
        payload.initiatedAt
          ? `Initiated: ${payload.initiatedAt.toLocaleString("en-IN")}`
          : "",
        "The refund has been initiated successfully. It may take a few business days to reflect in your account depending on the bank/payment provider.",
        "Thank you for your patience."
      ].filter(Boolean);
      return {
        subject: `Refund of ${refundFmt} initiated — ${orderNo}`,
        banner: "Refund initiated",
        lines,
        textBody: [`Namaste ${name},`, "", ...lines].join("\n"),
        refundAmountFormatted: refundFmt,
        waBodyParams: [name, orderNo, refundFmt, caseId]
      };
    }
    case "RETURN_REFUND_PROCESSED": {
      if (refundFmt == null) {
        throw new Error("RETURN_REFUND_PROCESSED requires authoritative refundAmountInPaise");
      }
      const lines = [
        `Your refund of ${refundFmt} has been processed for order ${orderNo}.`,
        `Return Case: ${caseId}`,
        payload.providerRefundId ? `Reference: ${payload.providerRefundId}` : "",
        payload.completedAt
          ? `Processed: ${payload.completedAt.toLocaleString("en-IN")}`
          : "",
        "Depending on your bank or payment provider, it may take a few business days to appear in your account."
      ].filter(Boolean);
      return {
        subject: `Refund processed — ${orderNo}`,
        banner: "Refund processed",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: refundFmt,
        waBodyParams: [name, orderNo, refundFmt, caseId]
      };
    }
    case "RETURN_REPLACEMENT_APPROVED": {
      const lines = [
        "Your replacement request has been approved.",
        `Return Case: ${caseId}`,
        payload.itemSummary ? `Item: ${payload.itemSummary}` : "",
        payload.replacementItem ? `Replacement: ${payload.replacementItem}` : "",
        "Next step: We will prepare and ship your replacement."
      ].filter(Boolean);
      return {
        subject: `Replacement approved — ${orderNo}`,
        banner: "Replacement approved",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, caseId, payload.itemSummary || "your item"]
      };
    }
    case "RETURN_REPLACEMENT_SHIPPED": {
      const lines = [
        `Your replacement for case ${caseId} has shipped.`,
        payload.courier ? `Courier: ${payload.courier}` : "",
        payload.awb ? `Tracking ID: ${payload.awb}` : "",
        payload.trackingUrl ? `Track: ${payload.trackingUrl}` : ""
      ].filter(Boolean);
      return {
        subject: `Replacement shipped — ${orderNo}`,
        banner: "Replacement shipped",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [
          name,
          caseId,
          payload.courier || "courier",
          payload.awb || "pending",
          payload.trackingUrl || profileUrl
        ]
      };
    }
    case "RETURN_CASE_CLOSED": {
      const kind =
        payload.closureKind === "refund"
          ? "Your return case has been closed after refund processing."
          : payload.closureKind === "replacement"
            ? "Your return case has been closed after replacement delivery."
            : payload.closureKind === "rejection"
              ? "Your return case has been closed."
              : "Your return case has been closed.";
      const lines = [kind, `Return Case: ${caseId}`, `Order: ${orderNo}`];
      return {
        subject: `Return case closed — ${orderNo}`,
        banner: "Case closed",
        lines,
        textBody: lines.join("\n"),
        refundAmountFormatted: null,
        waBodyParams: [name, orderNo, caseId]
      };
    }
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unknown return notify event: ${_exhaustive}`);
    }
  }
}

async function claimNotify(
  requestId: string,
  event: ReturnCaseNotifyEvent,
  channel: "email" | "whatsapp",
  dedupeSuffix?: string
): Promise<boolean> {
  const redis = getRedisConnection();
  const key = `return-notify:${requestId}:${event}:${channel}${dedupeSuffix ? `:${dedupeSuffix}` : ""}`;
  if (!redis) {
    // No Redis → allow once per process best-effort; tests may run without Redis.
    return true;
  }
  try {
    const ok = await redis.set(key, "1", "EX", CLAIM_TTL_SEC, "NX");
    if (ok !== "OK") {
      logger.info("return_notify_skipped_dedupe", { requestId, event, channel, key });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("return_notify_dedupe_redis_failed", { requestId, event, channel, err });
    return true;
  }
}

function resolveWaTemplateName(event: ReturnCaseNotifyEvent): string | null {
  const envKey = WA_TEMPLATE_ENV[event];
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) return fromEnv;
  // Optional opt-in: use suggested Meta names (must be approved in Exotel/WhatsApp Manager).
  if (process.env.WA_RETURN_USE_SUGGESTED_TEMPLATES === "1") {
    return SUGGESTED_WA_TEMPLATE_NAMES[event]?.trim() || null;
  }
  // Do not send unapproved/hard-coded template names by default.
  return null;
}

async function tryWhatsApp(
  event: ReturnCaseNotifyEvent,
  payload: ReturnCaseNotifyPayload,
  built: ReturnType<typeof buildReturnCaseMessage>,
  requestId: string,
  dedupeSuffix?: string
): Promise<void> {
  const templateName = resolveWaTemplateName(event);
  if (!templateName) {
    logger.info("whatsapp_template_unavailable", {
      requestId,
      event,
      suggestedTemplate: SUGGESTED_WA_TEMPLATE_NAMES[event],
      envKey: WA_TEMPLATE_ENV[event]
    });
    return;
  }

  if (!(await claimNotify(requestId, event, "whatsapp", dedupeSuffix))) return;

  const to = toWhatsAppE164(payload.customerPhone);
  if (!to) {
    logger.info("whatsapp_return_skipped_no_phone", { requestId, event });
    return;
  }

  try {
    const { sendWhatsAppNamedTemplate } = await import("../notifications/whatsapp");
    await sendWhatsAppNamedTemplate(to, templateName, built.waBodyParams);
  } catch (err) {
    logger.error("whatsapp_return_send_failed", {
      requestId,
      event,
      templateName,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function sendCustomerEmail(
  event: ReturnCaseNotifyEvent,
  payload: ReturnCaseNotifyPayload,
  built: ReturnType<typeof buildReturnCaseMessage>,
  requestId: string,
  dedupeSuffix?: string
): Promise<void> {
  if (!(await claimNotify(requestId, event, "email", dedupeSuffix))) return;

  const name = payload.customerName?.trim()
    ? escapeHtml(payload.customerName.trim())
    : "";
  const caseMeta = payload.caseNumber
    ? `<strong>Order ID:</strong> ${escapeHtml(payload.orderNumber)} · <strong>Return Case:</strong> ${escapeHtml(payload.caseNumber)}`
    : `<strong>Order ID:</strong> ${escapeHtml(payload.orderNumber)}`;

  const html = buildShopEmail(
    "",
    built.lines.map((l) => escapeHtml(l)),
    {
      banner: built.banner,
      showTick: event === "RETURN_APPROVED_PHYSICAL" || event === "RETURN_APPROVED_NO_RETURN",
      greeting: name ? `Dear ${name},` : "Dear Customer,",
      intro: "Warm greetings from Sarveda.",
      meta: caseMeta,
      ctas: [{ href: `${siteBaseUrl()}/profile`, label: "View your orders" }]
    }
  );

  try {
    await sendMail(payload.customerEmail, built.subject, html, built.textBody);
    logger.info("return_case_email_sent", {
      requestId,
      event,
      orderNumber: payload.orderNumber,
      caseNumber: payload.caseNumber,
      refundAmountFormatted: built.refundAmountFormatted
    });
  } catch (err) {
    logger.error("return_case_email_failed", {
      requestId,
      event,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Fire customer email (+ optional WhatsApp). Never throws to callers.
 * For refund events, refundAmountInPaise must be the authoritative amount.
 */
export async function notifyReturnCaseEvent(
  requestId: string,
  event: ReturnCaseNotifyEvent,
  payload: ReturnCaseNotifyPayload,
  opts?: { dedupeSuffix?: string }
): Promise<{ emailAttempted: boolean; whatsappSkippedReason?: string }> {
  try {
    if (
      (event === "RETURN_REFUND_INITIATED" || event === "RETURN_REFUND_PROCESSED") &&
      (payload.refundAmountInPaise == null || payload.refundAmountInPaise <= 0)
    ) {
      logger.error("return_notify_missing_refund_amount", { requestId, event });
      return { emailAttempted: false, whatsappSkippedReason: "missing_refund_amount" };
    }

    const built = buildReturnCaseMessage(event, payload);
    await sendCustomerEmail(event, payload, built, requestId, opts?.dedupeSuffix);
    await tryWhatsApp(event, payload, built, requestId, opts?.dedupeSuffix);

    const waTemplate = resolveWaTemplateName(event);
    return {
      emailAttempted: true,
      whatsappSkippedReason: waTemplate ? undefined : "template_unavailable"
    };
  } catch (err) {
    logger.error("return_case_notify_failed", {
      requestId,
      event,
      error: err instanceof Error ? err.message : String(err)
    });
    return { emailAttempted: false };
  }
}

/** Load case + order context for notifications. */
export async function loadReturnCaseNotifyContext(requestId: string): Promise<{
  requestId: string;
  payloadBase: ReturnCaseNotifyPayload;
  hasReplacement: boolean;
  hasRefundResolution: boolean;
} | null> {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: {
      items: true,
      returnShipment: true,
      order: {
        select: {
          currency: true,
          phone: true,
          grandTotalInPaise: true,
          payments: { where: { status: "CAPTURED" }, take: 1, orderBy: { createdAt: "desc" } }
        }
      }
    }
  });
  if (!request) return null;

  const itemSummary = request.items
    .map((i) => `${i.nameSnapshot} × ${i.qtySelected}`)
    .join("; ");
  const qty = request.items.reduce((s, i) => s + i.qtySelected, 0);
  const reason = request.items.map((i) => i.reasonLabel).filter(Boolean).join("; ") || request.reasonLabel;
  const resolution = request.items
    .map((i) => i.requestedResolution)
    .filter(Boolean)
    .join("; ");

  return {
    requestId: request.id,
    hasReplacement: request.items.some((i) => i.requestedResolution === "REPLACEMENT"),
    hasRefundResolution: request.items.some(
      (i) =>
        i.requestedResolution === "RETURN_FOR_REFUND" ||
        i.requestedResolution === "PARTIAL_REFUND" ||
        i.requestedResolution === "KEEP_ITEM_PARTIAL_REFUND"
    ),
    payloadBase: {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      customerName: null,
      customerPhone: request.order.phone,
      itemSummary,
      quantity: qty,
      customerReason: reason,
      requestedResolution: resolution,
      currency: request.order.currency,
      paymentProvider: request.order.payments[0]?.provider ?? null,
      courier: request.returnShipment?.courier ?? null,
      awb: request.returnShipment?.awb ?? null,
      trackingUrl: request.returnShipment?.trackingUrl ?? null,
      receivedAt: request.returnShipment?.receivedAt ?? null,
      // Explicitly do NOT expose grandTotal as refund amount.
      refundAmountInPaise: null
    }
  };
}

/** Helper used by tests — prove partial refund never substitutes order total. */
export function resolveAuthoritativeRefundNotifyAmount(opts: {
  refundAmountInPaise: number;
  orderGrandTotalInPaise: number;
}): number {
  // Callers must pass the persisted refund amount. Never substitute grand total.
  if (opts.refundAmountInPaise <= 0) {
    throw new Error("Authoritative refund amount must be positive");
  }
  return opts.refundAmountInPaise;
}

export { customerFacingDisposition };
