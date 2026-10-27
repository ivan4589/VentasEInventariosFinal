import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class SendSaleWhatsAppBatchDto {
  // "principal" selects the existing client phone; other entries are contact IDs.
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(20) @ArrayUnique() @IsString({ each: true })
  recipients: string[];

  @IsOptional() @IsBoolean()
  resend?: boolean;
}
