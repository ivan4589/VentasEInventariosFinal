import { $Enums } from '../../../generated/prisma/client';

export class ClientResponseDto {
  id: string;
  fullName: string;
  alias?: string | null;
  type: $Enums.ClientType;
  locationId: string;
  locationName?: string;
  phone?: string | null;
  whatsappConsent: boolean;
  additionalInfo?: string | null;
  isActive: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
