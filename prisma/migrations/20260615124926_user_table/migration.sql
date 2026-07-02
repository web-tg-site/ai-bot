-- CreateEnum
CREATE TYPE "SubscribeType" AS ENUM ('FREE', 'PREMIUM', 'NOT_SUBSCRIBED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "subscribeType" "SubscribeType" NOT NULL DEFAULT 'NOT_SUBSCRIBED',
    "subscriptionEndsAt" TIMESTAMP(3),
    "isSubscriptionActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");
