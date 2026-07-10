-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN "pollAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_generation_jobs" ADD COLUMN "lastPolledAt" TIMESTAMP(3);
ALTER TABLE "ai_generation_jobs" ADD COLUMN "pollErrorCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_generation_jobs" ADD COLUMN "staleReminderSent" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ai_generation_jobs_status_createdAt_idx" ON "ai_generation_jobs"("status", "createdAt");
