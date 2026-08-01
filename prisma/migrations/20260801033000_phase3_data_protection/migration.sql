ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "clients"
SET "phoneNormalized" = CASE
  WHEN length(regexp_replace(COALESCE("phone", ''), '\D', '', 'g')) = 8
    THEN '591' || regexp_replace("phone", '\D', '', 'g')
  WHEN regexp_replace(COALESCE("phone", ''), '\D', '', 'g') <> ''
    THEN regexp_replace("phone", '\D', '', 'g')
  ELSE NULL
END;

WITH duplicated AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "phoneNormalized" ORDER BY "createdAt", "id"
  ) AS position
  FROM "clients"
  WHERE "phoneNormalized" IS NOT NULL AND "isActive" = true
)
UPDATE "clients" AS client
SET "phoneNormalized" = NULL
FROM duplicated
WHERE client."id" = duplicated."id" AND duplicated.position > 1;

CREATE INDEX IF NOT EXISTS "clients_phoneNormalized_idx"
  ON "clients"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "clients_isActive_idx"
  ON "clients"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "clients_phoneNormalized_active_key"
  ON "clients"("phoneNormalized")
  WHERE "phoneNormalized" IS NOT NULL AND "isActive" = true;

ALTER TABLE "providers"
  DROP CONSTRAINT IF EXISTS "providers_companyName_key";

ALTER TABLE "providers"
  ADD COLUMN IF NOT EXISTS "companyNameNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "providers"
SET
  "companyNameNormalized" = lower(trim(regexp_replace("companyName", '\s+', ' ', 'g'))),
  "phoneNormalized" = CASE
    WHEN length(regexp_replace(COALESCE("phone", ''), '\D', '', 'g')) = 8
      THEN '591' || regexp_replace("phone", '\D', '', 'g')
    WHEN regexp_replace(COALESCE("phone", ''), '\D', '', 'g') <> ''
      THEN regexp_replace("phone", '\D', '', 'g')
    ELSE NULL
  END;

ALTER TABLE "providers"
  ALTER COLUMN "companyNameNormalized" SET NOT NULL;

WITH duplicated AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "phoneNormalized" ORDER BY "createdAt", "id"
  ) AS position
  FROM "providers"
  WHERE "phoneNormalized" IS NOT NULL AND "isActive" = true
)
UPDATE "providers" AS provider
SET "phoneNormalized" = NULL
FROM duplicated
WHERE provider."id" = duplicated."id" AND duplicated.position > 1;

CREATE INDEX IF NOT EXISTS "providers_phoneNormalized_idx"
  ON "providers"("phoneNormalized");
CREATE INDEX IF NOT EXISTS "providers_companyNameNormalized_idx"
  ON "providers"("companyNameNormalized");
CREATE INDEX IF NOT EXISTS "providers_isActive_idx"
  ON "providers"("isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "providers_phoneNormalized_active_key"
  ON "providers"("phoneNormalized")
  WHERE "phoneNormalized" IS NOT NULL AND "isActive" = true;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "Product"
SET "nameNormalized" = lower(trim(regexp_replace("name", '\s+', ' ', 'g')));

ALTER TABLE "Product"
  ALTER COLUMN "nameNormalized" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Product_nameNormalized_idx"
  ON "Product"("nameNormalized");
CREATE INDEX IF NOT EXISTS "Product_isActive_idx"
  ON "Product"("isActive");

CREATE TABLE IF NOT EXISTS "data_audit_logs" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "data_audit_logs_userId_createdAt_idx"
  ON "data_audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "data_audit_logs_entityType_entityId_idx"
  ON "data_audit_logs"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "data_audit_logs_action_createdAt_idx"
  ON "data_audit_logs"("action", "createdAt");

ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'ANALYTICS_REPORT';
