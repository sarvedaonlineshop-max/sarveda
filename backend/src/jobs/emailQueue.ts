import { Queue, Worker, type Job } from "bullmq";

import { getRedisConnection } from "../config/redisConnection";
import { logger } from "../config/logger";

export const EMAIL_QUEUE_NAME = "email-notifications";

export type OrderEmailJobOpts = {
  refundAmountInPaise?: number;
  refundId?: string;
  caseNumber?: string | null;
  paymentProvider?: string | null;
};

export type EmailJob =
  | {
      type: "order_email";
      orderId: string;
      event: string;
      opts?: OrderEmailJobOpts;
    }
  | {
      type: "abandoned_cart";
      userId: string;
    }
  | {
      type: "direct";
      to: string;
      subject: string;
      html: string;
    };

let emailQueue: Queue | null = null;
let emailWorker: Worker | null = null;

export function getEmailQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 }
      }
    });
  }
  return emailQueue;
}

async function sendEmailJobDirect(job: EmailJob): Promise<void> {
  const { sendOrderEmail, sendAbandonedCartEmail, sendMail } = await import(
    "../modules/notifications/email"
  );

  if (job.type === "order_email") {
    await sendOrderEmail(
      job.orderId,
      job.event as Parameters<typeof sendOrderEmail>[1],
      job.opts
    );
  } else if (job.type === "abandoned_cart") {
    await sendAbandonedCartEmail(job.userId);
  } else if (job.type === "direct") {
    const text = job.html.replace(/<[^>]+>/g, "");
    await sendMail(job.to, job.subject, job.html, text);
  }
}

export async function enqueueEmail(job: EmailJob, dedupeKey?: string): Promise<void> {
  const q = getEmailQueue();
  if (!q) {
    logger.warn("email_queue_unavailable_direct_send", { job });
    await sendEmailJobDirect(job);
    return;
  }
  await q.add(job.type, job, {
    jobId: dedupeKey
  });
}

export function startEmailWorker(): void {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("email_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (emailWorker) return;

  emailWorker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJob>) => {
      logger.info("email_job_processing", {
        id: job.id,
        type: job.data.type
      });
      await sendEmailJobDirect(job.data);
    },
    {
      connection: conn,
      concurrency: 3
    }
  );

  emailWorker.on("failed", (job, err) => {
    logger.error("email_job_failed", { jobId: job?.id, type: job?.data?.type, err });
  });

  logger.info("email_worker_started");
}
