-- Restore the purchase price snapshot fields removed by the warehouse migration.
-- Existing rows remain compatible because pricingConfigured defaults to false
-- and the proposed sale prices are nullable.
ALTER TABLE "purchase_details"
ADD COLUMN "pricingConfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priceNormal" DOUBLE PRECISION,
ADD COLUMN "priceCamino" DOUBLE PRECISION,
ADD COLUMN "priceEspecial" DOUBLE PRECISION,
ADD COLUMN "priceMayorista" DOUBLE PRECISION,
ADD COLUMN "minQuantityWholesale" INTEGER;
