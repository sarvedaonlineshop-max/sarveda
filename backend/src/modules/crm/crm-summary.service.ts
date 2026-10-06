import { prisma } from "../../config/db";
import { userSummarySelect } from "./crm.utils";

export async function crmSummary() {
  const now = new Date();
  const [activeLeads, unassignedLeads, openDeals, wonDeals, openTasks, overdueTasks, stageCounts, stages, recentDeals] =
    await Promise.all([
      prisma.crmLead.count({ where: { status: { notIn: ["LOST", "UNQUALIFIED", "CONVERTED"] } } }),
      prisma.crmLead.count({
        where: { ownerUserId: null, status: { notIn: ["LOST", "UNQUALIFIED", "CONVERTED"] } }
      }),
      prisma.crmDeal.aggregate({
        where: { status: "OPEN" },
        _sum: { amountInPaise: true },
        _count: { id: true }
      }),
      prisma.crmDeal.aggregate({
        where: { status: "WON" },
        _sum: { amountInPaise: true },
        _count: { id: true }
      }),
      prisma.crmTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.crmTask.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } }
      }),
      prisma.crmDeal.groupBy({
        by: ["stageId"],
        where: { status: "OPEN" },
        _count: { id: true },
        _sum: { amountInPaise: true }
      }),
      prisma.crmPipelineStage.findMany({
        where: { isActive: true, pipeline: { isDefault: true } },
        orderBy: { position: "asc" },
        select: { id: true, name: true }
      }),
      prisma.crmDeal.findMany({
        where: { status: "OPEN" },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          id: true,
          name: true,
          stageId: true,
          amountInPaise: true,
          currency: true,
          account: { select: { name: true } },
          contact: { select: { displayName: true } },
          owner: { select: { name: true } }
        }
      })
    ]);

  const countByStage = new Map(stageCounts.map((row) => [row.stageId, row]));
  return {
    activeLeadCount: activeLeads,
    unassignedLeadCount: unassignedLeads,
    openDealCount: openDeals._count.id,
    openPipelineInPaise: openDeals._sum.amountInPaise ?? 0,
    wonDealCount: wonDeals._count.id,
    wonInPaise: wonDeals._sum.amountInPaise ?? 0,
    followUpOpenCount: openTasks,
    followUpOverdueCount: overdueTasks,
    stages: stages.map((stage) => {
      const row = countByStage.get(stage.id);
      return {
        id: stage.id,
        name: stage.name,
        count: row?._count.id ?? 0,
        amountInPaise: row?._sum.amountInPaise ?? 0,
        deals: recentDeals
          .filter((d) => d.stageId === stage.id)
          .slice(0, 3)
          .map((d) => ({
            id: d.id,
            name: d.name,
            amountInPaise: d.amountInPaise,
            currency: d.currency,
            who: d.account?.name || d.contact?.displayName || d.owner?.name || "Unassigned"
          }))
      };
    })
  };
}

export async function crmReport() {
  const now = new Date();
  const [grouped, overdueCount, overdue] = await Promise.all([
    prisma.crmLead.groupBy({
      by: ["source", "status"],
      _count: { id: true }
    }),
    prisma.crmTask.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } }
    }),
    prisma.crmTask.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      take: 25,
      select: {
        id: true,
        title: true,
        dueAt: true,
        priority: true,
        lead: { select: { id: true, name: true, leadNumber: true } },
        assignedTo: { select: userSummarySelect }
      }
    })
  ]);

  const sources = new Map<string, { source: string; leads: number; converted: number }>();
  let total = 0;
  let converted = 0;
  for (const row of grouped) {
    const bucket = sources.get(row.source) ?? { source: row.source, leads: 0, converted: 0 };
    bucket.leads += row._count.id;
    total += row._count.id;
    if (row.status === "CONVERTED") {
      bucket.converted += row._count.id;
      converted += row._count.id;
    }
    sources.set(row.source, bucket);
  }

  return {
    totalLeads: total,
    convertedLeads: converted,
    overdueCount,
    sources: [...sources.values()].sort((a, b) => b.leads - a.leads),
    overdueFollowUps: overdue
  };
}

export async function crmAssignees() {
  return prisma.user.findMany({
    where: { deletedAt: null, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 80
  });
}
