-- AlterTable
ALTER TABLE "users" ADD COLUMN "autoModelFailover" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ai_generation_jobs" ADD COLUMN "failoverNotice" TEXT;
ALTER TABLE "ai_generation_jobs" ADD COLUMN "failoverFromToolId" TEXT;
ALTER TABLE "ai_generation_jobs" ADD COLUMN "failoverTriedToolIds" JSONB;
