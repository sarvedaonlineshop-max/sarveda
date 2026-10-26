import { prisma } from "../../config/db";

import { crmBadRequest, crmForbidden, crmNotFound } from "./crm-errors";
import { canAssignChatOwner } from "./crm-team-access";

const ownerSelect = { id: true, name: true, email: true } as const;

export type ChatOwnerCard = {
  id: string;
  crmOwner: { id: string; name: string | null; email: string | null } | null;
};

export async function getChatOwner(threadId: string): Promise<ChatOwnerCard> {
  const row = await prisma.enquiryThread.findUnique({
    where: { id: threadId },
    select: { id: true, crmOwner: { select: ownerSelect } }
  });
  if (!row) throw crmNotFound("Chat");
  return row;
}

export async function setChatOwner(
  threadId: string,
  ownerUserId: string | null,
  actor: { id: string; email: string }
): Promise<ChatOwnerCard> {
  if (!canAssignChatOwner(actor.email)) {
    throw crmForbidden("Only Partha and Arjun can assign chats");
  }
  if (ownerUserId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerUserId, role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
      select: { id: true }
    });
    if (!owner) throw crmBadRequest("Select a valid admin");
  }
  const updated = await prisma.enquiryThread
    .update({
      where: { id: threadId },
      data: {
        crmOwnerUserId: ownerUserId,
        crmOwnerAssigned: Boolean(ownerUserId)
      },
      select: { id: true, crmOwner: { select: ownerSelect } }
    })
    .catch(() => null);
  if (!updated) throw crmNotFound("Chat");
  return updated;
}
