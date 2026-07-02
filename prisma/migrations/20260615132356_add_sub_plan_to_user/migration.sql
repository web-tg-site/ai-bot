-- CreateEnum
CREATE TYPE "SubscribePlan" AS ENUM ('MONTHLY', 'THREE_MONTHS', 'SIX_MONTHS', 'YEARLY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscribePlan" "SubscribePlan";
