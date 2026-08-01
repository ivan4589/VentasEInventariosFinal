import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

export class AdjustInventoryDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @NotEquals(0)
  quantityChange: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
