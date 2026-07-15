import { IsBoolean, IsOptional } from 'class-validator';

export class ReceivePurchaseDto {
  @IsOptional()
  @IsBoolean()
  updatePrices?: boolean; // Por defecto true si no se envía
}