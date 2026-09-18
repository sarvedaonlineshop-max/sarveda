import { z } from "zod";

import { logger } from "../../config/logger";

/** Shared anti-bot fields accepted on every public enquiry create body. */
export const enquiryAntiSpamFieldsSchema = z.object({
  /** Honeypot — must be empty. Real forms never fill this. */
  website: z.string().max(200).optional().default(""),
  /** Client clock when the form mounted (ms). Used for min-submit timing. */
  formOpenedAt: z.number().int().positive().optional(),
  turnstileToken: z.string().max(2048).optional()
});

export type EnquiryAntiSpamFields = z.infer<typeof enquiryAntiSpamFieldsSchema>;

export function antiSpamHttpError(message: string, code: string, statusCode = 400): Error & {
  statusCode: number;
  code: string;
  userMessage: string;
} {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    userMessage: message
  });
}

/**
 * Verify Cloudflare Turnstile when TURNSTILE_SECRET_KEY is configured.
 * If the secret is unset (local/dev), verification is skipped so forms still work.
 */
export async function verifyTurnstileToken(token: string | undefined, remoteIp?: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("turnstile_secret_missing_in_production");
    }
    return;
  }
  const trimmed = token?.trim();
  if (!trimmed) {
    throw antiSpamHttpError(
      "Please complete the security check and try again.",
      "TURNSTILE_REQUIRED"
    );
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", trimmed);
  if (remoteIp) body.set("remoteip", remoteIp);

  let data: { success?: boolean; "error-codes"?: string[] } = {};
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    data = (await res.json()) as typeof data;
  } catch (err) {
    logger.error("turnstile_verify_network_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    throw antiSpamHttpError(
      "Security check failed. Please refresh and try again.",
      "TURNSTILE_UNAVAILABLE",
      503
    );
  }

  if (!data.success) {
    logger.warn("turnstile_verify_failed", { codes: data["error-codes"] ?? [] });
    throw antiSpamHttpError(
      "Security check failed. Please refresh and try again.",
      "TURNSTILE_FAILED"
    );
  }
}

const URL_RE = /https?:\/\/|www\./gi;

/** Cheap content heuristics — reject obvious spam, never hard-drop on one link. */
export function assertEnquiryMessageLooksHuman(message: string): void {
  const text = message.trim();
  const urls = text.match(URL_RE)?.length ?? 0;
  if (urls >= 5) {
    throw antiSpamHttpError(
      "Please shorten your message and try again without many links.",
      "MESSAGE_REJECTED"
    );
  }
  const lower = text.toLowerCase();
  const spamHints = [
    "seo backlink",
    "buy followers",
    "crypto airdrop",
    "casino bonus",
    "male enhancement",
    "onlyfans",
    "telegram @",
    "whatsapp group invite"
  ];
  if (spamHints.some((h) => lower.includes(h))) {
    throw antiSpamHttpError("Unable to submit this message.", "MESSAGE_REJECTED");
  }
}

/**
 * Honeypot + timing (+ Turnstile when configured).
 * Genuine users: invisible honeypot, ~2s+ before submit, one Turnstile click when keys exist.
 */
export async function assertEnquiryAntiSpam(
  fields: EnquiryAntiSpamFields,
  opts?: { remoteIp?: string; requireTiming?: boolean }
): Promise<void> {
  if (fields.website?.trim()) {
    logger.info("enquiry_honeypot_tripped", { ip: opts?.remoteIp });
    throw antiSpamHttpError("Unable to submit right now.", "BOT_DETECTED");
  }

  const openedAt = fields.formOpenedAt;
  if (openedAt != null) {
    const elapsed = Date.now() - openedAt;
    if (elapsed < 2000) {
      throw antiSpamHttpError("Please take a moment and try again.", "SUBMIT_TOO_FAST");
    }
    // Clock skew / stale tab — allow up to 48h
    if (elapsed > 48 * 60 * 60 * 1000) {
      throw antiSpamHttpError("This form expired. Please refresh the page.", "FORM_EXPIRED");
    }
  } else if (opts?.requireTiming ?? process.env.NODE_ENV === "production") {
    // Soft: old clients may omit this during rollout; rate limits + honeypot still apply.
    logger.info("enquiry_missing_form_opened_at", { ip: opts?.remoteIp });
  }

  await verifyTurnstileToken(fields.turnstileToken, opts?.remoteIp);
}
