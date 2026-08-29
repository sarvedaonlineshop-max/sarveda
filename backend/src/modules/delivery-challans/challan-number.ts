import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

/** Fiscal year label matching quotation/invoice display (Apr–Mar): 26-27 */
export function challanFiscalYearLabel(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = m >= 3 ? y : y - 1;
  const end = (start + 1) % 100;
  return `${String(start % 100).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

/**
 * Format: DC/{FY}/{6-digit seq} e.g. DC/26-27/000001
 * Concurrency: unique constraint + retry (same pattern as Quotation).
 */
export async function generateChallanNumber(at = new Date()): Promise<string> {
  const fy = challanFiscalYearLabel(at);
  const prefix = `DC/${fy}/`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.deliveryChallan.findFirst({
      where: { challanNumber: { startsWith: prefix } },
      orderBy: { challanNumber: "desc" },
      select: { challanNumber: true }
    });
    let nextSeq = 1;
    if (latest?.challanNumber) {
      const suffix = latest.challanNumber.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!Number.isNaN(n)) nextSeq = n + 1;
    }
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const clash = await prisma.deliveryChallan.findUnique({
      where: { challanNumber: candidate },
      select: { id: true }
    });
    if (!clash) return candidate;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
  }
  throw new Error("Failed to generate delivery challan number");
}

export function isChallanNumberUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
