-- CreateTable
CREATE TABLE "saved_prompts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_prompts_userId_createdAt_idx" ON "saved_prompts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
