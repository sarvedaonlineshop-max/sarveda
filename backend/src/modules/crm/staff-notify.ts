import { prisma } from "../../config/db";
import { sendPushToAdminUser } from "../../config/firebase";
import { logger } from "../../config/logger";

export const LOGISTICS_EMAILS = ["shiva@sarveda.com"];
export const RETURNS_EMAILS = ["sowmya@sarveda.com", "shiva@sarveda.com"];

export async function pushStaff(
  emails: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  options?: { ignoreOrderPref?: boolean }
): Promise<void> {
  const wanted = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return;
  const people = await prisma.user.findMany({
    where: {
      email: { in: wanted },
      deletedAt: null,
      ...(options?.ignoreOrderPref ? {} : { adminOrderNotificationsEnabled: true })
    },
    select: { id: true }
  });
  await Promise.all(
    people.map((person) =>
      sendPushToAdminUser(person.id, title, body.slice(0, 180), data).catch((err: unknown) => {
        logger.warn("staff_push_failed", {
          userId: person.id,
          error: err instanceof Error ? err.message : String(err)
        });
      })
    )
  );
}
