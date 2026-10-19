-- Additive migration: does not modify existing sales or stock.
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'BONUS_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'BONUS_CANCEL_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'BONUS_RETURN_IN';

CREATE TABLE "bonus_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subCategoryId" TEXT NOT NULL,
  "minimumQuantity" INTEGER NOT NULL,
  "bonusQuantity" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bonus_rules_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bonus_rules_quantities_check" CHECK ("minimumQuantity" > 0 AND "bonusQuantity" > 0),
  CONSTRAINT "bonus_rules_dates_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom")
);
CREATE INDEX "bonus_rules_subCategoryId_isActive_idx" ON "bonus_rules"("subCategoryId","isActive");
CREATE UNIQUE INDEX "bonus_rules_one_active_per_subcategory" ON "bonus_rules"("subCategoryId") WHERE "isActive" = true;

CREATE TABLE "sale_bonus_details" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "subCategoryId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "minimumQuantity" INTEGER NOT NULL,
  "bonusQuantity" INTEGER NOT NULL,
  "unitCostSnapshot" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_bonus_details_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_bonus_details_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_bonus_details_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_bonus_details_quantities_check" CHECK ("quantity" > 0 AND "returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity")
);
CREATE INDEX "sale_bonus_details_saleId_idx" ON "sale_bonus_details"("saleId");
CREATE INDEX "sale_bonus_details_productId_idx" ON "sale_bonus_details"("productId");
CREATE INDEX "sale_bonus_details_subCategoryId_idx" ON "sale_bonus_details"("subCategoryId");
