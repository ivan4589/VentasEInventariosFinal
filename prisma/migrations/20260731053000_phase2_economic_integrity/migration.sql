-- Phase 2: economic integrity and traceability
ALTER TABLE "purchases"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "purchase_providers"
  ADD COLUMN IF NOT EXISTS "receivedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "sale_returns"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT,
  ADD COLUMN IF NOT EXISTS "isReversal" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "warehouse_transfers"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "purchases_idempotencyKey_key" ON "purchases"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_idempotencyKey_key" ON "sales"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sale_returns_idempotencyKey_key" ON "sale_returns"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_reversalOfId_key" ON "payments"("reversalOfId") WHERE "reversalOfId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_transfers_idempotencyKey_key" ON "warehouse_transfers"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "economic_audit_logs" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operationKey" TEXT,
  "reason" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economic_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "economic_audit_logs_operationKey_key" ON "economic_audit_logs"("operationKey") WHERE "operationKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "economic_audit_logs_userId_createdAt_idx" ON "economic_audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "economic_audit_logs_entityType_entityId_idx" ON "economic_audit_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "economic_audit_logs_action_createdAt_idx" ON "economic_audit_logs"("action", "createdAt");
DO $$ BEGIN
  ALTER TABLE "economic_audit_logs" ADD CONSTRAINT "economic_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "warehouse_stocks" ADD CONSTRAINT "warehouse_stocks_non_negative_check" CHECK ("stock" >= 0 AND "reservedStock" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "products_non_negative_stock_check" CHECK ("stock" >= 0 AND "reservedStock" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_non_zero_amount_check" CHECK ("amount" <> 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
