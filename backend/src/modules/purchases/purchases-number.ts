import { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

async function nextNumber(prefix: string, model: "po" | "bill"): Promise<string> {
  const latest =
    model === "po"
      ? await prisma.purchaseOrder.findFirst({
          where: { poNumber: { startsWith: prefix } },
          orderBy: { poNumber: "desc" },
          select: { poNumber: true }
        })
      : await prisma.vendorBill.findFirst({
          where: { billNumber: { startsWith: prefix } },
          orderBy: { billNumber: "desc" },
          select: { billNumber: true }
        });

  const last = model === "po" ? (latest as { poNumber: string } | null)?.poNumber : (latest as { billNumber: string } | null)?.billNumber;
  let nextSeq = 1;
  if (last) {
    const suffix = last.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n)) nextSeq = n + 1;
  }
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

export async function generatePoNumber(): Promise<string> {
  const prefix = "PO-";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await nextNumber(prefix, "po");
    } catch (err: unknown) {
      const isUnique =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUnique || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  throw new Error("Failed to generate PO number");
}

export async function generateBillNumber(): Promise<string> {
  const prefix = "BILL-";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await nextNumber(prefix, "bill");
    } catch (err: unknown) {
      const isUnique =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUnique || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  throw new Error("Failed to generate bill number");
}
