import { $Enums } from '../../../generated/prisma/client';

export class ClientResponseDto {
  id: string;
  fullName: string;
  alias?: string;
  type: $Enums.ClientType;
  locationId: string;
  phone?: string;
  additionalInfo?: string;
  createdAt: Date;
  updatedAt: Date;
}