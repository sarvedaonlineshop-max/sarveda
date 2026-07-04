-- CreateTable
CREATE TABLE "AppVersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform" TEXT NOT NULL DEFAULT 'android',
    "version" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "apkUrl" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "releaseNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppVersion_platform_isActive_idx" ON "AppVersion"("platform", "isActive");
