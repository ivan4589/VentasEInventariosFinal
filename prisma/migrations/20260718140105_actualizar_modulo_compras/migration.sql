/*
  Warnings:

  - You are about to drop the column `purchaseId` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `providerId` on the `purchases` table. All the data in the column will be lost.
  - Added the required column `categoryId` to the `purchase_details` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchaseProviderId` to the `purchase_details` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PurchaseProviderStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "purchase_details" DROP CONSTRAINT "purchase_details_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_providerId_fkey";

-- AlterTable
ALTER TABLE "purchase_details" DROP COLUMN "purchaseId",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "purchaseProviderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "providerId",
ALTER COLUMN "total" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase_providers" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "PurchaseProviderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_providers_purchaseId_idx" ON "purchase_providers"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_providers_providerId_idx" ON "purchase_providers"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_providers_purchaseId_providerId_key" ON "purchase_providers"("purchaseId", "providerId");

-- CreateIndex
CREATE INDEX "purchase_details_purchaseProviderId_idx" ON "purchase_details"("purchaseProviderId");

-- CreateIndex
CREATE INDEX "purchase_details_productId_idx" ON "purchase_details"("productId");

-- CreateIndex
CREATE INDEX "purchase_details_categoryId_idx" ON "purchase_details"("categoryId");

-- AddForeignKey
ALTER TABLE "purchase_providers" ADD CONSTRAINT "purchase_providers_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_providers" ADD CONSTRAINT "purchase_providers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_purchaseProviderId_fkey" FOREIGN KEY ("purchaseProviderId") REFERENCES "purchase_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
