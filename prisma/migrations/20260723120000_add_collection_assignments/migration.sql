CREATE TABLE "collection_assignments" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "assignedToId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collection_assignments_saleId_key"
ON "collection_assignments"("saleId");

CREATE INDEX "collection_assignments_assignedToId_idx"
ON "collection_assignments"("assignedToId");

CREATE INDEX "collection_assignments_assignedById_idx"
ON "collection_assignments"("assignedById");

CREATE INDEX "collection_assignments_assignedAt_idx"
ON "collection_assignments"("assignedAt");

ALTER TABLE "collection_assignments"
ADD CONSTRAINT "collection_assignments_saleId_fkey"
FOREIGN KEY ("saleId")
REFERENCES "sales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "collection_assignments"
ADD CONSTRAINT "collection_assignments_assignedToId_fkey"
FOREIGN KEY ("assignedToId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "collection_assignments"
ADD CONSTRAINT "collection_assignments_assignedById_fkey"
FOREIGN KEY ("assignedById")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
