-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CRYPTO_PAY', 'ANTILOPAY');

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "email" TEXT;

-- AlterTable payments: add new columns
ALTER TABLE "payments" ADD COLUMN "provider" "PaymentProvider";
ALTER TABLE "payments" ADD COLUMN "antilopayPaymentId" TEXT;
ALTER TABLE "payments" ADD COLUMN "orderId" TEXT;
ALTER TABLE "payments" ADD COLUMN "amountRub" TEXT;

-- Backfill existing crypto payments
UPDATE "payments"
SET
  "provider" = 'CRYPTO_PAY',
  "orderId" = "payload";

-- Enforce NOT NULL after backfill
ALTER TABLE "payments" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "orderId" SET NOT NULL;

-- Make crypto-only fields optional
ALTER TABLE "payments" ALTER COLUMN "cryptoPayInvoiceId" DROP NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "amountUsd" DROP NOT NULL;

-- Drop legacy payload column
DROP INDEX IF EXISTS "payments_payload_key";
ALTER TABLE "payments" DROP COLUMN "payload";

-- CreateIndex
CREATE UNIQUE INDEX "payments_antilopayPaymentId_key" ON "payments"("antilopayPaymentId");
CREATE UNIQUE INDEX "payments_orderId_key" ON "payments"("orderId");
