import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WarehouseTransferDetailDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber(
    {
      allowInfinity: false,
      allowNaN: false,
      maxDecimalPlaces: 3,
    },
    {
      message: 'La cantidad debe ser un número con máximo 3 decimales',
    },
  )
  @Min(0.001, {
    message: 'La cantidad debe ser mayor a cero',
  })
  quantity: number;
}

export class CreateWarehouseTransferDto {
  @IsString()
  originWarehouseId: string;

  @IsString()
  destinationWarehouseId: string;

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Debes agregar al menos un producto',
  })
  @ValidateNested({ each: true })
  @Type(() => WarehouseTransferDetailDto)
  details: WarehouseTransferDetailDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}
