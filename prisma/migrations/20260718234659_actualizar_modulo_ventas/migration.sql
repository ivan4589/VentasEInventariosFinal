/*
  Warnings:

  - You are about to alter the column `quantity` on the `sale_details` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('CASH', 'CREDIT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "reservedStock" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_details" ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cancelledPdfUrl" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "saleType" "SaleType" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_details" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "saleDetailId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "sale_return_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");

-- CreateIndex
CREATE INDEX "sale_returns_userId_idx" ON "sale_returns"("userId");

-- CreateIndex
CREATE INDEX "sale_return_details_saleReturnId_idx" ON "sale_return_details"("saleReturnId");

-- CreateIndex
CREATE INDEX "sale_return_details_saleDetailId_idx" ON "sale_return_details"("saleDetailId");

-- CreateIndex
CREATE INDEX "sale_return_details_productId_idx" ON "sale_return_details"("productId");

-- CreateIndex
CREATE INDEX "sale_details_saleId_idx" ON "sale_details"("saleId");

-- CreateIndex
CREATE INDEX "sale_details_productId_idx" ON "sale_details"("productId");

-- CreateIndex
CREATE INDEX "sales_date_idx" ON "sales"("date");

-- CreateIndex
CREATE INDEX "sales_clientId_idx" ON "sales"("clientId");

-- CreateIndex
CREATE INDEX "sales_userId_idx" ON "sales"("userId");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_paymentStatus_idx" ON "sales"("paymentStatus");

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_details" ADD CONSTRAINT "sale_return_details_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_details" ADD CONSTRAINT "sale_return_details_saleDetailId_fkey" FOREIGN KEY ("saleDetailId") REFERENCES "sale_details"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_details" ADD CONSTRAINT "sale_return_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
