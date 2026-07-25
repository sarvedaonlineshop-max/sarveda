-- CreateTable
CREATE TABLE "AdminActivityLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActivityLog_createdAt_idx" ON "AdminActivityLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActivityLog_actorUserId_createdAt_idx" ON "AdminActivityLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActivityLog_resource_createdAt_idx" ON "AdminActivityLog"("resource", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminActivityLog_action_createdAt_idx" ON "AdminActivityLog"("action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AdminActivityLog" ADD CONSTRAINT "AdminActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
