ALTER TABLE "sales"
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3);

UPDATE "sales" AS sale
SET "confirmedAt" = COALESCE(
  (
    SELECT MIN(movement."createdAt")
    FROM "inventory_movements" AS movement
    WHERE movement."referenceId" = sale."id"
      AND movement."type" = 'SALE_OUT'
  ),
  sale."date"
)
WHERE sale."status" = 'CONFIRMED';

UPDATE "sales" AS sale
SET "cancelledAt" = COALESCE(
  (
    SELECT MIN(movement."createdAt")
    FROM "inventory_movements" AS movement
    WHERE movement."referenceId" = sale."id"
      AND movement."type" = 'SALE_RETURN_IN'
      AND movement."observations" LIKE 'Anulación de venta%'
  ),
  sale."updatedAt",
  sale."date"
)
WHERE sale."status" = 'CANCELLED';

CREATE INDEX "sales_confirmedAt_idx" ON "sales"("confirmedAt");
CREATE INDEX "sales_cancelledAt_idx" ON "sales"("cancelledAt");

UPDATE "Product" AS product
SET "purchasePrice" = weighted."weightedCost"
FROM (
  SELECT
    detail."productId",
    SUM(detail."quantity" * detail."unitPrice") /
      NULLIF(SUM(detail."quantity"), 0) AS "weightedCost"
  FROM "purchase_details" AS detail
  INNER JOIN "purchase_providers" AS purchase_provider
    ON purchase_provider."id" = detail."purchaseProviderId"
  WHERE purchase_provider."status" = 'RECEIVED'
  GROUP BY detail."productId"
) AS weighted
WHERE product."id" = weighted."productId";
