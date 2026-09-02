import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientSpreadsheetService } from '../spreadsheets/client-spreadsheet.service';
import {
  requireXlsxFile,
  xlsxUploadOptions,
} from '../spreadsheets/xlsx-upload';

interface AuthenticatedRequest {
  user: { id: number; role: $Enums.Role };
}

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly spreadsheets: ClientSpreadsheetService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CLIENTS_VIEW)
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('locationId') locationId?: string,
    @Query('type') type?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const includeAll =
      req.user.role === $Enums.Role.ADMIN && includeInactive === 'true';
    if (locationId) {
      return this.clientsService.findByLocation(locationId, includeAll);
    }
    if (type) return this.clientsService.findByType(type, includeAll);
    return this.clientsService.findAll(includeAll);
  }

  @Get('spreadsheet/template')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  async spreadsheetTemplate(@Res({ passthrough: true }) response: Response) {
    return this.xlsxResponse(
      await this.spreadsheets.template(),
      'plantilla-importacion-clientes.xlsx',
      response,
    );
  }

  @Get('spreadsheet/export')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  async spreadsheetExport(@Res({ passthrough: true }) response: Response) {
    const date = new Date().toISOString().slice(0, 10);
    return this.xlsxResponse(
      await this.spreadsheets.export(),
      `clientes-${date}.xlsx`,
      response,
    );
  }

  @Post('spreadsheet/preview')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  spreadsheetPreview(@UploadedFile() file?: Express.Multer.File) {
    return this.spreadsheets.preview(requireXlsxFile(file).buffer);
  }

  @Post('spreadsheet/import')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  spreadsheetImport(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.spreadsheets.import(
      requireXlsxFile(file).buffer,
      request.user.id,
    );
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.CLIENTS_VIEW)
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.clientsService.findOne(id, req.user.role === $Enums.Role.ADMIN);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.CLIENTS_CREATE)
  create(@Body() dto: CreateClientDto, @Request() req: AuthenticatedRequest) {
    return this.clientsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.CLIENTS_UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clientsService.update(id, dto, req.user.id);
  }

  @Patch(':id/deactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_DELETE)
  deactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clientsService.deactivate(id, req.user.id, dto.reason);
  }

  @Patch(':id/reactivate')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.CLIENTS_DELETE)
  reactivate(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clientsService.reactivate(id, req.user.id, dto.reason);
  }

  private xlsxResponse(buffer: Buffer, filename: string, response: Response) {
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(buffer);
  }
}
