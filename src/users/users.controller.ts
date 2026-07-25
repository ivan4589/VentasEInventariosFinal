import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles($Enums.Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('audit')
  @Roles($Enums.Role.ADMIN)
  findAuditLog() {
    return this.usersService.findAuditLog();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles($Enums.Role.ADMIN)
  create(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    return this.usersService.create(createUserDto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.update(id, updateUserDto, req.user.id);
  }

  @Patch(':id/status')
  @Roles($Enums.Role.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @Request() req: any,
  ) {
    return this.usersService.updateStatus(id, dto, req.user.id);
  }

  @Patch(':id/password')
  @Roles($Enums.Role.ADMIN)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetUserPasswordDto,
    @Request() req: any,
  ) {
    return this.usersService.resetPassword(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles($Enums.Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.usersService.remove(id, req.user.id);
  }
}
