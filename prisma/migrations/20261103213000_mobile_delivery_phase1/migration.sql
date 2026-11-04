-- Opt-in delivery tracking. Existing web sales keep deliveryMode = false.
ALTER TABLE "sales"
  ADD COLUMN "deliveryMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deliveryRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "sale_delivery_events" (
  "id" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_delivery_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_delivery_events_kind_check" CHECK ("kind" IN ('DELIVER','RETURN')),
  CONSTRAINT "sale_delivery_events_positive_quantity" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "sale_delivery_events_operationKey_key" ON "sale_delivery_events"("operationKey");
CREATE INDEX "sale_delivery_events_saleId_productId_idx" ON "sale_delivery_events"("saleId","productId");
CREATE INDEX "sale_delivery_events_saleId_createdAt_idx" ON "sale_delivery_events"("saleId","createdAt");
ALTER TABLE "sale_delivery_events" ADD CONSTRAINT "sale_delivery_events_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_delivery_events" ADD CONSTRAINT "sale_delivery_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_delivery_events" ADD CONSTRAINT "sale_delivery_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
