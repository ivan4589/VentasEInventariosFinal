/*
  Warnings:

  - You are about to drop the column `minQuantityWholesale` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `priceCamino` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `priceEspecial` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `priceMayorista` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `priceNormal` on the `purchase_details` table. All the data in the column will be lost.
  - You are about to drop the column `pricingConfigured` on the `purchase_details` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "purchase_details" DROP COLUMN "minQuantityWholesale",
DROP COLUMN "priceCamino",
DROP COLUMN "priceEspecial",
DROP COLUMN "priceMayorista",
DROP COLUMN "priceNormal",
DROP COLUMN "pricingConfigured";
