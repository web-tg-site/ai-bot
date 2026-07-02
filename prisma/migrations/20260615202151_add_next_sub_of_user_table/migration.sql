-- CreateTable
CREATE TABLE "next_subscription_of_users" (
    "id" TEXT NOT NULL,
    "userI" TEXT NOT NULL,
    "subType" "SubscribeType" NOT NULL,
    "subPlan" "SubscribePlan" NOT NULL,
    "subscriptionEndsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "next_subscription_of_users_pkey" PRIMARY KEY ("id")
);
