import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { crmBadRequest, crmConflict, crmNotFound } from "./crm-errors";
import { DEFAULT_SALES_STAGES } from "./crm.utils";

export async function listPipelines(opts?: { includeInactive?: boolean }) {
  return prisma.crmPipeline.findMany({
    where: opts?.includeInactive ? undefined : { isActive: true },
    include: {
      stages: {
        where: opts?.includeInactive ? undefined : { isActive: true },
        orderBy: { position: "asc" }
      }
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }]
  });
}

export async function getPipeline(id: string) {
  const pipeline = await prisma.crmPipeline.findUnique({
    where: { id },
    include: { stages: { orderBy: { position: "asc" } } }
  });
  if (!pipeline) throw crmNotFound("Pipeline");
  return pipeline;
}

export async function createPipeline(input: {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.crmPipeline.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
    }
    return tx.crmPipeline.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true
      },
      include: { stages: { orderBy: { position: "asc" } } }
    });
  });
}

export async function updatePipeline(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  }
) {
  await getPipeline(id);
  return prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.crmPipeline.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false }
      });
    }
    return tx.crmPipeline.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      },
      include: { stages: { orderBy: { position: "asc" } } }
    });
  });
}

export async function createStage(
  pipelineId: string,
  input: {
    name: string;
    stageType?: "OPEN" | "WON" | "LOST";
    position?: number;
    probabilityPercent?: number;
    isActive?: boolean;
  }
) {
  await getPipeline(pipelineId);
  const maxPos = await prisma.crmPipelineStage.aggregate({
    where: { pipelineId },
    _max: { position: true }
  });
  try {
    return await prisma.crmPipelineStage.create({
      data: {
        pipelineId,
        name: input.name,
        stageType: input.stageType ?? "OPEN",
        position: input.position ?? (maxPos._max.position ?? -1) + 1,
        probabilityPercent: input.probabilityPercent ?? 0,
        isActive: input.isActive ?? true
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw crmConflict("Stage name already exists on this pipeline", "STAGE_NAME_EXISTS");
    }
    throw err;
  }
}

export async function updateStage(
  stageId: string,
  input: {
    name?: string;
    stageType?: "OPEN" | "WON" | "LOST";
    position?: number;
    probabilityPercent?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.crmPipelineStage.findUnique({ where: { id: stageId } });
  if (!existing) throw crmNotFound("Stage");
  try {
    return await prisma.crmPipelineStage.update({
      where: { id: stageId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.stageType !== undefined ? { stageType: input.stageType } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.probabilityPercent !== undefined
          ? { probabilityPercent: input.probabilityPercent }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      }
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw crmConflict("Stage name already exists on this pipeline", "STAGE_NAME_EXISTS");
    }
    throw err;
  }
}

export async function deleteStage(stageId: string) {
  const existing = await prisma.crmPipelineStage.findUnique({ where: { id: stageId } });
  if (!existing) throw crmNotFound("Stage");
  const dealCount = await prisma.crmDeal.count({ where: { stageId } });
  if (dealCount > 0) {
    throw crmConflict(
      `Cannot delete stage while ${dealCount} deal(s) reference it`,
      "STAGE_HAS_DEALS"
    );
  }
  await prisma.crmPipelineStage.delete({ where: { id: stageId } });
  return { deleted: true, id: stageId };
}

/** Idempotent default Sales Pipeline seed for empty CRM DBs. */
export async function ensureDefaultSalesPipeline() {
  const existing = await prisma.crmPipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { position: "asc" } } }
  });
  if (existing) return { created: false, pipeline: existing };

  const any = await prisma.crmPipeline.findFirst({
    include: { stages: { orderBy: { position: "asc" } } }
  });
  if (any) {
    return { created: false, pipeline: any };
  }

  const pipeline = await prisma.$transaction(async (tx) => {
    const p = await tx.crmPipeline.create({
      data: {
        name: "Sales Pipeline",
        description: "Default CRM sales pipeline",
        isDefault: true,
        isActive: true
      }
    });
    await tx.crmPipelineStage.createMany({
      data: DEFAULT_SALES_STAGES.map((s) => ({
        pipelineId: p.id,
        name: s.name,
        stageType: s.stageType,
        position: s.position,
        probabilityPercent: s.probabilityPercent,
        isActive: true
      }))
    });
    return tx.crmPipeline.findUniqueOrThrow({
      where: { id: p.id },
      include: { stages: { orderBy: { position: "asc" } } }
    });
  });

  return { created: true, pipeline };
}

export async function requireDefaultPipelineStage(
  tx: Prisma.TransactionClient,
  pipelineId?: string | null,
  stageId?: string | null
) {
  // Explicit pair: must belong together AND be an active OPEN stage for conversion/defaulting.
  if (pipelineId && stageId) {
    const stage = await tx.crmPipelineStage.findFirst({
      where: { id: stageId, pipelineId },
      include: { pipeline: true }
    });
    if (!stage) throw crmBadRequest("stageId does not belong to pipelineId");
    if (!stage.isActive || stage.stageType !== "OPEN") {
      throw crmConflict(
        "Conversion requires an active OPEN pipeline stage",
        "NO_OPEN_STAGE"
      );
    }
    return stage;
  }

  const pipeline =
    (pipelineId
      ? await tx.crmPipeline.findUnique({ where: { id: pipelineId } })
      : await tx.crmPipeline.findFirst({ where: { isDefault: true, isActive: true } })) ??
    (await tx.crmPipeline.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } }));

  if (!pipeline) throw crmBadRequest("No CRM pipeline configured — seed a default pipeline first");
  if (!pipeline.isActive) {
    throw crmConflict("Selected CRM pipeline is inactive", "PIPELINE_INACTIVE");
  }

  if (stageId) {
    const stage = await tx.crmPipelineStage.findFirst({
      where: { id: stageId, pipelineId: pipeline.id },
      include: { pipeline: true }
    });
    if (!stage) throw crmBadRequest("stageId does not belong to selected pipeline");
    if (!stage.isActive || stage.stageType !== "OPEN") {
      throw crmConflict(
        "Conversion requires an active OPEN pipeline stage",
        "NO_OPEN_STAGE"
      );
    }
    return stage;
  }

  const openStage = await tx.crmPipelineStage.findFirst({
    where: { pipelineId: pipeline.id, isActive: true, stageType: "OPEN" },
    orderBy: { position: "asc" },
    include: { pipeline: true }
  });

  if (!openStage) {
    throw crmConflict(
      "No active OPEN stage available on the selected pipeline",
      "NO_OPEN_STAGE"
    );
  }

  return openStage;
}
