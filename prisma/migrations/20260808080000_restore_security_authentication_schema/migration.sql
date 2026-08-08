-- Restore the authentication schema removed by 20260728145556_seguridad.
-- The guards make this forward-only repair safe for databases that were
-- already reconciled manually or with `prisma db push`.

DO $$
BEGIN
  CREATE TYPE "UserStatus" AS ENUM (
    'PENDING_EMAIL_VERIFICATION',
    'PENDING_ADMIN_APPROVAL',
    'ACTIVE',
    'REJECTED',
    'TEMPORARILY_LOCKED',
    'DISABLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING_EMAIL_VERIFICATION';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PENDING_ADMIN_APPROVAL';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'TEMPORARILY_LOCKED';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DISABLED';

DO $$
BEGIN
  CREATE TYPE "SecurityTokenType" AS ENUM (
    'EMAIL_VERIFICATION',
    'PASSWORD_RESET',
    'TWO_FACTOR_CHALLENGE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SecurityTokenType" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFICATION';
ALTER TYPE "SecurityTokenType" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "SecurityTokenType" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_CHALLENGE';

DO $$
BEGIN
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
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'USER_REGISTERED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFICATION_REQUESTED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFIED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'REGISTRATION_APPROVED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'REGISTRATION_REJECTED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_SUCCEEDED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_FAILED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_LOCKED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_UNLOCKED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_COMPLETED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_SETUP_STARTED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_ENABLED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_DISABLED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_VERIFIED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_FAILED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_RECOVERY_CODE_USED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_RESET_BY_ADMIN';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'SESSION_CREATED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'SESSION_REFRESHED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'SESSION_REVOKED';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'ALL_SESSIONS_REVOKED';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "requestedRole" "Role",
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twoFactorVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "securityVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "User"
SET
  "status" = COALESCE("status", 'ACTIVE'::"UserStatus"),
  "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
  "approvedAt" = COALESCE("approvedAt", "createdAt"),
  "passwordChangedAt" = COALESCE("passwordChangedAt", "createdAt"),
  "updatedAt" = NOW();

CREATE TABLE IF NOT EXISTS "security_tokens" (
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

CREATE TABLE IF NOT EXISTS "auth_sessions" (
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

CREATE TABLE IF NOT EXISTS "two_factor_methods" (
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

CREATE TABLE IF NOT EXISTS "two_factor_recovery_codes" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "login_attempts" (
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

CREATE TABLE IF NOT EXISTS "security_audit_logs" (
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

CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_lockedUntil_idx" ON "User"("lockedUntil");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "security_tokens_tokenHash_key" ON "security_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "security_tokens_userId_type_idx" ON "security_tokens"("userId", "type");
CREATE INDEX IF NOT EXISTS "security_tokens_expiresAt_idx" ON "security_tokens"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");
CREATE INDEX IF NOT EXISTS "auth_sessions_userId_revokedAt_idx" ON "auth_sessions"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "two_factor_methods_userId_key" ON "two_factor_methods"("userId");
CREATE INDEX IF NOT EXISTS "two_factor_recovery_codes_userId_usedAt_idx" ON "two_factor_recovery_codes"("userId", "usedAt");

CREATE INDEX IF NOT EXISTS "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "login_attempts_userId_createdAt_idx" ON "login_attempts"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "login_attempts_ipAddress_createdAt_idx" ON "login_attempts"("ipAddress", "createdAt");

CREATE INDEX IF NOT EXISTS "security_audit_logs_actorUserId_createdAt_idx" ON "security_audit_logs"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "security_audit_logs_targetUserId_createdAt_idx" ON "security_audit_logs"("targetUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "security_audit_logs_action_createdAt_idx" ON "security_audit_logs"("action", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_approvedById_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_tokens_userId_fkey') THEN
    ALTER TABLE "security_tokens"
      ADD CONSTRAINT "security_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_userId_fkey') THEN
    ALTER TABLE "auth_sessions"
      ADD CONSTRAINT "auth_sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'two_factor_methods_userId_fkey') THEN
    ALTER TABLE "two_factor_methods"
      ADD CONSTRAINT "two_factor_methods_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'two_factor_recovery_codes_userId_fkey') THEN
    ALTER TABLE "two_factor_recovery_codes"
      ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'login_attempts_userId_fkey') THEN
    ALTER TABLE "login_attempts"
      ADD CONSTRAINT "login_attempts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_audit_logs_actorUserId_fkey') THEN
    ALTER TABLE "security_audit_logs"
      ADD CONSTRAINT "security_audit_logs_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_audit_logs_targetUserId_fkey') THEN
    ALTER TABLE "security_audit_logs"
      ADD CONSTRAINT "security_audit_logs_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_audit_logs_sessionId_fkey') THEN
    ALTER TABLE "security_audit_logs"
      ADD CONSTRAINT "security_audit_logs_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "auth_sessions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
