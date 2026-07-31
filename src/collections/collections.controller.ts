import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import {
  AnyPermissions,
  Permissions,
} from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectionsService } from './collections.service';
import { AssignCollectionDto } from './dto/assign-collection.dto';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly dataScope: DataScopeService,
  ) {}

  @Get('debts')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.COLLECTIONS_VIEW_ALL,
    PERMISSIONS.COLLECTIONS_VIEW_OWN_SALES,
    PERMISSIONS.COLLECTIONS_VIEW_ASSIGNED,
  )
  async findDebts(@Request() req: any) {
    if (req.user.role !== $Enums.Role.VENDEDOR) {
      return this.collectionsService.findDebts(req.user);
    }

    // El servicio existente filtra a todo usuario no administrador por
    // asignación. Para el vendedor obtenemos el conjunto y aplicamos el alcance
    // por ventas creadas por él antes de devolver cualquier dato.
    const result = await this.collectionsService.findDebts({
      id: req.user.id,
      role: $Enums.Role.ADMIN,
    });
    const allowedSaleIds = await this.dataScope.allowedSaleIds(req.user);
    const clients = result.clients
      .map((client) => ({
        ...client,
        sales: client.sales.filter((sale) => allowedSaleIds?.has(sale.id)),
      }))
      .filter((client) => client.sales.length > 0)
      .map((client) => {
        const totalDebt = client.sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalPaid = client.sales.reduce(
          (sum, sale) => sum + sale.paidAmount,
          0,
        );
        const balance = client.sales.reduce((sum, sale) => sum + sale.balance, 0);
        const overdueBalance = client.sales
          .filter((sale) => sale.isOverdue)
          .reduce((sum, sale) => sum + sale.balance, 0);
        return { ...client, totalDebt, totalPaid, balance, overdueBalance };
      });
    const sales = clients.flatMap((client) => client.sales);

    return {
      clients,
      summary: {
        clientsCount: clients.length,
        salesCount: sales.length,
        totalDebt: clients.reduce((sum, client) => sum + client.totalDebt, 0),
        totalPaid: clients.reduce((sum, client) => sum + client.totalPaid, 0),
        totalBalance: clients.reduce((sum, client) => sum + client.balance, 0),
        overdueBalance: clients.reduce(
          (sum, client) => sum + client.overdueBalance,
          0,
        ),
        unassignedSalesCount: sales.filter((sale) => !sale.assignment).length,
      },
    };
  }

  @Get('assignable-users')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.COLLECTIONS_ASSIGN)
  findAssignableUsers(@Request() req: any) {
    return this.collectionsService.findAssignableUsers(req.user);
  }

  @Patch('sales/:saleId/assignment')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.COLLECTIONS_ASSIGN)
  assign(
    @Param('saleId') saleId: string,
    @Body() dto: AssignCollectionDto,
    @Request() req: any,
  ) {
    return this.collectionsService.assign(saleId, dto.assignedToId, req.user);
  }

  @Delete('sales/:saleId/assignment')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.COLLECTIONS_ASSIGN)
  unassign(@Param('saleId') saleId: string, @Request() req: any) {
    return this.collectionsService.unassign(saleId, req.user);
  }

  @Post('reports/general-pdf')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  generateGeneralDebtPdf(@Request() req: any) {
    return this.collectionsService.generateGeneralDebtPdf(req.user);
  }

  @Post('reports/assignments-pdf')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  generateAssignmentsPdf(@Request() req: any) {
    return this.collectionsService.generateAssignmentsPdf(req.user);
  }

  @Post('reports/users/:userId/pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.REPORTS_COLLECTIONS_ALL,
    PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
  )
  generateUserAssignmentsPdf(
    @Param('userId', ParseIntPipe) userId: number,
    @Request() req: any,
  ) {
    if (req.user.role !== $Enums.Role.ADMIN && userId !== req.user.id) {
      throw new ForbiddenException(
        'Solo puedes generar el reporte de tus cobranzas asignadas',
      );
    }
    return this.collectionsService.generateUserAssignmentsPdf(userId, req.user);
  }
}
