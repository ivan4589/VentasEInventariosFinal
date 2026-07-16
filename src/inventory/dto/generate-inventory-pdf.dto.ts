import { IsOptional, IsString } from 'class-validator';

export class GenerateInventoryPdfDto {
  @IsOptional()
  @IsString()
  categoryId?: string;
}