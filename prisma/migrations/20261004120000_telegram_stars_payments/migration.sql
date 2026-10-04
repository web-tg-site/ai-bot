-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'TELEGRAM_STARS';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "telegramPaymentChargeId" TEXT;
ALTER TABLE "payments" ADD COLUMN "amountStars" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "payments_telegramPaymentChargeId_key" ON "payments"("telegramPaymentChargeId");
