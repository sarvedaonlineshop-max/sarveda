import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmBadRequest, crmNotFound } from "./crm-errors";

export type JsonValue = PrismaTypes.InputJsonValue;

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw crmBadRequest("Invalid date");
  return d;
}

export function parseDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw crmBadRequest("Invalid datetime");
  return d;
}

export function toJson(
  value: unknown
): PrismaTypes.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as PrismaTypes.InputJsonValue;
}

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit)))
  };
}

export async function assertAdminUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      role: { in: ["ADMIN", "SUPER_ADMIN"] }
    },
    select: { id: true }
  });
  if (!user) throw crmBadRequest("owner/assignee must be an active admin user", "INVALID_USER");
  return user.id;
}

export async function assertAnyUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true }
  });
  if (!user) throw crmNotFound("User");
  return user.id;
}

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true
} satisfies PrismaTypes.UserSelect;

export const DEFAULT_SALES_STAGES: Array<{
  name: string;
  stageType: "OPEN" | "WON" | "LOST";
  position: number;
  probabilityPercent: number;
}> = [
  { name: "New Opportunity", stageType: "OPEN", position: 0, probabilityPercent: 10 },
  { name: "Qualified", stageType: "OPEN", position: 1, probabilityPercent: 25 },
  { name: "Proposal / Quotation", stageType: "OPEN", position: 2, probabilityPercent: 50 },
  { name: "Negotiation", stageType: "OPEN", position: 3, probabilityPercent: 75 },
  { name: "Won", stageType: "WON", position: 4, probabilityPercent: 100 },
  { name: "Lost", stageType: "LOST", position: 5, probabilityPercent: 0 }
];
