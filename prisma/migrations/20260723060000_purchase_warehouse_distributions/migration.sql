ALTER TYPE "InventoryMovementType"
ADD VALUE IF NOT EXISTS 'PURCHASE_CANCEL_OUT';

INSERT INTO "purchase_detail_warehouses" (
    "id",
    "purchaseDetailId",
    "warehouseId",
    "quantity",
    "createdAt",
    "updatedAt"
)
SELECT
    'pdw_default_' || detail."id",
    detail."id",
    default_warehouse."id",
    detail."quantity",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "purchase_details" detail
CROSS JOIN LATERAL (
    SELECT warehouse."id"
    FROM "warehouses" warehouse
    WHERE warehouse."isDefault" = true
      AND warehouse."isActive" = true
    ORDER BY warehouse."createdAt" ASC
    LIMIT 1
) default_warehouse
WHERE NOT EXISTS (
    SELECT 1
    FROM "purchase_detail_warehouses" distribution
    WHERE distribution."purchaseDetailId" = detail."id"
);
