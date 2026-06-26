import { Queue, Worker } from "bullmq";

import { prisma } from "../config/db";
import { logger } from "../config/logger";
import { getRedisConnection } from "../config/redisConnection";
import { sendMail } from "../modules/notifications/email";

const QUEUE_NAME = "task-due-reminders";

let queue: Queue | null = null;
let worker: Worker | null = null;

function tasksAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "http://localhost:3000";
  return `${raw.replace(/\/$/, "")}/complaints`;
}

function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function checkDueDateReminders(): Promise<void> {
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

    const elapsed = now.getTime() - task.createdAt.getTime();
    const ratio = elapsed / total;

    const milestones = [
      { ratio: 0.25, pct: "25%" },
      { ratio: 0.5, pct: "50%" },
      { ratio: 0.75, pct: "75%" },
      { ratio: 1.0, pct: "100%" }
    ];

    for (const ms of milestones) {
      const msTime = task.createdAt.getTime() + total * ms.ratio;
      const oneHour = 60 * 60 * 1000;

      if (msTime > now.getTime() - oneHour && msTime <= now.getTime()) {
        for (const assignee of task.assignees) {
          await prisma.taskNotification.create({
            data: {
              recipientEmail: assignee.assigneeEmail,
              taskId: task.id,
              taskTitle: task.title,
              type: "DUE_DATE_REMINDER",
              message:
                ms.ratio >= 1
                  ? `⚠️ OVERDUE: "${task.title}" has passed its due date!`
                  : `⏰ "${task.title}" is ${ms.pct} through its deadline`
            }
          });

          const html = `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                <div style="background:${ms.ratio >= 1 ? "#dc2626" : "#c8960a"};padding:20px;border-radius:12px 12px 0 0">
                  <h2 style="color:#fff;margin:0">
                    ${ms.ratio >= 1 ? "⚠️ Task Overdue!" : `⏰ ${ms.pct} of deadline reached`}
                  </h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e0d8ce;border-top:none;border-radius:0 0 12px 12px">
                  <p style="color:#2c2420;font-size:16px;font-weight:700">${task.title}</p>
                  <p style="color:#8a7060;font-size:14px">Due: ${task.dueDate.toLocaleDateString("en-IN")}</p>
                  <p style="color:#4a3f38;font-size:14px;margin-top:12px">
                    ${
                      ms.ratio >= 1
                        ? "This task is past its due date. Please update the status or contact your manager."
                        : `You have used ${ms.pct} of the allocated time for this task.`
                    }
                  </p>
                  <a href="${tasksAppUrl()}" style="display:inline-block;background:#1e3a2f;color:#f5d88a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Task →</a>
                </div>
              </div>`;

          void sendMail(
            assignee.assigneeEmail,
            ms.ratio >= 1 ? `⚠️ OVERDUE: ${task.title}` : `⏰ Task ${ms.pct} deadline: ${task.title}`,
            html,
            htmlToPlainText(html)
          ).catch((err) => logger.error("due_date_email_failed", { err, taskId: task.id }));
        }

        if (ms.ratio >= 1 && task.priority === "HIGH" && task.assignedByEmail) {
          const assigneeNames = task.assignees
            .map((a) => a.assigneeName ?? a.assigneeEmail.split("@")[0])
            .join(", ");

          await prisma.taskNotification.create({
            data: {
              recipientEmail: task.assignedByEmail,
              taskId: task.id,
              taskTitle: task.title,
              type: "HIGH_PRIORITY_OVERDUE",
              message: `🔴 HIGH PRIORITY OVERDUE: "${task.title}" assigned to ${assigneeNames} is past due!`
            }
          });

          const html = `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                <div style="background:#dc2626;padding:20px;border-radius:12px 12px 0 0">
                  <h2 style="color:#fff;margin:0">🔴 High Priority Task Overdue</h2>
                </div>
                <div style="background:#fff;padding:20px;border:1px solid #e0d8ce;border-top:none;border-radius:0 0 12px 12px">
                  <p style="color:#2c2420;font-weight:700;font-size:16px">${task.title}</p>
                  <p style="color:#4a3f38;margin-top:8px">
                    Assigned to: <strong>${task.assignees.map((a) => a.assigneeName ?? a.assigneeEmail).join(", ")}</strong>
                  </p>
                  <p style="color:#dc2626;font-weight:700;margin-top:8px">
                    This HIGH PRIORITY task is overdue and not yet completed.
                  </p>
                  <a href="${tasksAppUrl()}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">View Task →</a>
                </div>
              </div>`;

          void sendMail(
            task.assignedByEmail,
            `🔴 HIGH PRIORITY OVERDUE: ${task.title}`,
            html,
            htmlToPlainText(html)
          ).catch((err) => logger.error("high_priority_overdue_email", { err }));
        }
      }
    }
  }

  logger.info("due_date_check_complete", { tasksChecked: tasks.length });
}

export function startDueDateReminderWorker(): void {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("task_due_date_worker_skipped", { reason: "REDIS_URL not set" });
    return;
  }
  if (worker) return;

  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: conn });
  }

  void queue.add(
    "check",
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: "task-due-reminders-hourly"
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

  logger.info("task_due_date_worker_started");
}
