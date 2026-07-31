from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'No se encontró bloque en {path}: {old[:140]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path: str, pattern: str, replacement: str, flags=re.S):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'No se encontró patrón en {path}: {pattern[:140]!r}')
    file.write_text(updated, encoding='utf-8')


# ---------------------------------------------------------------------------
# Shared distributed locking, idempotency and audit service
# ---------------------------------------------------------------------------
Path('src/economic-integrity/economic-integrity.service.ts').write_text('''import {
  ConflictException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireOperationKey,
  requireReason,
} from './economic-integrity';

export interface EconomicExecution<T> {
  entityId: string;
  value: T;
  details?: Record<string, unknown>;
}

@Injectable()
export class EconomicIntegrityService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly prisma: PrismaService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL no está configurado');
    }
    this.pool = new Pool({
      connectionString,
      max: 5,
      application_name: 'ventas-integrity-locks',
    });
  }

  operationKey(value?: string): string {
    return requireOperationKey(value);
  }

  reason(value?: string, action?: string): string {
    return requireReason(value, action);
  }

  async run<T>(options: {
    operationKey?: string;
    locks: string[];
    userId: number;
    action: string;
    entityType: string;
    reason?: string | null;
    execute: (operationKey: string) => Promise<EconomicExecution<T>>;
    resolveExisting: (entityId: string) => Promise<T>;
  }): Promise<T> {
    const operationKey = this.operationKey(options.operationKey);

    return this.withLocks(
      [`operation:${operationKey}`, ...options.locks],
      async () => {
        const existing = await this.prisma.economicAuditLog.findUnique({
          where: { operationKey },
        });

        if (existing) {
          if (
            existing.action !== options.action ||
            existing.entityType !== options.entityType
          ) {
            throw new ConflictException(
              'La clave de idempotencia ya fue utilizada para otra operación',
            );
          }
          return options.resolveExisting(existing.entityId);
        }

        const executed = await options.execute(operationKey);

        await this.prisma.economicAuditLog.create({
          data: {
            userId: options.userId,
            action: options.action,
            entityType: options.entityType,
            entityId: executed.entityId,
            operationKey,
            reason: options.reason || null,
            details: executed.details || undefined,
          },
        });

        return executed.value;
      },
    );
  }

  private async withLocks<T>(resources: string[], work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const ordered = [...new Set(resources.filter(Boolean))].sort();

    try {
      for (const resource of ordered) {
        await client.query(
          'SELECT pg_advisory_lock(hashtext($1)::bigint)',
          [resource],
        );
      }
      return await work();
    } finally {
      await this.releaseLocks(client, ordered);
      client.release();
    }
  }

  private async releaseLocks(client: PoolClient, resources: string[]) {
    for (const resource of [...resources].reverse()) {
      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtext($1)::bigint)',
          [resource],
        );
      } catch {
        // La conexión será descartada por pg si deja de ser utilizable.
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
''', encoding='utf-8')

Path('src/economic-integrity/economic-integrity.module.ts').write_text('''import { Global, Module } from '@nestjs/common';
import { EconomicIntegrityService } from './economic-integrity.service';

@Global()
@Module({
  providers: [EconomicIntegrityService],
  exports: [EconomicIntegrityService],
})
export class EconomicIntegrityModule {}
''', encoding='utf-8')

replace_once(
    'src/app.module.ts',
    "import { WarehouseTransfersModule } from './warehouse-transfers/warehouse-transfers.module';\n",
    "import { WarehouseTransfersModule } from './warehouse-transfers/warehouse-transfers.module';\nimport { EconomicIntegrityModule } from './economic-integrity/economic-integrity.module';\n",
)
replace_once(
    'src/app.module.ts',
    '    PrismaModule,\n    AuthModule,',
    '    PrismaModule,\n    EconomicIntegrityModule,\n    AuthModule,',
)

# ---------------------------------------------------------------------------
# Sales service hardening
# ---------------------------------------------------------------------------
sales = Path('src/sales/sales.service.ts')
text = sales.read_text(encoding='utf-8')

text = text.replace(
    '''  async create(
    createSaleDto: CreateSaleDto,
    userId: number,
    userRole: $Enums.Role,
  ): Promise<SaleResponseDto> {
''',
    '''  async create(
    createSaleDto: CreateSaleDto,
    userId: number,
    userRole: $Enums.Role,
    operationKey: string,
  ): Promise<SaleResponseDto> {
    const existing = await this.prisma.sale.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true },
    });
    if (existing) return this.findOne(existing.id);
''',
    1,
)

text = text.replace(
    '''        const unitPrice =
          detail.unitPrice > 0
            ? detail.unitPrice
            : automaticPrice;
''',
    '''        // El precio siempre se obtiene del catálogo del servidor.
        // El valor enviado por la interfaz nunca es una fuente confiable.
        const unitPrice = automaticPrice;
''',
    1,
)

text = text.replace(
    '''              saleNumber,
              clientId,
''',
    '''              saleNumber,
              idempotencyKey: operationKey,
              clientId,
''',
    1,
)

text = text.replace(
    '''        if (
          sale.status !==
          $Enums.SaleStatus.PENDING
        ) {
          throw new BadRequestException(
            'Solo se pueden confirmar ventas pendientes',
          );
        }
''',
    '''        if (sale.status === $Enums.SaleStatus.CONFIRMED) {
          return;
        }
        if (sale.status !== $Enums.SaleStatus.PENDING) {
          throw new BadRequestException(
            'Solo se pueden confirmar ventas pendientes',
          );
        }
''',
    1,
)

