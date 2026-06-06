import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const connectionLimit = parseInt(process.env.DATABASE_POOL_SIZE ?? "20", 10);

function databaseUrlWithPool(): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL is required");
  }
  const url = new URL(base);
  url.searchParams.set("connection_limit", String(connectionLimit));
  url.searchParams.set("pool_timeout", "30");
  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
    datasources: {
      db: {
        url: databaseUrlWithPool()
      }
    }
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
