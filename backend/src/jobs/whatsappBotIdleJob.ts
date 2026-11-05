import { randomBytes } from "crypto";
import { Worker, type Job } from "bullmq";

import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";

export const WHATSAPP_BOT_IDLE_QUEUE = "whatsapp-bot-idle";
/** Unused menu buttons stay tappable for 30 days, then Redis drops the token. */
export const WHATSAPP_BOT_OPTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "wa:bot:option:";
let worker: Worker | null = null;

/**
 * Create a one-use option token. It is embedded in every interactive id for
 * that message and stays valid until the customer taps a button.
 */
export async function issueWhatsAppBotOptionToken(
  threadId: string,
  _phone: string
): Promise<string> {
  const token = `${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`;
  const connection = getRedisConnection();

  if (!connection) {
    logger.warn("whatsapp_bot_option_ttl_degraded", {
      threadId,
      reason: "REDIS_URL not set"
    });
    return token;
  }

  await connection.set(
    `${KEY_PREFIX}${token}`,
    threadId,
    "PX",
    WHATSAPP_BOT_OPTION_TTL_MS
  );
  return token;
}

/**
 * Atomically consume a menu token. False means it expired, was already used,
 * belongs to another conversation, or predates tokenized menus.
 */
export async function consumeWhatsAppBotOptionToken(
  threadId: string,
  token: string
): Promise<boolean> {
  const connection = getRedisConnection();
  if (!connection) {
    // Development fallback: enforce age, but one-use semantics need Redis.
    const timestamp = Number.parseInt(token.split(".")[0] ?? "", 36);
    return Number.isFinite(timestamp) && Date.now() - timestamp <= WHATSAPP_BOT_OPTION_TTL_MS;
  }

  const result = await connection.eval(
    `local value = redis.call("GET", KEYS[1])
     if value == ARGV[1] then
       redis.call("DEL", KEYS[1])
       return 1
     end
     return 0`,
    1,
    `${KEY_PREFIX}${token}`,
    threadId
  );
  return result === 1;
}

async function processIdle(job: Job<{ threadId: string; phone: string; token: string }>): Promise<void> {
  // Older jobs still sit in Redis from the five-minute expiry. Do not consume
  // the token and do not message the customer. A button works until it is tapped.
  logger.info("whatsapp_bot_menu_expiry_skipped", {
    jobId: job.id,
    threadId: job.data.threadId
  });
}

export function startWhatsAppBotIdleWorker(): void {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn("whatsapp_bot_idle_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (worker) return;

  worker = new Worker(WHATSAPP_BOT_IDLE_QUEUE, (job) => processIdle(job), {
    connection,
    concurrency: 5
  });
  worker.on("failed", (job, err) => {
    logger.error("whatsapp_bot_idle_job_failed", { jobId: job?.id, err });
  });
  logger.info("whatsapp_bot_idle_worker_started");
}
