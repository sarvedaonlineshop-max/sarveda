-- CreateTable
CREATE TABLE "BlogComment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogCommentSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogCommentSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogComment_postId_createdAt_idx" ON "BlogComment"("postId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BlogCommentSubscription_postId_idx" ON "BlogCommentSubscription"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogCommentSubscription_postId_email_key" ON "BlogCommentSubscription"("postId", "email");

-- AddForeignKey
ALTER TABLE "BlogComment" ADD CONSTRAINT "BlogComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogComment" ADD CONSTRAINT "BlogComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogCommentSubscription" ADD CONSTRAINT "BlogCommentSubscription_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
