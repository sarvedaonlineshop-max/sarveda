import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { sendMail } from "../notifications/email";

export function tasksAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "http://localhost:3000";
  return `${raw.replace(/\/$/, "")}/complaints`;
}

export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function taskEmailHtml(
  heading: string,
  bodyHtml: string,
  ctaLabel = "Open in Sarveda Tasks"
): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <div style="background:#1e3a2f;padding:20px;border-radius:12px 12px 0 0">
        <h2 style="color:#f5d88a;margin:0">Sarveda Tasks</h2>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e0d8ce;border-top:none;border-radius:0 0 12px 12px">
        <p style="color:#2c2420">${heading}</p>
        ${bodyHtml}
        <a href="${tasksAppUrl()}" style="display:inline-block;background:#1e3a2f;color:#f5d88a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">${ctaLabel}</a>
      </div>
    </div>`;
}

/** Send task emails only to users who have email notifications enabled. */
export async function sendTaskEmails(
  emails: Iterable<string>,
  subject: string,
  html: string
): Promise<void> {
  const list = [
    ...new Set(
      Array.from(emails)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  if (list.length === 0) return;

  const users = await prisma.user.findMany({
    where: { email: { in: list } },
    select: { email: true, emailNotificationsEnabled: true }
  });
  const prefMap = new Map(
    users.map((u) => [u.email.toLowerCase(), u.emailNotificationsEnabled])
  );

  for (const email of list) {
    const pref = prefMap.get(email);
    if (pref === false) continue;
    void sendMail(email, subject, html, htmlToPlainText(html)).catch((err) =>
      logger.error("task_email_failed", { err, email, subject })
    );
  }
}
