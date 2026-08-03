import { $Enums } from '../../../generated/prisma/client';

export class UserResponseDto {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: $Enums.Role;
  requestedRole: $Enums.Role | null;
  status: $Enums.UserStatus;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  activeSessions: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
