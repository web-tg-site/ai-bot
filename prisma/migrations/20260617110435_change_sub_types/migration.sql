/*
  Warnings:

  - The values [PREMIUM] on the enum `SubscribeType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SubscribeType_new" AS ENUM ('FREE', 'LITE', 'PRO', 'BUSINESS', 'NOT_SUBSCRIBED');
ALTER TABLE "public"."users" ALTER COLUMN "subscribeType" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "subscribeType" TYPE "SubscribeType_new" USING ("subscribeType"::text::"SubscribeType_new");
ALTER TABLE "users" ALTER COLUMN "lastSubscriptionType" TYPE "SubscribeType_new" USING ("lastSubscriptionType"::text::"SubscribeType_new");
ALTER TABLE "next_subscription_of_users" ALTER COLUMN "subType" TYPE "SubscribeType_new" USING ("subType"::text::"SubscribeType_new");
ALTER TYPE "SubscribeType" RENAME TO "SubscribeType_old";
ALTER TYPE "SubscribeType_new" RENAME TO "SubscribeType";
DROP TYPE "public"."SubscribeType_old";
ALTER TABLE "users" ALTER COLUMN "subscribeType" SET DEFAULT 'NOT_SUBSCRIBED';
COMMIT;