text = text.replace(
    '''            status:
              $Enums.SaleStatus.CONFIRMED,
            confirmedAt: new Date(),
''',
    '''            status:
              $Enums.SaleStatus.CONFIRMED,
            confirmedAt: new Date(),
            confirmedById: userId,
''',
    1,
)

text = text.replace(
    '''  async cancel(
    id: string,
    userId: number,
  ): Promise<SaleResponseDto> {
''',
    '''  async cancel(
    id: string,
    userId: number,
    reason: string,
  ): Promise<SaleResponseDto> {
''',
    1,
)

text = text.replace(
    '''    if (
      sale.status ===
      $Enums.SaleStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'La venta ya está anulada',
      );
    }

    await this.prisma.$transaction(
''',
    '''    if (sale.status === $Enums.SaleStatus.CANCELLED) {
      return this.findOne(id);
    }

    const netPaid = await this.getPaidAmount(id);
    if (netPaid > 0) {
      throw new BadRequestException(
        'Debes anular o revertir todos los pagos antes de anular la venta',
      );
    }

    await this.prisma.$transaction(
''',
    1,
)

text = text.replace(
    '''            status:
              $Enums.SaleStatus.CANCELLED,
            cancelledAt: new Date(),
''',
    '''            status:
              $Enums.SaleStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledById: userId,
            cancellationReason: reason,
''',
    1,
)

text = text.replace(
    '''  async createReturn(
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: number,
  ) {
''',
    '''  async createReturn(
    saleId: string,
    dto: CreateSaleReturnDto,
    userId: number,
    operationKey: string,
  ) {
    const existing = await this.prisma.saleReturn.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true, saleId: true },
    });
    if (existing) {
      return {
        message: 'La devolución ya había sido registrada',
        return: existing,
        sale: await this.findOne(existing.saleId),
      };
    }
''',
    1,
)

text = text.replace(
    '''              data: {
                saleId,
                userId,
''',
    '''              data: {
                saleId,
                userId,
                idempotencyKey: operationKey,
''',
    1,
)

text = text.replace(
    '''          const paidAmount =
            await this.getPaidAmount(
              saleId,
              prisma,
            );

          await prisma.sale.update({
''',
    '''          const paidAmount =
            await this.getPaidAmount(
              saleId,
              prisma,
            );

          if (paidAmount > newTotal) {
            throw new BadRequestException(
              'La devolución dejaría la venta con un total menor al monto pagado. Revierte primero el excedente',
            );
          }

          await prisma.sale.update({
''',
    1,
)

sales.write_text(text, encoding='utf-8')

# Return reason is mandatory for financial traceability.
replace_once(
    'src/sales/dto/create-sale-return.dto.ts',
    '''  @IsOptional()
  @IsString()
  observations?: string;
''',
    '''  @IsString()
  @MinLength(10)
  @MaxLength(500)
  observations: string;
''',
)
replace_once(
    'src/sales/dto/create-sale-return.dto.ts',
    '  IsOptional,\n',
    '  MaxLength,\n  MinLength,\n',
)

# Sales controller: all writes require idempotency and distributed locks.
Path('src/sales/sales.controller.ts').write_text('''import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SendSaleWhatsAppDto } from './dto/send-sale-whatsapp.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';
import { WhatsAppService } from './whatsapp.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly whatsappService: WhatsAppService,
    private readonly dataScope: DataScopeService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(PERMISSIONS.SALES_VIEW_ALL, PERMISSIONS.SALES_VIEW_ASSIGNED)
  async findAll(
    @Request() req: any,
    @Query('status') status?: $Enums.SaleStatus,
    @Query('paymentStatus') paymentStatus?: $Enums.PaymentStatus,
    @Query('clientId') clientId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const sales = await this.salesService.findAll({
      status,
      paymentStatus,
      clientId,
      withDebt: req.user.role === $Enums.Role.COBRADOR,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
    const scoped = await this.dataScope.filterSalesForActor(sales, req.user);
    return this.dataScope.sanitizeSalesForActor(scoped, req.user);
  }

  @Get('low-stock')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getLowStock() {
    return this.salesService.getLowStockProducts();
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(PERMISSIONS.SALES_VIEW_ALL, PERMISSIONS.SALES_VIEW_ASSIGNED)
  async findOne(@Param('id') id: string, @Request() req: any) {
    await this.dataScope.assertCanViewSale(id, req.user);
    const sale = await this.salesService.findOne(id);
    return this.dataScope.sanitizeSaleForActor(sale, req.user);
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CREATE)
  create(
    @Body() dto: CreateSaleDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [
        `client:${dto.clientId}`,
        ...dto.details.map((detail) => `stock:${detail.productId}`),
      ],
      userId: req.user.id,
      action: 'SALE_CREATED',
      entityType: 'SALE',
      execute: async (key) => {
        const value = await this.salesService.create(
          dto,
          req.user.id,
          req.user.role,
          key,
        );
        return {
          entityId: value.id,
          value,
          details: { total: value.total, saleNumber: value.saleNumber },
        };
      },
      resolveExisting: (id) => this.salesService.findOne(id),
    });
  }

  @Patch(':id/confirm')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_CONFIRM_OWN)
  async confirm(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_CONFIRMED',
      entityType: 'SALE',
      execute: async () => {
        const value = await this.salesService.confirm(id, req.user.id);
        return { entityId: id, value, details: { saleNumber: value.saleNumber } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }

  @Patch(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_UPDATE_OWN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`, ...(dto.details || []).map((d) => `stock:${d.productId}`)],
      userId: req.user.id,
      action: 'SALE_UPDATED',
      entityType: 'SALE',
      execute: async () => {
        const value = await this.salesService.update(id, dto, req.user.role);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }

  @Post(':id/whatsapp')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_WHATSAPP_OWN)
  async sendWhatsApp(
    @Param('id') id: string,
    @Body() dto: SendSaleWhatsAppDto,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    return this.whatsappService.sendSaleDocument(id, req.user.id, dto.resend ?? false);
  }

  @Post(':id/returns')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.SALES_RETURN_OWN)
  async createReturn(
    @Param('id') id: string,
    @Body() dto: CreateSaleReturnDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    await this.dataScope.assertCanManageSale(id, req.user);
    const reason = this.integrity.reason(dto.observations, 'registrar la devolución');
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_RETURNED',
      entityType: 'SALE_RETURN',
      reason,
      execute: async (key) => {
        const value = await this.salesService.createReturn(id, dto, req.user.id, key);
        return {
          entityId: value.return.id,
          value,
          details: { saleId: id, amount: value.return.amount },
        };
      },
      resolveExisting: async () => {
        const sale = await this.salesService.findOne(id);
        return { message: 'La devolución ya había sido registrada', sale } as any;
      },
    });
  }

  @Patch(':id/cancel')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.SALES_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la venta');
    return this.integrity.run({
      operationKey,
      locks: [`sale:${id}`],
      userId: req.user.id,
      action: 'SALE_CANCELLED',
      entityType: 'SALE',
      reason,
      execute: async () => {
        const value = await this.salesService.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { saleNumber: value.saleNumber } };
      },
      resolveExisting: () => this.salesService.findOne(id),
    });
  }
}
''', encoding='utf-8')

