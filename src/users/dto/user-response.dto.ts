import { $Enums } from '../../../generated/prisma/client';

export class UserResponseDto {
  id: number;
  name: string;
  email: string;
  role: $Enums.Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
