/**
 * HTTP authz for CRM mount chain: /api/admin → requireAdmin → /crm (also requireAdmin).
 * Run: npm run test:crm
 */
import express, { Router } from "express";
import http from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { requireAdmin } from "../../src/middleware/admin";
import { errorHandler } from "../../src/middleware/errorHandler";
import { crmAdminRoutes } from "../../src/modules/crm/crm.routes";
import { signAccessToken } from "../../src/utils/jwt";
import { assertSafeTestDatabase } from "../helpers/test-db-guard";

function assertLocalCrmDb() {
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("CRM HTTP tests refuse non-localhost DATABASE_URL");
  }
  if (!url.includes("sarveda_crm_dev")) {
    throw new Error("CRM HTTP tests require sarveda_crm_dev");
  }
  assertSafeTestDatabase();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  const admin = Router();
  admin.use(requireAdmin);
  admin.use("/crm", crmAdminRoutes);
  app.use("/api/admin", admin);
  app.use(errorHandler);
  return app;
}

async function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

describe("CRM HTTP authorization", () => {
  const prisma = new PrismaClient();
  let base = "";
  let server: http.Server;
  let adminToken = "";
  let superToken = "";
  let customerToken = "";

  beforeAll(async () => {
    assertLocalCrmDb();
    const app = buildApp();
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const admin = await prisma.user.upsert({
      where: { email: "crm-http-admin@sarveda.local" },
      create: {
        email: "crm-http-admin@sarveda.local",
        name: "HTTP Admin",
        role: "ADMIN",
        isVerified: true
      },
      update: { role: "ADMIN", deletedAt: null }
    });
    const superAdmin = await prisma.user.upsert({
      where: { email: "crm-http-super@sarveda.local" },
      create: {
        email: "crm-http-super@sarveda.local",
        name: "HTTP Super",
        role: "SUPER_ADMIN",
        isVerified: true
      },
      update: { role: "SUPER_ADMIN", deletedAt: null }
    });
    const customer = await prisma.user.upsert({
      where: { email: "crm-http-customer@sarveda.local" },
      create: {
        email: "crm-http-customer@sarveda.local",
        name: "HTTP Customer",
        role: "CUSTOMER",
        isVerified: true
      },
      update: { role: "CUSTOMER", deletedAt: null }
    });

    adminToken = signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: "ADMIN"
    });
    superToken = signAccessToken({
      sub: superAdmin.id,
      email: superAdmin.email,
      role: "SUPER_ADMIN"
    });
    customerToken = signAccessToken({
      sub: customer.id,
      email: customer.email,
      role: "CUSTOMER"
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await prisma.$disconnect();
  });

  it("unauthenticated → 401", async () => {
    const res = await fetch(`${base}/api/admin/crm/pipelines`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
  });

  it("CUSTOMER → 403", async () => {
    const res = await fetch(`${base}/api/admin/crm/pipelines`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; code?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("ADMIN → allowed", async () => {
    const res = await fetch(`${base}/api/admin/crm/pipelines`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("SUPER_ADMIN → allowed", async () => {
    const res = await fetch(`${base}/api/admin/crm/pipelines`, {
      headers: { Authorization: `Bearer ${superToken}` }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });
});
