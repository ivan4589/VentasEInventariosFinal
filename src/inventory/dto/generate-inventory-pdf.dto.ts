import { IsOptional, IsUUID } from 'class-validator';

export class GenerateInventoryPdfDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string; // Si se envía, filtra por categoría
}