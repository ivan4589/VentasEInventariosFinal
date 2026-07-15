import { IsNumber, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SaleDetailDto {
  @IsString()
  productId: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  unitPrice: number;
}