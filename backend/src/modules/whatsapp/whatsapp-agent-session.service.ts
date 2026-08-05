import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { issueWhatsAppBotOptionToken } from "../../jobs/whatsappBotIdleJob";
import { sendWhatsAppButtons } from "./whatsapp-interactive";
import { publishEnquiryEvent } from "../enquiries/enquiry-realtime";

/** Start (or return) the one open live-agent session for a thread. */
export async function startWhatsAppAgentSession(threadId: string, reason: string) {
  const existing = await prisma.whatsAppAgentSession.findFirst({
    where: { threadId, endedAt: null }
  });
  if (existing) return existing;

  try {
    const session = await prisma.whatsAppAgentSession.create({
      data: { threadId, reason }
    });
    logger.info("whatsapp_agent_session_started", { threadId, sessionId: session.id, reason });
    return session;
  } catch (error) {
    // The partial unique index can win a race between two rapid handoffs.
    const raced = await prisma.whatsAppAgentSession.findFirst({
      where: { threadId, endedAt: null }
    });
    if (raced) return raced;
    throw error;
  }
}

/** The first human admin reply claims the active session. */
export async function claimWhatsAppAgentSession(
  threadId: string,
  adminId: string
): Promise<void> {
  const result = await prisma.whatsAppAgentSession.updateMany({
    where: { threadId, endedAt: null, attendingAdminId: null },
    data: { attendingAdminId: adminId, claimedAt: new Date() }
  });
  if (result.count > 0) {
    logger.info("whatsapp_agent_session_claimed", { threadId, adminId });
  }
}

export async function closeWhatsAppAgentSession(
  threadId: string,
  endReason: string
) {
  const session = await prisma.whatsAppAgentSession.findFirst({
    where: { threadId, endedAt: null },
    orderBy: { startedAt: "desc" }
  });
  if (!session) return null;

  const closed = await prisma.whatsAppAgentSession.update({
    where: { id: session.id },
    data: { endedAt: new Date(), endReason }
  });
  logger.info("whatsapp_agent_session_closed", {
    threadId,
    sessionId: closed.id,
    endReason
  });
  return closed;
}

/** Close the session and ask the customer to rate the attending admin. */
export async function closeWhatsAppAgentSessionAndRequestRating(
  threadId: string,
  phone: string
): Promise<void> {
  const session = await closeWhatsAppAgentSession(threadId, "admin_closed");
  if (!session?.attendingAdminId) return;

  const token = await issueWhatsAppBotOptionToken(threadId, phone);
  const body = "Your support conversation is now closed.\n\nHow was your experience with our agent?";
  const sid = await sendWhatsAppButtons(phone, { body }, [
    { id: `a:${token}:${session.id}:5`, title: "😊 Good" },
    { id: `a:${token}:${session.id}:3`, title: "😐 Okay" },
    { id: `a:${token}:${session.id}:1`, title: "😞 Poor" }
  ]);

  await prisma.enquiryMessage.create({
    data: {
      threadId,
      authorType: "ADMIN",
      authorName: "Sarveda Assistant",
      authorEmail: "bot@sarveda.com",
      body,
      waMessageSid: sid,
      waStatus: sid ? "sent" : null
    }
  });
  publishEnquiryEvent({ type: "message_changed", threadId });
}

export async function rateWhatsAppAgentSession(
  threadId: string,
  sessionId: string,
  rating: number
): Promise<boolean> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;
  const result = await prisma.whatsAppAgentSession.updateMany({
    where: { id: sessionId, threadId, endedAt: { not: null }, customerRating: null },
    data: { customerRating: rating, ratedAt: new Date() }
  });
  if (result.count > 0) {
    logger.info("whatsapp_agent_session_rated", { threadId, sessionId, rating });
  }
  return result.count > 0;
}

export async function getWhatsAppAgentSessionStats() {
  const [totals, sessions] = await Promise.all([
    prisma.whatsAppAgentSession.aggregate({
      _count: { _all: true },
      _avg: { customerRating: true }
    }),
    prisma.whatsAppAgentSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        attendingAdmin: { select: { id: true, name: true, email: true } },
        thread: { select: { id: true, customerName: true, waPhone: true } }
      }
    })
  ]);

  return {
    totalSessions: totals._count._all,
    averageRating: totals._avg.customerRating,
    sessions: sessions.map((session) => ({
      ...session,
      waitTimeSeconds: session.claimedAt
        ? Math.max(0, Math.round((session.claimedAt.getTime() - session.startedAt.getTime()) / 1000))
        : null,
      handleTimeSeconds:
        session.claimedAt && session.endedAt
          ? Math.max(0, Math.round((session.endedAt.getTime() - session.claimedAt.getTime()) / 1000))
          : null
    }))
  };
}
