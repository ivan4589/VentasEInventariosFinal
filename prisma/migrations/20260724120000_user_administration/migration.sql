-- CreateEnum
CREATE TYPE "UserAdministrationAction" AS ENUM (
  'USER_CREATED',
  'USER_UPDATED',
  'ROLE_CHANGED',
  'STATUS_CHANGED',
  'PASSWORD_RESET'
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_administration_logs" (
  "id" TEXT NOT NULL,
  "actorId" INTEGER NOT NULL,
  "targetUserId" INTEGER,
  "action" "UserAdministrationAction" NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_administration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_administration_logs_actorId_idx"
ON "user_administration_logs"("actorId");

-- CreateIndex
CREATE INDEX "user_administration_logs_targetUserId_idx"
ON "user_administration_logs"("targetUserId");

-- CreateIndex
CREATE INDEX "user_administration_logs_createdAt_idx"
ON "user_administration_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "user_administration_logs"
ADD CONSTRAINT "user_administration_logs_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_administration_logs"
ADD CONSTRAINT "user_administration_logs_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
