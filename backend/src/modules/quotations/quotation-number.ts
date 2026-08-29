import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

/** Fiscal year label matching invoice display (Apr–Mar): 26-27 */
export function quotationFiscalYearLabel(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = m >= 3 ? y : y - 1;
  const end = (start + 1) % 100;
  return `${String(start % 100).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

/**
 * Number at creation (DRAFT included).
 * Format: QT/{FY}/{6-digit seq} e.g. QT/26-27/000001
 * Concurrency: unique constraint + retry (same pattern as PO/Bill).
 */
export async function generateQuoteNumber(at = new Date()): Promise<string> {
  const fy = quotationFiscalYearLabel(at);
  const prefix = `QT/${fy}/`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await prisma.quotation.findFirst({
      where: { quoteNumber: { startsWith: prefix } },
      orderBy: { quoteNumber: "desc" },
      select: { quoteNumber: true }
    });
    let nextSeq = 1;
    if (latest?.quoteNumber) {
      const suffix = latest.quoteNumber.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!Number.isNaN(n)) nextSeq = n + 1;
    }
    const candidate = `${prefix}${String(nextSeq).padStart(6, "0")}`;
    const clash = await prisma.quotation.findUnique({
      where: { quoteNumber: candidate },
      select: { id: true }
    });
    if (!clash) return candidate;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
  }
  throw new Error("Failed to generate quotation number");
}

export function isQuoteNumberUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
