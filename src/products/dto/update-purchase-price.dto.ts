import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdatePurchasePriceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
