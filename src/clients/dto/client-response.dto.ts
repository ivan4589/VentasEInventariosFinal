import { ClientType } from '@prisma/client';

export class ClientResponseDto {
  id: string;
  fullName: string;
  alias?: string;
  type: ClientType;
  locationId: string;
  phone?: string;
  additionalInfo?: string;
  createdAt: Date;
  updatedAt: Date;
}