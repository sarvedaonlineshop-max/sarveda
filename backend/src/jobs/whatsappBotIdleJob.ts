import { randomBytes } from "crypto";
import { Queue, Worker, type Job } from "bullmq";

import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";

export const WHATSAPP_BOT_IDLE_QUEUE = "whatsapp-bot-idle";
export const WHATSAPP_BOT_OPTION_TTL_MS = 5 * 60 * 1000;

const KEY_PREFIX = "wa:bot:option:";
let queue: Queue | null = null;
let worker: Worker | null = null;

function getQueue(): Queue | null {
  const connection = getRedisConnection();
  if (!connection) return null;
  if (!queue) queue = new Queue(WHATSAPP_BOT_IDLE_QUEUE, { connection });
  return queue;
}

/**
 * Create a one-use option token and schedule the inactivity response.
 * The token is embedded in every interactive id for that message.
 */
export async function issueWhatsAppBotOptionToken(
  threadId: string,
  phone: string
): Promise<string> {
  const token = `${Date.now().toString(36)}.${randomBytes(4).toString("hex")}`;
  const connection = getRedisConnection();
  const q = getQueue();

  if (!connection || !q) {
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
    WHATSAPP_BOT_OPTION_TTL_MS + 60_000
  );
  await q.add(
    "expire-menu",
    { threadId, phone, token },
    {
      delay: WHATSAPP_BOT_OPTION_TTL_MS,
      jobId: `wa-idle-${token}`,
      removeOnComplete: true,
      removeOnFail: 100
    }
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
  const { threadId, phone, token } = job.data;
  const connection = getRedisConnection();
  if (!connection) return;

  // Arjun: stop the automatic five-minute closure message. Still consume the
  // token so stale bot buttons cannot be tapped after expiry.
  const consumed = await consumeWhatsAppBotOptionToken(threadId, token);
  if (!consumed) return;
  logger.info("whatsapp_bot_menu_expired_silent", { threadId, phone });
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
