ALTER TYPE "UserAdministrationAction" ADD VALUE IF NOT EXISTS 'USER_REMOVED';

ALTER TABLE "User"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
