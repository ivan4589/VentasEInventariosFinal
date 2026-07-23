CREATE TYPE "WarehouseTransferStatus"
AS ENUM ('COMPLETED', 'CANCELLED');

CREATE TYPE "InventoryMovementType" AS ENUM (
    'INITIAL_STOCK',
    'PURCHASE_IN',
    'SALE_OUT',
    'SALE_RETURN_IN',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'TRANSFER_CANCEL_IN',
    'TRANSFER_CANCEL_OUT',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT'
);

CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_stocks" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserveQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_stocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_detail_warehouses" (
    "id" TEXT NOT NULL,
    "purchaseDetailId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_detail_warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_transfers" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "originWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "WarehouseTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "observations" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_transfer_details" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_transfer_details_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" INTEGER,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousStock" DOUBLE PRECISION NOT NULL,
    "newStock" DOUBLE PRECISION NOT NULL,
    "referenceId" TEXT,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warehouses_name_key"
ON "warehouses"("name");

CREATE UNIQUE INDEX "warehouses_code_key"
ON "warehouses"("code");

CREATE UNIQUE INDEX "warehouse_stocks_warehouseId_productId_key"
ON "warehouse_stocks"("warehouseId", "productId");

CREATE INDEX "warehouse_stocks_warehouseId_idx"
ON "warehouse_stocks"("warehouseId");

CREATE INDEX "warehouse_stocks_productId_idx"
ON "warehouse_stocks"("productId");

CREATE UNIQUE INDEX "purchase_detail_warehouses_purchaseDetailId_warehouseId_key"
ON "purchase_detail_warehouses"("purchaseDetailId", "warehouseId");

CREATE INDEX "purchase_detail_warehouses_purchaseDetailId_idx"
ON "purchase_detail_warehouses"("purchaseDetailId");

CREATE INDEX "purchase_detail_warehouses_warehouseId_idx"
ON "purchase_detail_warehouses"("warehouseId");

CREATE UNIQUE INDEX "warehouse_transfers_transferNumber_key"
ON "warehouse_transfers"("transferNumber");

CREATE INDEX "warehouse_transfers_originWarehouseId_idx"
ON "warehouse_transfers"("originWarehouseId");

CREATE INDEX "warehouse_transfers_destinationWarehouseId_idx"
ON "warehouse_transfers"("destinationWarehouseId");

CREATE INDEX "warehouse_transfers_userId_idx"
ON "warehouse_transfers"("userId");

CREATE INDEX "warehouse_transfers_transferredAt_idx"
ON "warehouse_transfers"("transferredAt");

CREATE UNIQUE INDEX "warehouse_transfer_details_transferId_productId_key"
ON "warehouse_transfer_details"("transferId", "productId");

CREATE INDEX "warehouse_transfer_details_transferId_idx"
ON "warehouse_transfer_details"("transferId");

CREATE INDEX "warehouse_transfer_details_productId_idx"
ON "warehouse_transfer_details"("productId");

CREATE INDEX "inventory_movements_warehouseId_idx"
ON "inventory_movements"("warehouseId");

CREATE INDEX "inventory_movements_productId_idx"
ON "inventory_movements"("productId");

CREATE INDEX "inventory_movements_userId_idx"
ON "inventory_movements"("userId");

CREATE INDEX "inventory_movements_createdAt_idx"
ON "inventory_movements"("createdAt");

ALTER TABLE "warehouse_stocks"
ADD CONSTRAINT "warehouse_stocks_warehouseId_fkey"
FOREIGN KEY ("warehouseId")
REFERENCES "warehouses"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "warehouse_stocks"
ADD CONSTRAINT "warehouse_stocks_productId_fkey"
FOREIGN KEY ("productId")
REFERENCES "Product"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "purchase_detail_warehouses"
ADD CONSTRAINT "purchase_detail_warehouses_purchaseDetailId_fkey"
FOREIGN KEY ("purchaseDetailId")
REFERENCES "purchase_details"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "purchase_detail_warehouses"
ADD CONSTRAINT "purchase_detail_warehouses_warehouseId_fkey"
FOREIGN KEY ("warehouseId")
REFERENCES "warehouses"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "warehouse_transfers"
ADD CONSTRAINT "warehouse_transfers_originWarehouseId_fkey"
FOREIGN KEY ("originWarehouseId")
REFERENCES "warehouses"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "warehouse_transfers"
ADD CONSTRAINT "warehouse_transfers_destinationWarehouseId_fkey"
FOREIGN KEY ("destinationWarehouseId")
REFERENCES "warehouses"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "warehouse_transfers"
ADD CONSTRAINT "warehouse_transfers_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "warehouse_transfer_details"
ADD CONSTRAINT "warehouse_transfer_details_transferId_fkey"
FOREIGN KEY ("transferId")
REFERENCES "warehouse_transfers"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "warehouse_transfer_details"
ADD CONSTRAINT "warehouse_transfer_details_productId_fkey"
FOREIGN KEY ("productId")
REFERENCES "Product"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_warehouseId_fkey"
FOREIGN KEY ("warehouseId")
REFERENCES "warehouses"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_productId_fkey"
FOREIGN KEY ("productId")
REFERENCES "Product"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "inventory_movements"
ADD CONSTRAINT "inventory_movements_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

INSERT INTO "warehouses" (
    "id",
    "name",
    "code",
    "description",
    "isActive",
    "isDefault",
    "createdAt",
    "updatedAt"
)
VALUES
(
    'warehouse_central',
    'Almacén Central',
    'CENTRAL',
    'Almacén utilizado para las ventas',
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'warehouse_deposito',
    'Depósito',
    'DEPOSITO',
    'Depósito para acopio de productos',
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

INSERT INTO "warehouse_stocks" (
    "id",
    "warehouseId",
    "productId",
    "stock",
    "reservedStock",
    "minStock",
    "reserveQuantity",
    "createdAt",
    "updatedAt"
)
SELECT
    'ws_central_' || p."id",
    'warehouse_central',
    p."id",
    p."stock",
    p."reservedStock",
    p."minStock",
    p."reserveQuantity",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product" p;

INSERT INTO "warehouse_stocks" (
    "id",
    "warehouseId",
    "productId",
    "stock",
    "reservedStock",
    "minStock",
    "reserveQuantity",
    "createdAt",
    "updatedAt"
)
SELECT
    'ws_deposito_' || p."id",
    'warehouse_deposito',
    p."id",
    0,
    0,
    0,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Product" p;

INSERT INTO "inventory_movements" (
    "id",
    "warehouseId",
    "productId",
    "userId",
    "type",
    "quantity",
    "previousStock",
    "newStock",
    "referenceId",
    "observations",
    "createdAt"
)
SELECT
    'im_initial_' || p."id",
    'warehouse_central',
    p."id",
    NULL,
    'INITIAL_STOCK'::"InventoryMovementType",
    p."stock",
    0,
    p."stock",
    NULL,
    'Migración del stock existente al Almacén Central',
    CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."stock" <> 0;