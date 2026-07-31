import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminStepUpDto } from '../auth/dto/admin-step-up.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('audit')
  @Permissions(PERMISSIONS.AUDIT_VIEW)
  findAuditLog() {
    return this.usersService.findAuditLog();
  }

  @Get('security-audit')
  @Permissions(PERMISSIONS.AUDIT_VIEW)
  findSecurityAuditLog(@Query('targetUserId') targetUserId?: string) {
    const parsedTarget = targetUserId ? Number(targetUserId) : undefined;
    return this.usersService.findSecurityAuditLog(
      Number.isInteger(parsedTarget) ? parsedTarget : undefined,
    );
  }

  @Get(':id/sessions')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  findSessions(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findSessions(id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    return this.usersService.create(createUserDto, req.user.id);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.update(id, updateUserDto, req.user.id);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @Request() req: any,
  ) {
    return this.usersService.updateStatus(id, dto, req.user.id);
  }

  @Patch(':id/password')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetUserPasswordDto,
    @Request() req: any,
  ) {
    return this.usersService.resetPassword(id, dto, req.user.id);
  }

  @Post(':id/unlock')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  unlock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminStepUpDto,
    @Request() req: any,
  ) {
    return this.usersService.unlock(id, dto, req.user.id);
  }

  @Post(':id/reset-2fa')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  resetTwoFactor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminStepUpDto,
    @Request() req: any,
  ) {
    return this.usersService.resetTwoFactor(id, dto, req.user.id);
  }

  @Post(':id/revoke-sessions')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  revokeSessions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminStepUpDto,
    @Request() req: any,
  ) {
    return this.usersService.revokeSessions(id, dto, req.user.id);
  }
}
