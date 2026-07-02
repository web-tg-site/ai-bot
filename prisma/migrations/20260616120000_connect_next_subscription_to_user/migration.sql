-- AlterTable
ALTER TABLE "next_subscription_of_users" DROP COLUMN "userI",
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "next_subscription_of_users_userId_key" ON "next_subscription_of_users"("userId");

-- AddForeignKey
ALTER TABLE "next_subscription_of_users" ADD CONSTRAINT "next_subscription_of_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
