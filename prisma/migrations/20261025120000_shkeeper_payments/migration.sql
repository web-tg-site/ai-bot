-- Preserve CRYPTO_PAY and its historical invoice IDs. Only new payments use SHKEEPER.
ALTER TYPE "PaymentProvider" ADD VALUE 'SHKEEPER';

ALTER TABLE "payments"
  ADD COLUMN "shkeeperInvoiceId" TEXT,
  ADD COLUMN "shkeeperNetwork" TEXT,
  ADD COLUMN "shkeeperAddress" TEXT,
  ADD COLUMN "shkeeperAmountCrypto" TEXT,
  ADD COLUMN "shkeeperReceivedCrypto" TEXT,
  ADD COLUMN "shkeeperLastCheckedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "payments_shkeeperInvoiceId_key" ON "payments"("shkeeperInvoiceId");
CREATE INDEX "payments_provider_status_shkeeperLastCheckedAt_createdAt_idx"
  ON "payments"("provider", "status", "shkeeperLastCheckedAt", "createdAt");
