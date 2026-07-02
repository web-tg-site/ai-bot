-- CreateEnum
CREATE TYPE "UserLanguage" AS ENUM ('RU', 'EN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "language" "UserLanguage" NOT NULL DEFAULT 'RU';
