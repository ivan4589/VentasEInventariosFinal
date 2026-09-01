-- Add a public, editable product code without changing the technical primary key.
ALTER TABLE "Product" ADD COLUMN "code" TEXT;

WITH ranked_codes AS (
  SELECT
    "id",
    UPPER(SUBSTRING("id" FROM 1 FOR 8)) AS base_code,
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(SUBSTRING("id" FROM 1 FOR 8))
      ORDER BY "id"
    ) AS code_position
  FROM "Product"
)
UPDATE "Product" AS product
SET "code" = CASE
  WHEN ranked_codes.code_position = 1 THEN ranked_codes.base_code
  ELSE ranked_codes.base_code || '-' || ranked_codes.code_position
END
FROM ranked_codes
WHERE product."id" = ranked_codes."id";

ALTER TABLE "Product" ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_code_format_check"
  CHECK ("code" ~ '^[A-Z0-9-]+$');

CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
