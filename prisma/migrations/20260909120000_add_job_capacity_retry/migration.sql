-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN "providerRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_generation_jobs" ADD COLUMN "providerRetryAt" TIMESTAMP(3);
