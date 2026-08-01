-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN "notifyTelegram" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "ai_generation_jobs_userId_toolId_createdAt_idx" ON "ai_generation_jobs"("userId", "toolId", "createdAt");
