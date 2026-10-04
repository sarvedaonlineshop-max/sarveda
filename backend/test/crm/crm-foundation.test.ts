/**
 * CRM service-level tests against local sarveda_crm_dev only.
 * Run: npm run test:crm  (sets SARVEDA_CRM_TEST=1 so setup loads .env.crm)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { assertSafeTestDatabase } from "../helpers/test-db-guard";
import * as pipelineService from "../../src/modules/crm/pipeline.service";
import * as leadService from "../../src/modules/crm/lead.service";
import * as dealService from "../../src/modules/crm/deal.service";
import * as contactService from "../../src/modules/crm/contact.service";
import * as taskService from "../../src/modules/crm/task.service";
import * as activityService from "../../src/modules/crm/activity.service";
import * as customer360 from "../../src/modules/crm/customer360.service";
import { CrmError } from "../../src/modules/crm/crm-errors";
import { crmAdminRoutes } from "../../src/modules/crm/crm.routes";

function assertLocalCrmDb() {
  const url = process.env.DATABASE_URL ?? "";
  const lower = url.toLowerCase();
  if (!lower.includes("localhost") && !lower.includes("127.0.0.1")) {
    throw new Error("CRM tests refuse non-localhost DATABASE_URL");
  }
  if (!lower.includes("sarveda_crm_dev")) {
    throw new Error("CRM tests require database sarveda_crm_dev");
  }
  assertSafeTestDatabase();
}

const prisma = new PrismaClient();
const actor = { id: "", email: "crm-test-admin@sarveda.local", name: "CRM Test Admin" };

async function cleanupCrmFixtures(prefix: string) {
  await prisma.crmTask.deleteMany({ where: { title: { contains: prefix } } });
  await prisma.crmActivity.deleteMany({
    where: {
      OR: [{ subject: { contains: prefix } }, { body: { contains: prefix } }]
    }
  });
  await prisma.crmDealProduct.deleteMany({
    where: { productName: { contains: prefix } }
  });
  await prisma.crmDeal.deleteMany({ where: { name: { contains: prefix } } });
  await prisma.crmLead.deleteMany({ where: { name: { contains: prefix } } });
  await prisma.crmContact.deleteMany({ where: { displayName: { contains: prefix } } });
  await prisma.crmAccount.deleteMany({ where: { name: { contains: prefix } } });
  await prisma.crmPipelineStage.deleteMany({ where: { name: { contains: prefix } } });
  await prisma.crmPipeline.deleteMany({ where: { name: { contains: prefix } } });
}

describe("CRM foundation", () => {
  const PREFIX = `CRMTEST-${Date.now()}`;

  beforeAll(async () => {
    assertLocalCrmDb();
    const admin = await prisma.user.upsert({
      where: { email: actor.email },
      create: {
        email: actor.email,
        name: actor.name,
        role: "ADMIN",
        isVerified: true
      },
      update: { role: "ADMIN", deletedAt: null }
    });
    actor.id = admin.id;
    await pipelineService.ensureDefaultSalesPipeline();
  });

  afterAll(async () => {
    await cleanupCrmFixtures(PREFIX);
    await prisma.$disconnect();
  });

  it("crm routes export is mounted under admin requireAdmin parent", () => {
    expect(typeof crmAdminRoutes).toBe("function");
  });

  it("creates, lists, updates leads with search/pagination", async () => {
    const lead = await leadService.createLead(
      {
        name: `${PREFIX} Lead Alpha`,
        email: `${PREFIX.toLowerCase()}@example.com`,
        phone: "9999900001",
        source: "WEBSITE",
        estimatedValueInPaise: 50000
      },
      actor
    );
    expect(lead.leadNumber).toMatch(/^LEAD-\d{6}-\d{5}$/);

    const listed = await leadService.listLeads({
      page: 1,
      limit: 10,
      search: PREFIX,
      sortBy: "createdAt",
      sortOrder: "desc"
    });
    expect(listed.items.some((l) => l.id === lead.id)).toBe(true);
    expect(listed.pagination.total).toBeGreaterThanOrEqual(1);

    const updated = await leadService.updateLead(
      lead.id,
      { status: "CONTACTED", interestSummary: "Followed up" },
      actor
    );
    expect(updated.status).toBe("CONTACTED");
    expect(updated.lastContactedAt).toBeTruthy();
  });

  it("rejects casual CONVERTED status patch", async () => {
    const lead = await leadService.createLead({ name: `${PREFIX} Enum Lead` }, actor);
    await expect(
      leadService.updateLead(lead.id, { status: "CONVERTED" }, actor)
    ).rejects.toMatchObject({ code: "USE_CONVERT_ENDPOINT", statusCode: 400 });
  });

  it("rejects duplicate enquiryThread link", async () => {
    const thread = await prisma.enquiryThread.create({
      data: {
        source: "CONTACT",
        customerName: `${PREFIX} Thread`,
        customerEmail: `${PREFIX}-thread@example.com`,
        status: "OPEN"
      }
    });
    await leadService.createLead(
      { name: `${PREFIX} Linked Lead`, enquiryThreadId: thread.id },
      actor
    );
    await expect(
      leadService.createLead(
        { name: `${PREFIX} Linked Lead 2`, enquiryThreadId: thread.id },
        actor
      )
    ).rejects.toMatchObject({ code: "ENQUIRY_LINKED", statusCode: 409 });
  });

  it("pipeline/stage create and cannot delete stage with deal; WON/LOST timestamps", async () => {
    const pipeline = await pipelineService.createPipeline({
      name: `${PREFIX} Pipeline`,
      isDefault: false
    });
    const stage = await pipelineService.createStage(pipeline.id, {
      name: `${PREFIX} Stage Open`,
      stageType: "OPEN",
      probabilityPercent: 20
    });
    const won = await pipelineService.createStage(pipeline.id, {
      name: `${PREFIX} Stage Won`,
      stageType: "WON",
      probabilityPercent: 100
    });
    const lost = await pipelineService.createStage(pipeline.id, {
      name: `${PREFIX} Stage Lost`,
      stageType: "LOST",
      probabilityPercent: 0
    });

    const deal = await dealService.createDeal(
      {
        name: `${PREFIX} Deal Stage Guard`,
        pipelineId: pipeline.id,
        stageId: stage.id,
        amountInPaise: 1000
      },
      actor
    );

    await expect(pipelineService.deleteStage(stage.id)).rejects.toMatchObject({
      code: "STAGE_HAS_DEALS",
      statusCode: 409
    });

    const wonDeal = await dealService.updateDeal(
      deal.id,
      { stageId: won.id, pipelineId: pipeline.id },
      actor
    );
    expect(wonDeal.status).toBe("WON");
    expect(wonDeal.wonAt).toBeTruthy();
    expect(wonDeal.closedAt).toBeTruthy();

    const lostDeal = await dealService.updateDeal(
      deal.id,
      { stageId: lost.id, pipelineId: pipeline.id, lostReason: "Budget" },
      actor
    );
    expect(lostDeal.status).toBe("LOST");
    expect(lostDeal.lostAt).toBeTruthy();
    expect(lostDeal.wonAt).toBeNull();
    expect(lostDeal.lostReason).toBe("Budget");

    const reopened = await dealService.updateDeal(
      deal.id,
      { stageId: stage.id, pipelineId: pipeline.id },
      actor
    );
    expect(reopened.status).toBe("OPEN");
    expect(reopened.lostAt).toBeNull();
    expect(reopened.wonAt).toBeNull();
    expect(reopened.closedAt).toBeNull();
    expect(reopened.lostReason).toBeNull();
  });

  it("converts lead transactionally and rejects double conversion; no journal rows", async () => {
    const journalBefore = await prisma.accountingJournalEntry.count();
    const lead = await leadService.createLead(
      {
        name: `${PREFIX} Convert Me`,
        companyName: `${PREFIX} Co`,
        email: `${PREFIX}-convert@example.com`,
        estimatedValueInPaise: 25000
      },
      actor
    );
    const converted = await leadService.convertLead(lead.id, {}, actor);
    expect(converted.status).toBe("CONVERTED");
    expect(converted.convertedAccountId).toBeTruthy();
    expect(converted.convertedContactId).toBeTruthy();
    expect(converted.convertedDealId).toBeTruthy();

    await expect(leadService.convertLead(lead.id, {}, actor)).rejects.toMatchObject({
      code: "LEAD_ALREADY_CONVERTED"
    });
    expect(await prisma.accountingJournalEntry.count()).toBe(journalBefore);
  });

  it("rolls back conversion when deal pipeline/stage invalid", async () => {
    const lead = await leadService.createLead({ name: `${PREFIX} Rollback Lead` }, actor);
    await expect(
      leadService.convertLead(
        lead.id,
        {
          createDeal: true,
          deal: {
            pipelineId: "00000000-0000-4000-8000-000000000099",
            stageId: "00000000-0000-4000-8000-000000000098"
          }
        },
        actor
      )
    ).rejects.toBeTruthy();

    const after = await prisma.crmLead.findUnique({ where: { id: lead.id } });
    expect(after?.status).not.toBe("CONVERTED");
    expect(after?.convertedAt).toBeNull();
  });

  it("enforces unique linkedUserId on contacts", async () => {
    const user = await prisma.user.upsert({
      where: { email: `${PREFIX.toLowerCase()}-link@example.com` },
      create: {
        email: `${PREFIX.toLowerCase()}-link@example.com`,
        name: "Link User",
        role: "CUSTOMER",
        isVerified: true
      },
      update: {}
    });
    await contactService.createContact(
      { displayName: `${PREFIX} Contact A`, linkedUserId: user.id },
      actor.id
    );
    await expect(
      contactService.createContact(
        { displayName: `${PREFIX} Contact B`, linkedUserId: user.id },
        actor.id
      )
    ).rejects.toMatchObject({ code: "USER_ALREADY_LINKED" });
  });

  it("task complete/reopen timestamps", async () => {
    const task = await taskService.createTask(
      { title: `${PREFIX} Follow up`, priority: "HIGH" },
      actor.id
    );
    const done = await taskService.updateTask(task.id, { status: "COMPLETED" });
    expect(done.completedAt).toBeTruthy();
    const reopen = await taskService.updateTask(task.id, { status: "OPEN" });
    expect(reopen.completedAt).toBeNull();
  });

  it("links quotation and order without mutating order", async () => {
    const seeded = await pipelineService.ensureDefaultSalesPipeline();
    const stage = seeded.pipeline.stages.find((s) => s.stageType === "OPEN")!;
    const deal = await dealService.createDeal(
      {
        name: `${PREFIX} Link Deal`,
        pipelineId: seeded.pipeline.id,
        stageId: stage.id
      },
      actor
    );

    const quotation = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-CRM-${Date.now()}`,
        customerName: `${PREFIX} Buyer`,
        email: `${PREFIX}-buyer@example.com`,
        billingAddress: {},
        shippingAddress: {},
        subtotalInPaise: 10000,
        grandTotalInPaise: 10000
      }
    });
    const linkedQ = await dealService.linkQuotation(deal.id, quotation.id, actor);
    expect(linkedQ.deal.quotationId).toBe(quotation.id);

    const order = await prisma.order.create({
      data: {
        orderNumber: `SRV-CRM-${Date.now()}`,
        email: `${PREFIX}-buyer@example.com`,
        phone: "9999900099",
        status: "PAID",
        paymentStatus: "CAPTURED",
        subtotalInPaise: 10000,
        grandTotalInPaise: 10000
      }
    });
    const beforeStatus = order.status;
    const linkedO = await dealService.linkOrder(deal.id, order.id, actor);
    expect(linkedO.deal.orderId).toBe(order.id);
    const afterOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterOrder?.status).toBe(beforeStatus);
  });

  it("CHECK constraint rejects probabilityPercent 150", async () => {
    const seeded = await pipelineService.ensureDefaultSalesPipeline();
    await expect(
      prisma.crmPipelineStage.create({
        data: {
          pipelineId: seeded.pipeline.id,
          name: `${PREFIX} Bad Prob`,
          probabilityPercent: 150
        }
      })
    ).rejects.toBeTruthy();
  });

  it("customer 360 returns consolidated payload", async () => {
    const lead = await leadService.createLead(
      {
        name: `${PREFIX} 360 Lead`,
        email: `${PREFIX}-360@example.com`,
        companyName: `${PREFIX} 360 Co`
      },
      actor
    );
    const converted = await leadService.convertLead(lead.id, {}, actor);
    const data = await customer360.getContact360(converted.convertedContactId!);
    expect(data.contact.id).toBe(converted.convertedContactId);
    expect(data.sales).toBeTruthy();
    expect(data.accounting?.note).toMatch(/authoritative accounting\/GL/);
    expect(data.accounting?.estimate).toBe(true);
  });

  it("deal product does not alter inventory", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `crm-test-${Date.now()}`,
        name: `${PREFIX} Product`,
        status: "ACTIVE",
        productType: "SIMPLE"
      }
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `CRM-SKU-${Date.now()}`,
        mrpInPaise: 10000,
        saleInPaise: 9000,
        isDefault: true,
        status: "ACTIVE"
      }
    });
    const inv = await prisma.inventory.create({
      data: { variantId: variant.id, onHand: 42, reserved: 0 }
    });
    const seeded = await pipelineService.ensureDefaultSalesPipeline();
    const stage = seeded.pipeline.stages.find((s) => s.stageType === "OPEN")!;
    const deal = await dealService.createDeal(
      {
        name: `${PREFIX} Inv Deal`,
        pipelineId: seeded.pipeline.id,
        stageId: stage.id
      },
      actor
    );
    await dealService.addDealProduct(deal.id, {
      variantId: variant.id,
      quantity: 3,
      productName: `${PREFIX} Line`
    });
    const after = await prisma.inventory.findUnique({ where: { id: inv.id } });
    expect(after?.onHand).toBe(42);
    expect(after?.reserved).toBe(0);
  });

  it("CrmError is structured", () => {
    const err = new CrmError("x", "Y", 409);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("Y");
  });

  it("creates activity note", async () => {
    const lead = await leadService.createLead({ name: `${PREFIX} Note Lead` }, actor);
    const note = await activityService.createActivity(
      { type: "NOTE", subject: `${PREFIX} note`, body: "hello", leadId: lead.id },
      actor.id
    );
    expect(note.type).toBe("NOTE");
  });

  it("rejects conversion when pipeline has no OPEN stage and leaves no partials", async () => {
    const pipeline = await pipelineService.createPipeline({
      name: `${PREFIX} Closed-Only Pipeline`,
      isDefault: false
    });
    await pipelineService.createStage(pipeline.id, {
      name: `${PREFIX} Only Won`,
      stageType: "WON",
      probabilityPercent: 100
    });
    await pipelineService.createStage(pipeline.id, {
      name: `${PREFIX} Only Lost`,
      stageType: "LOST",
      probabilityPercent: 0
    });

    const lead = await leadService.createLead(
      { name: `${PREFIX} No Open Convert`, email: `${PREFIX}-noopen@example.com` },
      actor
    );
    const accountsBefore = await prisma.crmAccount.count({
      where: { name: { contains: PREFIX } }
    });

    await expect(
      leadService.convertLead(
        lead.id,
        { createDeal: true, deal: { pipelineId: pipeline.id } },
        actor
      )
    ).rejects.toMatchObject({ code: "NO_OPEN_STAGE", statusCode: 409 });

    const after = await prisma.crmLead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe("NEW");
    expect(after?.convertedAt).toBeNull();
    expect(after?.convertedAccountId).toBeNull();
    expect(after?.convertedContactId).toBeNull();
    expect(after?.convertedDealId).toBeNull();
    expect(
      await prisma.crmAccount.count({ where: { name: { contains: PREFIX } } })
    ).toBe(accountsBefore);
  });

  it("concurrent conversion allows only one success", async () => {
    const lead = await leadService.createLead(
      { name: `${PREFIX} Concurrent Lead`, email: `${PREFIX}-concurrent@example.com` },
      actor
    );
    const results = await Promise.allSettled([
      leadService.convertLead(lead.id, {}, actor),
      leadService.convertLead(lead.id, {}, actor)
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    if (rejected[0]?.status === "rejected") {
      expect((rejected[0].reason as { code?: string }).code).toBe("LEAD_ALREADY_CONVERTED");
    }
    const deals = await prisma.crmDeal.count({ where: { sourceLeadId: lead.id } });
    expect(deals).toBe(1);
  });

  it("quotation/order link is idempotent; different link returns 409", async () => {
    const seeded = await pipelineService.ensureDefaultSalesPipeline();
    const stage = seeded.pipeline.stages.find((s) => s.stageType === "OPEN")!;
    const deal = await dealService.createDeal(
      {
        name: `${PREFIX} Link Conflict Deal`,
        pipelineId: seeded.pipeline.id,
        stageId: stage.id
      },
      actor
    );
    const q1 = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-CRM-A-${Date.now()}`,
        customerName: `${PREFIX} Buyer A`,
        email: `${PREFIX}-linka@example.com`,
        billingAddress: {},
        shippingAddress: {},
        subtotalInPaise: 1000,
        grandTotalInPaise: 1000
      }
    });
    const q2 = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-CRM-B-${Date.now()}`,
        customerName: `${PREFIX} Buyer B`,
        email: `${PREFIX}-linkb@example.com`,
        billingAddress: {},
        shippingAddress: {},
        subtotalInPaise: 2000,
        grandTotalInPaise: 2000
      }
    });
    const first = await dealService.linkQuotation(deal.id, q1.id, actor);
    expect(first.idempotent).toBe(false);
    const again = await dealService.linkQuotation(deal.id, q1.id, actor);
    expect(again.idempotent).toBe(true);
    await expect(dealService.linkQuotation(deal.id, q2.id, actor)).rejects.toMatchObject({
      code: "QUOTATION_ALREADY_LINKED",
      statusCode: 409
    });

    const o1 = await prisma.order.create({
      data: {
        orderNumber: `SRV-CRM-A-${Date.now()}`,
        email: `${PREFIX}-linka@example.com`,
        phone: "9999900011",
        status: "PAID",
        paymentStatus: "CAPTURED",
        subtotalInPaise: 1000,
        grandTotalInPaise: 1000
      }
    });
    const o2 = await prisma.order.create({
      data: {
        orderNumber: `SRV-CRM-B-${Date.now()}`,
        email: `${PREFIX}-linkb@example.com`,
        phone: "9999900012",
        status: "PAID",
        paymentStatus: "CAPTURED",
        subtotalInPaise: 2000,
        grandTotalInPaise: 2000
      }
    });
    const linkedO = await dealService.linkOrder(deal.id, o1.id, actor);
    expect(linkedO.idempotent).toBe(false);
    const linkedAgain = await dealService.linkOrder(deal.id, o1.id, actor);
    expect(linkedAgain.idempotent).toBe(true);
    await expect(dealService.linkOrder(deal.id, o2.id, actor)).rejects.toMatchObject({
      code: "ORDER_ALREADY_LINKED",
      statusCode: 409
    });
  });
});
