import * as admin from "firebase-admin";

import { prisma } from "./db";

let initialized = false;

function buildCredential(): admin.credential.Credential {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    });
  }

  return admin.credential.applicationDefault();
}

export function getFirebaseAdmin(): admin.app.App {
  if (!initialized) {
    admin.initializeApp({
      credential: buildCredential()
    });
    initialized = true;
  }
  return admin.app();
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  try {
    const app = getFirebaseAdmin();
    await app.messaging().send({
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[FCM] Push failed:", message);
  }
}

export async function sendPushToEmails(
  emails: Iterable<string>,
  title: string,
  body: string,
  data: { taskId: string; type: string }
): Promise<void> {
  const list = Array.from(emails);
  if (list.length === 0) return;

  const users = await prisma.user.findMany({
    where: {
      email: { in: list },
      fcmToken: { not: null }
    },
    select: { email: true, fcmToken: true }
  });

  for (const user of users) {
    if (user.fcmToken) {
      void sendPushNotification(user.fcmToken, title, body, data);
    }
  }
}
