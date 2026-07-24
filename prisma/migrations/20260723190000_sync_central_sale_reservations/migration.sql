-- Synchronize reservations created by pending sales before sales started
-- writing directly to the Almacén Central stock record.
UPDATE "warehouse_stocks" AS stock
SET
    "reservedStock" = COALESCE((
        SELECT SUM(detail."quantity")
        FROM "sale_details" AS detail
        INNER JOIN "sales" AS sale
            ON sale."id" = detail."saleId"
        WHERE detail."productId" = stock."productId"
          AND sale."status" = 'PENDING'::"SaleStatus"
    ), 0),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE stock."warehouseId" = (
    SELECT warehouse."id"
    FROM "warehouses" AS warehouse
    WHERE warehouse."isDefault" = true
      AND warehouse."isActive" = true
    ORDER BY warehouse."createdAt" ASC
    LIMIT 1
);

-- Product keeps the global total for compatibility with the remaining
-- modules, including the same pending-sale reservation total.
UPDATE "Product" AS product
SET
    "reservedStock" = COALESCE((
        SELECT SUM(detail."quantity")
        FROM "sale_details" AS detail
        INNER JOIN "sales" AS sale
            ON sale."id" = detail."saleId"
        WHERE detail."productId" = product."id"
          AND sale."status" = 'PENDING'::"SaleStatus"
    ), 0),
    "updatedAt" = CURRENT_TIMESTAMP;
