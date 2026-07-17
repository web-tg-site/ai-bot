-- AlterTable
ALTER TABLE "gpt_conversations" ADD COLUMN "toolId" TEXT NOT NULL DEFAULT 'gpt';

-- CreateIndex
CREATE INDEX "gpt_conversations_userId_toolId_updatedAt_idx" ON "gpt_conversations"("userId", "toolId", "updatedAt");
