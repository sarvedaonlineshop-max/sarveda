import * as admin from "firebase-admin";

import { prisma } from "./db";
import { logger } from "./logger";

let initialized = false;
let credentialMode: "service_account" | "application_default" | "missing" =
  "missing";

function buildCredential(): admin.credential.Credential | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    credentialMode = "service_account";
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    });
  }

  // Do not use unrelated GOOGLE_APPLICATION_CREDENTIALS — FCM tokens are
  // project-specific and must match the mobile app (sarvedataskmanager).
  credentialMode = "missing";
  return null;
}

export function isFirebaseConfigured(): boolean {
  return credentialMode !== "missing";
}

/** Call once at server startup — logs clear error if FCM cannot send. */
export function validateFirebaseConfig(): void {
  const cred = buildCredential();
  if (!cred) {
    logger.error("firebase_not_configured", {
      hint:
        "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY "
        + "in .env (Firebase Console → Project Settings → Service accounts "
        + "→ Generate new private key). Project: sarvedataskmanager",
      hasProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
      hasClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
      hasPrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY)
    });
    return;
  }

  try {
    if (!initialized) {
      admin.initializeApp({ credential: cred });
      initialized = true;
    }
    logger.info("firebase_configured", {
      mode: credentialMode,
      projectId:
        process.env.FIREBASE_PROJECT_ID ?? "(application default)"
    });
  } catch (err) {
    logger.error("firebase_init_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export function getFirebaseAdmin(): admin.app.App {
  const cred = buildCredential();
  if (!cred) {
    throw new Error(
      "Firebase Admin not configured. Add FIREBASE_* env vars to backend .env"
    );
  }
  if (!initialized) {
    admin.initializeApp({ credential: cred });
    initialized = true;
  }
  return admin.app();
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  try {
    const app = getFirebaseAdmin();
    const messageId = await app.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: "sarveda_tasks_channel",
          color: "#075E54",
          sound: "default"
        }
      }
    });
    logger.info("fcm_push_sent", {
      messageId,
      tokenPrefix: fcmToken.slice(0, 12)
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("fcm_push_failed", {
      error: message,
      tokenPrefix: fcmToken.slice(0, 12)
    });
    if (
      message.includes("registration-token-not-registered") ||
      message.includes("InvalidRegistration") ||
      message.includes("NotRegistered")
    ) {
      await prisma.user.updateMany({
        where: { fcmToken },
        data: { fcmToken: null }
      });
      logger.warn("fcm_token_cleared_stale", {
        tokenPrefix: fcmToken.slice(0, 12)
      });
    }
    return false;
  }
}

export async function sendPushToEmails(
  emails: Iterable<string>,
  title: string,
  body: string,
  data: { taskId: string; type: string }
): Promise<number> {
  const list = Array.from(emails);
  if (list.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      email: { in: list },
      fcmToken: { not: null },
      pushNotificationsEnabled: true
    },
    select: { email: true, fcmToken: true }
  });

  if (users.length === 0) {
    logger.warn("fcm_no_tokens_for_emails", { emails: list });
    return 0;
  }

  let sent = 0;
  for (const user of users) {
    if (user.fcmToken) {
      const ok = await sendPushNotification(
        user.fcmToken,
        title,
        body,
        data
      );
      if (ok) sent += 1;
    }
  }
  return sent;
}
