-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "ai_generation_jobs_userId_sessionId_createdAt_idx" ON "ai_generation_jobs"("userId", "sessionId", "createdAt");
