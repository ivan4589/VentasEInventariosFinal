import { Type } from 'class-transformer';
import { IsBoolean, ValidateNested } from 'class-validator';
import { AdminStepUpDto } from '../../auth/dto/admin-step-up.dto';

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;

  @ValidateNested()
  @Type(() => AdminStepUpDto)
  confirmation: AdminStepUpDto;
}
