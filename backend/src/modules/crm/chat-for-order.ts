import { prisma } from "../../config/db";

/** Latest chat that already carries this order number. */
export async function latestChatByOrderNumber(orderNumbers: string[]): Promise<Map<string, string>> {
  const numbers = [...new Set(orderNumbers.map((value) => value.trim()).filter(Boolean))];
  const found = new Map<string, string>();
  if (numbers.length === 0) return found;
  const threads = await prisma.enquiryThread.findMany({
    where: { orderNumber: { in: numbers } },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, orderNumber: true }
  });
  for (const thread of threads) {
    const key = thread.orderNumber?.trim();
    if (key && !found.has(key)) found.set(key, thread.id);
  }
  return found;
}
