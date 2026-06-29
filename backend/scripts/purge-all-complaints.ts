/**
 * Purge ALL complaints tasks, notifications, and S3 media.
 * Keeps ComplaintWhitelist (and user accounts) intact.
 *
 * Usage: cd backend && npx tsx scripts/purge-all-complaints.ts
 */
import { prisma } from "../src/config/db";
import { deleteComplaintMedia } from "../src/config/s3-complaints";

async function main() {
  const attachments = await prisma.complaintAttachment.findMany({
    select: { s3Key: true }
  });
  const keys = [...new Set(attachments.map((a) => a.s3Key).filter(Boolean))];

  console.log(`Deleting ${keys.length} S3 objects…`);
  for (const key of keys) {
    try {
      await deleteComplaintMedia(key);
    } catch (err) {
      console.warn(`S3 delete failed for ${key}:`, err);
    }
  }

  const notif = await prisma.taskNotification.deleteMany({});
  const complaints = await prisma.complaint.deleteMany({});

  const whitelist = await prisma.complaintWhitelist.count({ where: { isActive: true } });

  console.log(JSON.stringify({
    deletedNotifications: notif.count,
    deletedComplaints: complaints.count,
    s3KeysAttempted: keys.length,
    activeWhitelistMembers: whitelist
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
