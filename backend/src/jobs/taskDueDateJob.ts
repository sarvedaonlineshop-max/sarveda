import { Queue, Worker } from "bullmq";

import { prisma } from "../config/db";
import { sendPushToEmails } from "../config/firebase";
import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";

const QUEUE_NAME = "task-due-reminders";
const CHECK_WINDOW_MS = 90 * 1000;
const INTERVAL_MS = 30 * 1000;

let queue: Queue | null = null;
let worker: Worker | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let started = false;

async function notificationExists(
  taskId: string,
  recipientEmail: string,
  message: string
): Promise<boolean> {
  const existing = await prisma.taskNotification.findFirst({
    where: { taskId, recipientEmail, message }
  });
  return existing != null;
}

function recipientEmails(task: {
  assignees: { assigneeEmail: string }[];
  raisedByEmail: string;
  assignedByEmail: string | null;
}): string[] {
  const emails = new Set<string>();
  for (const a of task.assignees) {
    emails.add(a.assigneeEmail);
  }
  if (task.raisedByEmail) emails.add(task.raisedByEmail);
  if (task.assignedByEmail) emails.add(task.assignedByEmail);
  return Array.from(emails);
}

export async function checkDueDateReminders(): Promise<void> {
  const now = new Date();

  const tasks = await prisma.complaint.findMany({
    where: {
      dueDate: { not: null },
      status: { notIn: ["RESOLVED"] }
    },
    include: { assignees: true }
  });

  for (const task of tasks) {
    if (!task.dueDate || !task.createdAt) continue;

    const total = task.dueDate.getTime() - task.createdAt.getTime();
    if (total <= 0) continue;

    const milestones = [
      { ratio: 0.5, pct: "50%" },
      { ratio: 1.0, pct: "100%" }
    ];

    for (const ms of milestones) {
      const msTime = task.createdAt.getTime() + total * ms.ratio;

      if (
        msTime > now.getTime() - CHECK_WINDOW_MS &&
        msTime <= now.getTime()
      ) {
        const message =
          ms.ratio >= 1
            ? `⚠️ OVERDUE: "${task.title}" has passed its due date!`
            : `⏰ "${task.title}" is ${ms.pct} through its deadline`;

        const recipients = recipientEmails(task);

        for (const email of recipients) {
          if (
            await notificationExists(task.id, email, message)
          ) {
            continue;
          }

          await prisma.taskNotification.create({
            data: {
              recipientEmail: email,
              taskId: task.id,
              taskTitle: task.title,
              type: "DUE_DATE_REMINDER",
              message
            }
          });

          void sendPushToEmails(
            [email],
            ms.ratio >= 1 ? "⚠️ Task Overdue" : "⏰ Deadline Reminder",
            message,
            { taskId: task.id, type: "DUE_DATE_REMINDER" }
          );
        }

        if (ms.ratio >= 1 && task.priority === "HIGH" && task.assignedByEmail) {
          const assigneeNames = task.assignees
            .map((a) => a.assigneeName ?? a.assigneeEmail.split("@")[0])
            .join(", ");

          const hpMessage = `🔴 HIGH PRIORITY OVERDUE: "${task.title}" assigned to ${assigneeNames} is past due!`;

          if (
            !(await notificationExists(
              task.id,
              task.assignedByEmail,
              hpMessage
            ))
          ) {
            await prisma.taskNotification.create({
              data: {
                recipientEmail: task.assignedByEmail,
                taskId: task.id,
                taskTitle: task.title,
                type: "HIGH_PRIORITY_OVERDUE",
                message: hpMessage
              }
            });

            void sendPushToEmails(
              [task.assignedByEmail],
              "🔴 High Priority Overdue",
              hpMessage,
              { taskId: task.id, type: "HIGH_PRIORITY_OVERDUE" }
            );
          }
        }
      }
    }
  }

  logger.info("due_date_check_complete", { tasksChecked: tasks.length });
}

function startIntervalFallback(): void {
  if (intervalHandle) return;
  logger.warn("task_due_date_worker_interval_fallback", {
    reason: "REDIS unavailable — using setInterval"
  });
  void checkDueDateReminders();
  intervalHandle = setInterval(() => {
    void checkDueDateReminders().catch((err) => {
      logger.error("task_due_date_interval_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }, INTERVAL_MS);
}

export function startDueDateReminderWorker(): void {
  if (started) return;
  started = true;

  const conn = getRedisConnection();
  if (!conn) {
    startIntervalFallback();
    return;
  }

  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: conn });
  }

  void queue.add(
    "check",
    {},
    {
      repeat: { every: INTERVAL_MS },
      jobId: "task-due-reminders-30s"
    }
  );

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      try {
        await checkDueDateReminders();
      } catch (err) {
        logger.error("task_due_date_job_failed", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    },
    { connection: conn, concurrency: 1 }
  );

  worker.on("failed", (job, err) => {
    logger.error("task_due_date_worker_failed", { jobId: job?.id, err });
  });

  worker.on("error", () => {
    if (!intervalHandle) {
      startIntervalFallback();
    }
  });

  logger.info("task_due_date_worker_started");
}
