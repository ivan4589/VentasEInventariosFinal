-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM (
  'PENDING_EMAIL_VERIFICATION',
  'PENDING_ADMIN_APPROVAL',
  'ACTIVE',
  'REJECTED',
  'TEMPORARILY_LOCKED',
  'DISABLED'
);

-- CreateEnum
CREATE TYPE "SecurityTokenType" AS ENUM (
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'TWO_FACTOR_CHALLENGE'
);

-- CreateEnum
CREATE TYPE "SecurityAuditAction" AS ENUM (
  'USER_REGISTERED',
  'EMAIL_VERIFICATION_REQUESTED',
  'EMAIL_VERIFIED',
  'REGISTRATION_APPROVED',
  'REGISTRATION_REJECTED',
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'PASSWORD_CHANGED',
  'TWO_FACTOR_SETUP_STARTED',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'TWO_FACTOR_VERIFIED',
  'TWO_FACTOR_FAILED',
  'TWO_FACTOR_RECOVERY_CODE_USED',
  'TWO_FACTOR_RESET_BY_ADMIN',
  'SESSION_CREATED',
  'SESSION_REFRESHED',
  'SESSION_REVOKED',
  'ALL_SESSIONS_REVOKED'
);

-- AlterTable: preserve every existing account as ACTIVE.
ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "requestedRole" "Role",
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 1;

-- Existing users predate email verification and administrative approval.
UPDATE "User"
SET
  "status" = 'ACTIVE',
  "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
  "approvedAt" = COALESCE("approvedAt", "createdAt"),
  "passwordChangedAt" = COALESCE("passwordChangedAt", "createdAt");

-- CreateTable
CREATE TABLE "security_tokens" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "type" "SecurityTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "security_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "deviceName" TEXT,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_methods" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "encryptedSecret" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "two_factor_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
  "id" TEXT NOT NULL,
  "userId" INTEGER,
  "email" TEXT NOT NULL,
  "successful" BOOLEAN NOT NULL,
  "failureReason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_audit_logs" (
  "id" TEXT NOT NULL,
  "actorUserId" INTEGER,
  "targetUserId" INTEGER,
  "sessionId" TEXT,
  "action" "SecurityAuditAction" NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT true,
  "details" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE UNIQUE INDEX "security_tokens_tokenHash_key" ON "security_tokens"("tokenHash");
CREATE INDEX "security_tokens_userId_type_idx" ON "security_tokens"("userId", "type");
CREATE INDEX "security_tokens_expiresAt_idx" ON "security_tokens"("expiresAt");

CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");
CREATE INDEX "auth_sessions_userId_revokedAt_idx" ON "auth_sessions"("userId", "revokedAt");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

CREATE UNIQUE INDEX "two_factor_methods_userId_key" ON "two_factor_methods"("userId");
CREATE INDEX "two_factor_recovery_codes_userId_usedAt_idx" ON "two_factor_recovery_codes"("userId", "usedAt");

CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");
CREATE INDEX "login_attempts_userId_createdAt_idx" ON "login_attempts"("userId", "createdAt");
CREATE INDEX "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");

CREATE INDEX "security_audit_logs_actorUserId_createdAt_idx" ON "security_audit_logs"("actorUserId", "createdAt");
CREATE INDEX "security_audit_logs_targetUserId_createdAt_idx" ON "security_audit_logs"("targetUserId", "createdAt");
CREATE INDEX "security_audit_logs_action_createdAt_idx" ON "security_audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "User"
  ADD CONSTRAINT "User_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_tokens"
  ADD CONSTRAINT "security_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "two_factor_methods"
  ADD CONSTRAINT "two_factor_methods_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "two_factor_recovery_codes"
  ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "login_attempts"
  ADD CONSTRAINT "login_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_audit_logs"
  ADD CONSTRAINT "security_audit_logs_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_audit_logs"
  ADD CONSTRAINT "security_audit_logs_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_audit_logs"
  ADD CONSTRAINT "security_audit_logs_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
