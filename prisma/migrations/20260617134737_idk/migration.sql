-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastTokenIssueAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStartsAt" TIMESTAMP(3);
