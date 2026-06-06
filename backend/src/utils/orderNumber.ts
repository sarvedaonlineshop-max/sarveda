import { Prisma } from "@prisma/client";

import { prisma } from "../config/db";

/**
 * SRV-{YYYYMM}{5-digit-seq} e.g. SRV-20260600001
 */
async function computeNextOrderNumber(): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `SRV-${y}${m}`;

  const latest = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true }
  });

  let nextSeq = 1;
  if (latest?.orderNumber) {
    const suffix = latest.orderNumber.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n)) {
      nextSeq = n + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

export async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const num = await computeNextOrderNumber();
      return num;
    } catch (err: unknown) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  throw new Error("Failed to generate order number after 3 attempts");
}

export function isOrderNumberUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("orderNumber");
  }
  return String(target ?? "").includes("orderNumber");
}
