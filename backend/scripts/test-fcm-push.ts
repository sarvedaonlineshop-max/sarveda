/**
 * Verify Firebase Admin can send FCM push.
 *
 * Usage:
 *   npx tsx scripts/test-fcm-push.ts <user-email>
 *
 * Requires FIREBASE_* in backend/.env and the user must have logged
 * into the mobile app (fcmToken saved in DB).
 */
import "dotenv/config";

import { prisma } from "../src/config/db";
import {
  sendPushNotification,
  validateFirebaseConfig
} from "../src/config/firebase";

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error(
      "Usage: npx tsx scripts/test-fcm-push.ts <user-email>"
    );
    process.exit(1);
  }

  console.log("=== Firebase FCM diagnostic ===\n");
  console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ?? "(missing)");
  console.log(
    "FIREBASE_CLIENT_EMAIL:",
    process.env.FIREBASE_CLIENT_EMAIL ?? "(missing)"
  );
  console.log(
    "FIREBASE_PRIVATE_KEY:",
    process.env.FIREBASE_PRIVATE_KEY ? "(set)" : "(missing)"
  );
  console.log("");

  validateFirebaseConfig();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, fcmToken: true }
  });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  if (!user.fcmToken) {
    console.error(
      `No FCM token in DB for ${email}.\n`
      + "Open the mobile app, log in, and allow notifications first."
    );
    process.exit(1);
  }

  console.log(`FCM token in DB: ${user.fcmToken.slice(0, 20)}...`);
  console.log("Sending test push via Firebase Admin SDK...\n");

  const ok = await sendPushNotification(
    user.fcmToken,
    "🔔 Firebase test",
    "If you see this, server → Firebase → phone works!",
    { taskId: "test", type: "TEST" }
  );

  if (ok) {
    console.log("✅ Push sent successfully — check your phone.");
  } else {
    console.error(
      "❌ Push failed — check server logs above for the Firebase error."
    );
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
