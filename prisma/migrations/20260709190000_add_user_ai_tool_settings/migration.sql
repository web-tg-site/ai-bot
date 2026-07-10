-- CreateTable
CREATE TABLE "user_ai_tool_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ai_tool_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_ai_tool_settings_userId_toolId_key" ON "user_ai_tool_settings"("userId", "toolId");

-- AddForeignKey
ALTER TABLE "user_ai_tool_settings" ADD CONSTRAINT "user_ai_tool_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