# ---------------------------------------------------------------------------
# Payments: immutable records and negative reversal instead of delete
# ---------------------------------------------------------------------------
payments = Path('src/payments/payments.service.ts')
text = payments.read_text(encoding='utf-8')

create_method = '''  async create(
    createPaymentDto: CreatePaymentDto,
    actor: {
      id: number;
      role: $Enums.Role;
    },
    operationKey: string,
  ): Promise<PaymentResponseDto> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: operationKey },
      include: { client: true, user: true },
    });
    if (existing) return this.toResponse(existing);

    const { saleId, clientId, amount, method, reference, observations } =
      createPaymentDto;

    if (
      method !== $Enums.PaymentMethod.CASH &&
      (!reference || reference.trim().length < 3)
    ) {
      throw new BadRequestException(
        'Los pagos por QR o transferencia requieren una referencia',
      );
    }

    await this.collectionsService.assertCanCollect(saleId, actor);

    return this.prisma.$transaction(async (prisma) => {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: { payments: true, client: true },
      });

      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== $Enums.SaleStatus.CONFIRMED) {
        throw new BadRequestException(
          'Solo se puede registrar pagos en ventas confirmadas',
        );
      }
      if (sale.clientId !== clientId) {
        throw new BadRequestException(
          'El cliente no coincide con el de la venta',
        );
      }

      if (reference?.trim()) {
        const duplicateReference = await prisma.payment.findFirst({
          where: {
            method,
            reference: reference.trim(),
            isReversal: false,
            cancelledAt: null,
          },
          select: { id: true },
        });
        if (duplicateReference) {
          throw new BadRequestException(
            'La referencia de pago ya fue registrada anteriormente',
          );
        }
      }

      const alreadyPaid = sale.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      const totalPaid = Math.round((alreadyPaid + amount) * 100) / 100;
      if (totalPaid > sale.total) {
        throw new BadRequestException(
          `El pago supera el saldo pendiente de la venta`,
        );
      }

      const payment = await prisma.payment.create({
        data: {
          saleId,
          clientId,
          userId: actor.id,
          amount,
          method,
          reference: reference?.trim() || null,
          observations,
          idempotencyKey: operationKey,
        },
        include: { client: true, user: true },
      });

      await prisma.sale.update({
        where: { id: saleId },
        data: {
          paymentStatus: this.calculatePaymentStatus(sale.total, totalPaid),
        },
      });

      return this.toResponse(payment);
    });
  }

'''
text, count = re.subn(
    r'  async create\(.*?\n  async update\(',
    create_method + '  async update(',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('No se pudo reemplazar PaymentsService.create')

text, count = re.subn(
    r'''  async update\(
    id: string,
    updatePaymentDto: UpdatePaymentDto,
  \): Promise<PaymentResponseDto> \{.*?\n  \}\n\n  async remove\(''',
    '''  async update(
    _id: string,
    _updatePaymentDto: UpdatePaymentDto,
  ): Promise<PaymentResponseDto> {
    throw new BadRequestException(
      'Los pagos confirmados son inmutables. Debes anularlos mediante una reversión',
    );
  }

  async remove(''',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('No se pudo reemplazar PaymentsService.update')

cancel_method = '''  async remove(
    id: string,
    actorId: number,
    reason: string,
    operationKey: string,
  ): Promise<PaymentResponseDto> {
    const existingByKey = await this.prisma.payment.findUnique({
      where: { idempotencyKey: operationKey },
      include: { client: true, user: true },
    });
    if (existingByKey) return this.toResponse(existingByKey);

    return this.prisma.$transaction(async (prisma) => {
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          client: true,
          user: true,
          sale: { include: { payments: true } },
        },
      });

      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.isReversal) {
        throw new BadRequestException('No se puede anular una reversión');
      }
      if (payment.cancelledAt) {
        const reversal = await prisma.payment.findUnique({
          where: { reversalOfId: payment.id },
          include: { client: true, user: true },
        });
        if (reversal) return this.toResponse(reversal);
        throw new BadRequestException('El pago ya está anulado');
      }

      const reversal = await prisma.payment.create({
        data: {
          saleId: payment.saleId,
          clientId: payment.clientId,
          userId: actorId,
          amount: -payment.amount,
          method: payment.method,
          reference: `REV-${payment.id}`,
          observations: `Reversión: ${reason}`,
          idempotencyKey: operationKey,
          reversalOfId: payment.id,
          isReversal: true,
        },
        include: { client: true, user: true },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancellationReason: reason,
        },
      });

      const totalPaid = payment.sale.payments.reduce(
        (sum, current) => sum + current.amount,
        -payment.amount,
      );
      await prisma.sale.update({
        where: { id: payment.saleId },
        data: {
          paymentStatus: this.calculatePaymentStatus(
            payment.sale.total,
            totalPaid,
          ),
        },
      });

      return this.toResponse(reversal);
    });
  }

'''
text, count = re.subn(
    r'  async remove\(.*?\n  async findAll\(',
    cancel_method + '  async findAll(',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('No se pudo reemplazar PaymentsService.remove')

text = text.replace(
    '''      observations: payment.observations,
      receivedAt: payment.receivedAt,
''',
    '''      observations: payment.observations,
      isReversal: payment.isReversal ?? false,
      reversalOfId: payment.reversalOfId ?? null,
      cancelledAt: payment.cancelledAt ?? null,
      cancellationReason: payment.cancellationReason ?? null,
      receivedAt: payment.receivedAt,
''',
    1,
)
payments.write_text(text, encoding='utf-8')

replace_once(
    'src/payments/dto/payment-response.dto.ts',
    '''  observations?: string;
  receivedAt: Date;
''',
    '''  observations?: string;
  isReversal: boolean;
  reversalOfId?: string | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  receivedAt: Date;
''',
)

Path('src/payments/payments.controller.ts').write_text('''import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { AnyPermissions, Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly dataScope: DataScopeService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async findAll(
    @Request() req: any,
    @Query('saleId') saleId?: string,
    @Query('clientId') clientId?: string,
    @Query('method') method?: $Enums.PaymentMethod,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const payments = await this.paymentsService.findAll({
      saleId,
      clientId,
      method,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
    return this.dataScope.filterPaymentsForActor(payments, req.user);
  }

  @Get('sale/:saleId/status')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async getSalePaymentStatus(
    @Param('saleId') saleId: string,
    @Request() req: any,
  ) {
    await this.dataScope.assertCanViewSaleFinancials(saleId, req.user);
    return this.paymentsService.getSalePaymentStatus(saleId);
  }

  @Get('client/:clientId/balance')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_VIEW_ALL)
  getClientBalance(@Param('clientId') clientId: string) {
    return this.paymentsService.getClientBalance(clientId);
  }

  @Get('report/collection')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_COLLECTIONS_ALL)
  getCollectionReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.paymentsService.getCollectionReport({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      clientId,
    });
  }

  @Get(':id')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR, $Enums.Role.COBRADOR)
  @AnyPermissions(
    PERMISSIONS.PAYMENTS_VIEW_ALL,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
  )
  async findOne(@Param('id') id: string, @Request() req: any) {
    const payment = await this.paymentsService.findOne(id);
    await this.dataScope.assertCanViewSaleFinancials(payment.saleId, req.user);
    return payment;
  }

  @Post()
  @Roles($Enums.Role.ADMIN, $Enums.Role.COBRADOR)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE_ASSIGNED)
  create(
    @Body() dto: CreatePaymentDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`sale:${dto.saleId}`],
      userId: req.user.id,
      action: 'PAYMENT_REGISTERED',
      entityType: 'PAYMENT',
      execute: async (key) => {
        const value = await this.paymentsService.create(dto, req.user, key);
        return {
          entityId: value.id,
          value,
          details: { saleId: value.saleId, amount: value.amount, method: value.method },
        };
      },
      resolveExisting: (id) => this.paymentsService.findOne(id),
    });
  }

  @Patch(':id/cancel')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.PAYMENTS_CANCEL)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular el pago');
    return this.integrity.run({
      operationKey,
      locks: [`payment:${id}`],
      userId: req.user.id,
      action: 'PAYMENT_REVERSED',
      entityType: 'PAYMENT',
      reason,
      execute: async (key) => {
        const value = await this.paymentsService.remove(id, req.user.id, reason, key);
        return {
          entityId: value.id,
          value,
          details: { originalPaymentId: id, reversalAmount: value.amount },
        };
      },
      resolveExisting: (reversalId) => this.paymentsService.findOne(reversalId),
    });
  }
}
''', encoding='utf-8')

# Update payment spec for mandatory key and new Prisma lookup.
payment_spec = Path('src/payments/payments.service.spec.ts')
if payment_spec.exists():
    text = payment_spec.read_text(encoding='utf-8')
    text = text.replace(
        '''    payment: {
      create: jest.fn(),
    },
''',
        '''    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
''',
        1,
    )
    text = text.replace(
        '''    prisma.$transaction.mockImplementation(
      async (callback) => callback(prisma),
    );
''',
        '''    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      async (callback) => callback(prisma),
    );
''',
        1,
    )
    text = text.replace(
        '''          {
            id: 7,
            role: $Enums.Role.COBRADOR,
          },
        ),
''',
        '''          {
            id: 7,
            role: $Enums.Role.COBRADOR,
          },
          'payment-test-key-001',
        ),
''',
        1,
    )
    payment_spec.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Warehouse transfers
# ---------------------------------------------------------------------------
transfers = Path('src/warehouse-transfers/warehouse-transfers.service.ts')
text = transfers.read_text(encoding='utf-8')
text = text.replace(
    '''  async create(dto: CreateWarehouseTransferDto, userId: number) {
''',
    '''  async create(
    dto: CreateWarehouseTransferDto,
    userId: number,
    operationKey: string,
  ) {
    const existing = await this.prisma.warehouseTransfer.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true },
    });
    if (existing) return this.findOne(existing.id);
''',
    1,
)
text = text.replace(
    '''          transferNumber,
          originWarehouseId: originWarehouse.id,
''',
    '''          transferNumber,
          idempotencyKey: operationKey,
          originWarehouseId: originWarehouse.id,
''',
    1,
)
text = text.replace(
    '''  async cancel(id: string, userId: number) {
''',
    '''  async cancel(id: string, userId: number, reason: string) {
''',
    1,
)
text = text.replace(
    '''      if (transfer.status === $Enums.WarehouseTransferStatus.CANCELLED) {
        throw new BadRequestException('La transferencia ya fue anulada');
      }
''',
    '''      if (transfer.status === $Enums.WarehouseTransferStatus.CANCELLED) {
        return tx.warehouseTransfer.findUnique({
          where: { id },
          include: this.transferInclude(),
        });
      }
''',
    1,
)
text = text.replace(
    '''          status: $Enums.WarehouseTransferStatus.CANCELLED,
          cancelledAt: new Date(),
''',
    '''          status: $Enums.WarehouseTransferStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: reason,
''',
    1,
)
transfers.write_text(text, encoding='utf-8')

Path('src/warehouse-transfers/warehouse-transfers.controller.ts').write_text('''import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { WarehouseTransfersService } from './warehouse-transfers.service';

@Controller('warehouse-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
@Permissions(PERMISSIONS.INVENTORY_TRANSFER)
export class WarehouseTransfersController {
  constructor(
    private readonly service: WarehouseTransfersService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateWarehouseTransferDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: dto.details.flatMap((detail) => [
        `stock:${dto.originWarehouseId}:${detail.productId}`,
        `stock:${dto.destinationWarehouseId}:${detail.productId}`,
      ]),
      userId: req.user.id,
      action: 'WAREHOUSE_TRANSFER_CREATED',
      entityType: 'WAREHOUSE_TRANSFER',
      execute: async (key) => {
        const value = await this.service.create(dto, req.user.id, key);
        return {
          entityId: value!.id,
          value,
          details: { transferNumber: value!.transferNumber },
        };
      },
      resolveExisting: (id) => this.service.findOne(id),
    });
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la transferencia');
    return this.integrity.run({
      operationKey,
      locks: [`warehouse-transfer:${id}`],
      userId: req.user.id,
      action: 'WAREHOUSE_TRANSFER_CANCELLED',
      entityType: 'WAREHOUSE_TRANSFER',
      reason,
      execute: async () => {
        const value = await this.service.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { transferNumber: value!.transferNumber } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }
}
''', encoding='utf-8')

# Update transfer unit tests for new signatures.
transfer_spec = Path('src/warehouse-transfers/warehouse-transfers.service.spec.ts')
if transfer_spec.exists():
    text = transfer_spec.read_text(encoding='utf-8')
    text = re.sub(
        r'service\.create\(([^;]*?),\s*(\d+)\)',
        r"service.create(\1, \2, 'transfer-test-key-001')",
        text,
    )
    text = re.sub(
        r'service\.cancel\(([^,]+),\s*(\d+)\)',
        r"service.cancel(\1, \2, 'Motivo válido para anular')",
        text,
    )
    transfer_spec.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Purchases
# ---------------------------------------------------------------------------
purchases = Path('src/purchases/purchases.service.ts')
text = purchases.read_text(encoding='utf-8')
text = text.replace(
    '''  async create(
    createPurchaseDto: CreatePurchaseDto,
    userId: number,
  ): Promise<PurchaseResponseDto> {
''',
    '''  async create(
    createPurchaseDto: CreatePurchaseDto,
    userId: number,
    operationKey: string,
  ): Promise<PurchaseResponseDto> {
    const existing = await this.prisma.purchase.findUnique({
      where: { idempotencyKey: operationKey },
      select: { id: true },
    });
    if (existing) return this.findOne(existing.id);
''',
    1,
)
text = text.replace(
    '''      data: {
        userId,
        observations: createPurchaseDto.observations,
''',
    '''      data: {
        userId,
        idempotencyKey: operationKey,
        observations: createPurchaseDto.observations,
''',
    1,
)

text = text.replace(
    '''  async receiveProvider(
    purchaseId: string,
    purchaseProviderId: string,
    userId: number,
  ): Promise<PurchaseResponseDto> {
    const status = await this.prisma.$transaction(async (prisma) => {
''',
    '''  async receiveProvider(
    purchaseId: string,
    purchaseProviderId: string,
    userId: number,
  ): Promise<PurchaseResponseDto> {
    const existingStatus = await this.prisma.purchaseProvider.findFirst({
      where: { id: purchaseProviderId, purchaseId },
      select: { status: true },
    });
    if (existingStatus?.status === $Enums.PurchaseProviderStatus.RECEIVED) {
      return this.findOne(purchaseId);
    }

    const status = await this.prisma.$transaction(async (prisma) => {
''',
    1,
)
text = text.replace(
    '''          status: $Enums.PurchaseProviderStatus.RECEIVED,
          receivedAt: new Date(),
          cancelledAt: null,
''',
    '''          status: $Enums.PurchaseProviderStatus.RECEIVED,
          receivedAt: new Date(),
          receivedById: userId,
          cancelledAt: null,
          cancelledById: null,
          cancellationReason: null,
''',
    1,
)

text = text.replace(
    '''  async cancelProvider(
    purchaseId: string,
    purchaseProviderId: string,
    userId: number,
  ): Promise<PurchaseResponseDto> {
''',
    '''  async cancelProvider(
    purchaseId: string,
    purchaseProviderId: string,
    userId: number,
    reason: string,
  ): Promise<PurchaseResponseDto> {
''',
    1,
)
text = text.replace(
    '''      if (group.status === $Enums.PurchaseProviderStatus.CANCELLED) {
        throw new BadRequestException('El proveedor ya estÃ¡ anulado');
      }
''',
    '''      if (group.status === $Enums.PurchaseProviderStatus.CANCELLED) {
        return this.synchronizePurchase(prisma, purchaseId);
      }
''',
    1,
)
text = text.replace(
    '''          status: $Enums.PurchaseProviderStatus.CANCELLED,
          cancelledAt: new Date(),
''',
    '''          status: $Enums.PurchaseProviderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: reason,
''',
    1,
)

text = text.replace(
    '''  async cancel(id: string, userId: number): Promise<PurchaseResponseDto> {
''',
    '''  async cancel(
    id: string,
    userId: number,
    reason: string,
  ): Promise<PurchaseResponseDto> {
    const existing = await this.prisma.purchase.findUnique({
      where: { id },
      select: { status: true },
    });
    if (existing?.status === $Enums.PurchaseStatus.CANCELLED) {
      return this.findOne(id);
    }
''',
    1,
)
# First matching updateMany in whole purchase cancellation occurs after cancelProvider's single update;
# use the purchaseId-specific block.
text = text.replace(
    '''      await prisma.purchaseProvider.updateMany({
        where: {
          purchaseId: id,
        },
        data: {
          status: $Enums.PurchaseProviderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
''',
    '''      await prisma.purchaseProvider.updateMany({
        where: {
          purchaseId: id,
        },
        data: {
          status: $Enums.PurchaseProviderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: reason,
        },
      });
''',
    1,
)
text = text.replace(
    '''          status: $Enums.PurchaseStatus.CANCELLED,
          total: 0,
          pdfUrl: null,
''',
    '''          status: $Enums.PurchaseStatus.CANCELLED,
          total: 0,
          pdfUrl: null,
          cancelledById: userId,
          cancellationReason: reason,
''',
    1,
)
purchases.write_text(text, encoding='utf-8')

Path('src/purchases/purchases.controller.ts').write_text('''import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles($Enums.Role.ADMIN)
export class PurchasesController {
  constructor(
    private readonly service: PurchasesService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findAll(
    @Query('status') status?: $Enums.PurchaseStatus,
    @Query('providerId') providerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAll({
      status,
      providerId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASES_VIEW)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  create(
    @Body() dto: CreatePurchaseDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: dto.details.map((detail) => `purchase-product:${detail.productId}`),
      userId: req.user.id,
      action: 'PURCHASE_CREATED',
      entityType: 'PURCHASE',
      execute: async (key) => {
        const value = await this.service.create(dto, req.user.id, key);
        return { entityId: value.id, value, details: { total: value.total } };
      },
      resolveExisting: (id) => this.service.findOne(id),
    });
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`],
      userId: req.user.id,
      action: 'PURCHASE_UPDATED',
      entityType: 'PURCHASE',
      execute: async () => {
        const value = await this.service.update(id, dto);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/providers/:purchaseProviderId/receive')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  receiveProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') providerId: string,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`, `purchase-provider:${providerId}`],
      userId: req.user.id,
      action: 'PURCHASE_PROVIDER_RECEIVED',
      entityType: 'PURCHASE',
      execute: async () => {
        const value = await this.service.receiveProvider(id, providerId, req.user.id);
        return { entityId: id, value, details: { purchaseProviderId: providerId } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/providers/:purchaseProviderId/cancel')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancelProvider(
    @Param('id') id: string,
    @Param('purchaseProviderId') providerId: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la recepción del proveedor');
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`, `purchase-provider:${providerId}`],
      userId: req.user.id,
      action: 'PURCHASE_PROVIDER_CANCELLED',
      entityType: 'PURCHASE',
      reason,
      execute: async () => {
        const value = await this.service.cancelProvider(
          id,
          providerId,
          req.user.id,
          reason,
        );
        return { entityId: id, value, details: { purchaseProviderId: providerId } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }

  @Patch(':id/cancel')
  @Permissions(PERMISSIONS.PURCHASES_MANAGE)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'anular la compra');
    return this.integrity.run({
      operationKey,
      locks: [`purchase:${id}`],
      userId: req.user.id,
      action: 'PURCHASE_CANCELLED',
      entityType: 'PURCHASE',
      reason,
      execute: async () => {
        const value = await this.service.cancel(id, req.user.id, reason);
        return { entityId: id, value, details: { total: value.total } };
      },
      resolveExisting: () => this.service.findOne(id),
    });
  }
}
''', encoding='utf-8')

# ---------------------------------------------------------------------------
# Inventory adjustments
# ---------------------------------------------------------------------------
inventory = Path('src/inventory/inventory.service.ts')
text = inventory.read_text(encoding='utf-8')
adjust_method = '''
  async adjustStock(
    dto: import('./dto/adjust-inventory.dto').AdjustInventoryDto,
    userId: number,
  ) {
    return this.prisma.$transaction(async (prisma) => {
      const [warehouse, product, current] = await Promise.all([
        prisma.warehouse.findFirst({
          where: { id: dto.warehouseId, isActive: true },
          select: { id: true, name: true },
        }),
        prisma.product.findUnique({
          where: { id: dto.productId },
          select: { id: true, name: true, stock: true },
        }),
        prisma.warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: dto.warehouseId,
              productId: dto.productId,
            },
          },
          select: { stock: true, reservedStock: true },
        }),
      ]);

      if (!warehouse) throw new BadRequestException('Almacén no disponible');
      if (!product) throw new BadRequestException('Producto no encontrado');

      const previousStock = this.roundQuantity(current?.stock || 0);
      const reservedStock = this.roundQuantity(current?.reservedStock || 0);
      const newStock = this.roundQuantity(previousStock + dto.quantityChange);
      const globalStock = this.roundQuantity(product.stock + dto.quantityChange);

      if (newStock < 0 || globalStock < 0) {
        throw new BadRequestException('El ajuste dejaría el stock en negativo');
      }
      if (newStock < reservedStock) {
        throw new BadRequestException(
          'El ajuste no puede dejar el stock por debajo de la cantidad reservada',
        );
      }

      await prisma.warehouseStock.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
          },
        },
        create: {
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          stock: newStock,
        },
        update: { stock: newStock },
      });
      await prisma.product.update({
        where: { id: dto.productId },
        data: { stock: globalStock },
      });
      const movement = await prisma.inventoryMovement.create({
        data: {
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          userId,
          type:
            dto.quantityChange > 0
              ? $Enums.InventoryMovementType.ADJUSTMENT_IN
              : $Enums.InventoryMovementType.ADJUSTMENT_OUT,
          quantity: Math.abs(dto.quantityChange),
          previousStock,
          newStock,
          observations: dto.reason.trim(),
        },
      });

      return {
        movementId: movement.id,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        productId: product.id,
        productName: product.name,
        previousStock,
        quantityChange: dto.quantityChange,
        newStock,
        reservedStock,
      };
    });
  }

'''
if 'async adjustStock(' not in text:
    marker = '  private buildInventoryHTML('
    if marker not in text:
        raise SystemExit('No se encontró buildInventoryHTML')
    text = text.replace(marker, adjust_method + marker, 1)
inventory.write_text(text, encoding='utf-8')

Path('src/inventory/inventory.controller.ts').write_text('''import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly integrity: EconomicIntegrityService,
  ) {}

  @Get()
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  getInventory() {
    return this.inventoryService.getInventory();
  }

  @Post('adjustments')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  adjustStock(
    @Body() dto: AdjustInventoryDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'ajustar el inventario');
    return this.integrity.run({
      operationKey,
      locks: [`stock:${dto.warehouseId}:${dto.productId}`],
      userId: req.user.id,
      action: 'INVENTORY_ADJUSTED',
      entityType: 'INVENTORY_MOVEMENT',
      reason,
      execute: async () => {
        const value = await this.inventoryService.adjustStock(
          { ...dto, reason },
          req.user.id,
        );
        return {
          entityId: value.movementId,
          value,
          details: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
            previousStock: value.previousStock,
            quantityChange: value.quantityChange,
            newStock: value.newStock,
          },
        };
      },
      resolveExisting: async () =>
        this.inventoryService.adjustStock(
          { ...dto, quantityChange: 0 } as AdjustInventoryDto,
          req.user.id,
        ),
    });
  }

  @Post('pdf')
  @Roles($Enums.Role.ADMIN, $Enums.Role.VENDEDOR)
  @Permissions(PERMISSIONS.REPORTS_INVENTORY)
  async generatePDF(@Request() req: any) {
    const result = await this.inventoryService.generateInventoryPDF(req.user.id);
    return {
      success: true,
      pdfUrl: result.pdfUrl,
      historyId: result.historyId,
      message: 'PDF generado exitosamente',
    };
  }

  @Get('history')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.REPORTS_HISTORY_ALL)
  getHistory(@Request() req: any) {
    return this.inventoryService.getHistory(req.user.id);
  }
}
''', encoding='utf-8')

# Add read-only resolver for an existing adjustment instead of applying quantity zero.
# Replace the temporary resolver with a current stock lookup endpoint helper.
text = Path('src/inventory/inventory.service.ts').read_text(encoding='utf-8')
if 'async getStockPosition(' not in text:
    marker = '  async adjustStock('
    method = '''  async getStockPosition(warehouseId: string, productId: string) {
    const position = await this.prisma.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
      include: {
        warehouse: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    });
    if (!position) throw new BadRequestException('No existe stock para el producto');
    return {
      warehouseId,
      warehouseName: position.warehouse.name,
      productId,
      productName: position.product.name,
      previousStock: position.stock,
      quantityChange: 0,
      newStock: position.stock,
      reservedStock: position.reservedStock,
    };
  }

'''
    text = text.replace(marker, method + marker, 1)
Path('src/inventory/inventory.service.ts').write_text(text, encoding='utf-8')
replace_once(
    'src/inventory/inventory.controller.ts',
    '''      resolveExisting: async () =>
        this.inventoryService.adjustStock(
          { ...dto, quantityChange: 0 } as AdjustInventoryDto,
          req.user.id,
        ),
''',
    '''      resolveExisting: () =>
        this.inventoryService.getStockPosition(dto.warehouseId, dto.productId),
''',
)

# ---------------------------------------------------------------------------
# Collection assignments: idempotency and audit, unassignment reason
# ---------------------------------------------------------------------------
collections = Path('src/collections/collections.controller.ts')
text = collections.read_text(encoding='utf-8')
text = text.replace('  Delete,\n', '')
text = text.replace('  Get,\n', '  Get,\n  Headers,\n')
text = text.replace(
    "import { CollectionsService } from './collections.service';\n",
    "import { CollectionsService } from './collections.service';\nimport { CancelEconomicOperationDto } from '../economic-integrity/dto/cancel-economic-operation.dto';\nimport { EconomicIntegrityService } from '../economic-integrity/economic-integrity.service';\n",
    1,
)
text = text.replace(
    '''    private readonly collectionsService: CollectionsService,
    private readonly dataScope: DataScopeService,
  ) {}
''',
    '''    private readonly collectionsService: CollectionsService,
    private readonly dataScope: DataScopeService,
    private readonly integrity: EconomicIntegrityService,
  ) {}
''',
    1,
)

assign_replacement = '''  @Patch('sales/:saleId/assignment')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.COLLECTIONS_ASSIGN)
  assign(
    @Param('saleId') saleId: string,
    @Body() dto: AssignCollectionDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    return this.integrity.run({
      operationKey,
      locks: [`sale:${saleId}`],
      userId: req.user.id,
      action: 'COLLECTION_ASSIGNED',
      entityType: 'SALE',
      execute: async () => {
        const value = await this.collectionsService.assign(
          saleId,
          dto.assignedToId,
          req.user,
        );
        return {
          entityId: saleId,
          value,
          details: { assignedToId: dto.assignedToId },
        };
      },
      resolveExisting: () =>
        this.collectionsService.assign(saleId, dto.assignedToId, req.user),
    });
  }

  @Patch('sales/:saleId/assignment/remove')
  @Roles($Enums.Role.ADMIN)
  @Permissions(PERMISSIONS.COLLECTIONS_ASSIGN)
  unassign(
    @Param('saleId') saleId: string,
    @Body() dto: CancelEconomicOperationDto,
    @Request() req: any,
    @Headers('idempotency-key') operationKey?: string,
  ) {
    const reason = this.integrity.reason(dto.reason, 'quitar la asignación');
    return this.integrity.run({
      operationKey,
      locks: [`sale:${saleId}`],
      userId: req.user.id,
      action: 'COLLECTION_UNASSIGNED',
      entityType: 'SALE',
      reason,
      execute: async () => {
        const value = await this.collectionsService.unassign(saleId, req.user);
        return { entityId: saleId, value, details: { saleId } };
      },
      resolveExisting: async () => ({ message: 'La asignación ya fue eliminada' }),
    });
  }

'''
text, count = re.subn(
    r"  @Patch\('sales/:saleId/assignment'\).*?\n  @Post\('reports/general-pdf'\)",
    assign_replacement + "  @Post('reports/general-pdf')",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('No se pudieron reemplazar asignaciones de cobranza')
collections.write_text(text, encoding='utf-8')

# ---------------------------------------------------------------------------
# Helper tests
# ---------------------------------------------------------------------------
Path('src/economic-integrity/economic-integrity.spec.ts').write_text('''import { BadRequestException } from '@nestjs/common';
import {
  requireOperationKey,
  requireReason,
  roundMoney,
  roundQuantity,
} from './economic-integrity';

describe('economic integrity helpers', () => {
  it('normaliza dinero y cantidades', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundQuantity(1.23456789)).toBe(1.234568);
  });

  it('exige una clave de idempotencia válida', () => {
    expect(requireOperationKey('sale:abc-123')).toBe('sale:abc-123');
    expect(() => requireOperationKey('x')).toThrow(BadRequestException);
    expect(() => requireOperationKey(undefined)).toThrow(BadRequestException);
  });

  it('exige motivo suficiente para reversar operaciones', () => {
    expect(requireReason('Error de registro confirmado')).toBe(
      'Error de registro confirmado',
    );
    expect(() => requireReason('corto')).toThrow(BadRequestException);
  });
});
''', encoding='utf-8')
