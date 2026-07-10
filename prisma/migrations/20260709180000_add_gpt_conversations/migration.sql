-- CreateTable
CREATE TABLE "gpt_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gpt_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gpt_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gpt_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gpt_conversations_userId_updatedAt_idx" ON "gpt_conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "gpt_messages_conversationId_createdAt_idx" ON "gpt_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "gpt_conversations" ADD CONSTRAINT "gpt_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpt_messages" ADD CONSTRAINT "gpt_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "gpt_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
