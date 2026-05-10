import { prisma } from "../config/db";

/**
 * SRV-{YYYYMM}{5-digit-seq} e.g. SRV-20260600001
 */
export async function generateOrderNumber(): Promise<string> {
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
