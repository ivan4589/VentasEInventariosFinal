import { IsBoolean, IsOptional } from 'class-validator';

export class SendSaleWhatsAppDto {
  @IsOptional()
  @IsBoolean()
  resend?: boolean;
}
