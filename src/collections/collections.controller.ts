import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AssignCollectionDto } from './dto/assign-collection.dto';
import { CollectionsService } from './collections.service';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get('debts')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  findDebts(@Request() req) {
    return this.collectionsService.findDebts(req.user);
  }

  @Get('assignable-users')
  @Roles($Enums.Role.ADMIN)
  findAssignableUsers(@Request() req) {
    return this.collectionsService.findAssignableUsers(req.user);
  }

  @Patch('sales/:saleId/assignment')
  @Roles($Enums.Role.ADMIN)
  assign(
    @Param('saleId') saleId: string,
    @Body() dto: AssignCollectionDto,
    @Request() req,
  ) {
    return this.collectionsService.assign(saleId, dto.assignedToId, req.user);
  }

  @Delete('sales/:saleId/assignment')
  @Roles($Enums.Role.ADMIN)
  unassign(@Param('saleId') saleId: string, @Request() req) {
    return this.collectionsService.unassign(saleId, req.user);
  }

  @Post('reports/general-pdf')
  @Roles($Enums.Role.ADMIN)
  generateGeneralDebtPdf(@Request() req) {
    return this.collectionsService.generateGeneralDebtPdf(req.user);
  }

  @Post('reports/assignments-pdf')
  @Roles($Enums.Role.ADMIN)
  generateAssignmentsPdf(@Request() req) {
    return this.collectionsService.generateAssignmentsPdf(req.user);
  }

  @Post('reports/users/:userId/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  generateUserAssignmentsPdf(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req,
  ) {
    return this.collectionsService.generateUserAssignmentsPdf(userId, req.user);
  }
}
