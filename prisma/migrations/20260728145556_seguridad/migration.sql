/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `approvedById` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerifiedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `failedLoginAttempts` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `lockedUntil` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `mustChangePassword` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordChangedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `rejectedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `rejectionReason` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `requestedRole` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `securityVersion` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorEnabled` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorVerifiedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `auth_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `login_attempts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `security_audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `security_tokens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `two_factor_methods` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `two_factor_recovery_codes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_userId_fkey";

-- DropForeignKey
ALTER TABLE "login_attempts" DROP CONSTRAINT "login_attempts_userId_fkey";

-- DropForeignKey
ALTER TABLE "security_audit_logs" DROP CONSTRAINT "security_audit_logs_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "security_audit_logs" DROP CONSTRAINT "security_audit_logs_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "security_audit_logs" DROP CONSTRAINT "security_audit_logs_targetUserId_fkey";

-- DropForeignKey
ALTER TABLE "security_tokens" DROP CONSTRAINT "security_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "two_factor_methods" DROP CONSTRAINT "two_factor_methods_userId_fkey";

-- DropForeignKey
ALTER TABLE "two_factor_recovery_codes" DROP CONSTRAINT "two_factor_recovery_codes_userId_fkey";

-- DropIndex
DROP INDEX "User_createdAt_idx";

-- DropIndex
DROP INDEX "User_lockedUntil_idx";

-- DropIndex
DROP INDEX "User_status_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "approvedAt",
DROP COLUMN "approvedById",
DROP COLUMN "emailVerifiedAt",
DROP COLUMN "failedLoginAttempts",
DROP COLUMN "lockedUntil",
DROP COLUMN "mustChangePassword",
DROP COLUMN "passwordChangedAt",
DROP COLUMN "phone",
DROP COLUMN "rejectedAt",
DROP COLUMN "rejectionReason",
DROP COLUMN "requestedRole",
DROP COLUMN "securityVersion",
DROP COLUMN "status",
DROP COLUMN "twoFactorEnabled",
DROP COLUMN "twoFactorVerifiedAt";

-- DropTable
DROP TABLE "auth_sessions";

-- DropTable
DROP TABLE "login_attempts";

-- DropTable
DROP TABLE "security_audit_logs";

-- DropTable
DROP TABLE "security_tokens";

-- DropTable
DROP TABLE "two_factor_methods";

-- DropTable
DROP TABLE "two_factor_recovery_codes";

-- DropEnum
DROP TYPE "SecurityAuditAction";

-- DropEnum
DROP TYPE "SecurityTokenType";

-- DropEnum
DROP TYPE "UserStatus";
