import { $Enums } from '../../../generated/prisma/client';

export class UserResponseDto {
  id: number;
  name: string;
  email: string;
  role: $Enums.Role;
  createdAt: Date;
  updatedAt: Date;
}