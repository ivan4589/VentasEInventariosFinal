from pathlib import Path

schema = Path('prisma/schema.prisma')
text = schema.read_text(encoding='utf-8')

if 'economicAuditLogs' not in text:
    text = text.replace(
        '  saleWhatsAppLogs              SaleWhatsAppLog[]\n',
        '  saleWhatsAppLogs              SaleWhatsAppLog[]\n  economicAuditLogs             EconomicAuditLog[]\n',
        1,
    )

if 'idempotencyKey String?        @unique' not in text:
    text = text.replace(
        'model Purchase {\n  id             String         @id @default(cuid())\n',
        'model Purchase {\n  id                 String         @id @default(cuid())\n  idempotencyKey     String?        @unique\n  cancelledById      Int?\n  cancellationReason String?\n',
        1,
    )

if 'receivedById' not in text:
    text = text.replace(
        'model PurchaseProvider {\n  id          String                 @id @default(cuid())\n',
        'model PurchaseProvider {\n  id                 String                 @id @default(cuid())\n  receivedById       Int?\n  cancelledById      Int?\n  cancellationReason String?\n',
        1,
    )

if 'confirmedById' not in text:
    text = text.replace(
        'model Sale {\n  id                   String               @id @default(cuid())\n',
        'model Sale {\n  id                   String               @id @default(cuid())\n  idempotencyKey       String?              @unique\n  confirmedById        Int?\n  cancelledById        Int?\n  cancellationReason   String?\n',
        1,
    )

if 'model SaleReturn {\n  id             String' not in text:
    text = text.replace(
        'model SaleReturn {\n  id           String             @id @default(cuid())\n',
        'model SaleReturn {\n  id             String             @id @default(cuid())\n  idempotencyKey String?            @unique\n',
        1,
    )

if 'reversalOfId' not in text:
    text = text.replace(
        'model Payment {\n  id           String        @id @default(cuid())\n',
        'model Payment {\n  id                 String        @id @default(cuid())\n  idempotencyKey     String?       @unique\n  reversalOfId       String?       @unique\n  isReversal         Boolean       @default(false)\n  cancelledAt        DateTime?\n  cancelledById      Int?\n  cancellationReason String?\n',
        1,
    )

if 'idempotencyKey         String?' not in text:
    text = text.replace(
        'model WarehouseTransfer {\n  id                     String                  @id @default(cuid())\n',
        'model WarehouseTransfer {\n  id                     String                  @id @default(cuid())\n  idempotencyKey         String?                 @unique\n  cancelledById          Int?\n  cancellationReason     String?\n',
        1,
    )

if 'model EconomicAuditLog {' not in text:
    marker = 'model ReportHistory {'
    model = '''model EconomicAuditLog {
  id           String   @id @default(cuid())
  userId       Int
  action       String
  entityType   String
  entityId     String
  operationKey String?  @unique
  reason       String?
  details      Json?
  createdAt    DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId, createdAt])
  @@index([entityType, entityId])
  @@index([action, createdAt])
  @@map("economic_audit_logs")
}

'''
    if marker not in text:
        raise SystemExit('No se encontró ReportHistory para insertar auditoría económica')
    text = text.replace(marker, model + marker, 1)

required = [
    'EconomicAuditLog[]',
    'model EconomicAuditLog {',
    'idempotencyKey       String?              @unique',
    'reversalOfId',
    'idempotencyKey         String?                 @unique',
]
missing = [value for value in required if value not in text]
if missing:
    raise SystemExit(f'No se aplicó la base del esquema: {missing}')
schema.write_text(text, encoding='utf-8')

Path('src/economic-integrity/dto').mkdir(parents=True, exist_ok=True)
Path('src/economic-integrity/economic-integrity.ts').write_text('''import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export const STOCK_EPSILON = 0.000001;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function requireOperationKey(value?: string): string {
  const key = value?.trim();
  if (!key) {
    throw new BadRequestException(
      'La operación requiere la cabecera Idempotency-Key',
    );
  }
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException(
      'La cabecera Idempotency-Key no tiene un formato válido',
    );
  }
  return key;
}

export function requireReason(value?: string, action = 'la operación'): string {
  const reason = value?.trim();
  if (!reason || reason.length < 10) {
    throw new BadRequestException(
      `Debes indicar un motivo de al menos 10 caracteres para ${action}`,
    );
  }
  if (reason.length > 500) {
    throw new BadRequestException('El motivo no puede superar 500 caracteres');
  }
  return reason;
}

export async function lockEconomicResources(
  tx: any,
  resources: string[],
): Promise<void> {
  const ordered = [...new Set(resources.filter(Boolean))].sort();
  for (const resource of ordered) {
    if (typeof tx.$queryRawUnsafe !== 'function') continue;
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      resource,
    );
  }
}

export async function recordEconomicAudit(
  tx: any,
  input: {
    userId: number;
    action: string;
    entityType: string;
    entityId: string;
    operationKey?: string | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await tx.economicAuditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        operationKey: input.operationKey || null,
        reason: input.reason || null,
        details: input.details || undefined,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002' && input.operationKey) {
      throw new ConflictException(
        'La operación ya fue procesada con la misma clave de idempotencia',
      );
    }
    throw error;
  }
}
''', encoding='utf-8')

Path('src/economic-integrity/dto/cancel-economic-operation.dto.ts').write_text('''import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelEconomicOperationDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
''', encoding='utf-8')

Path('src/inventory/dto').mkdir(parents=True, exist_ok=True)
Path('src/inventory/dto/adjust-inventory.dto.ts').write_text('''import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustInventoryDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @NotEquals(0)
  quantityChange: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
''', encoding='utf-8')

migration = Path('prisma/migrations/20260731053000_phase2_economic_integrity')
migration.mkdir(parents=True, exist_ok=True)
migration.joinpath('migration.sql').write_text('''-- Phase 2: economic integrity and traceability
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
''', encoding='utf-8')
