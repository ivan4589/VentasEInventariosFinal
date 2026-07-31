import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  PaymentResponseDto,
  SalePaymentStatusDto,
} from './dto/payment-response.dto';
import { CollectionsService } from '../collections/collections.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collectionsService: CollectionsService,
  ) {}

  private toResponse(payment: any): PaymentResponseDto {
    return {
      id: payment.id,
      saleId: payment.saleId,
      clientId: payment.clientId,
      clientName: payment.client?.fullName || '',
      userId: payment.userId,
      userName: payment.user?.name || '',
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      observations: payment.observations,
      isReversal: payment.isReversal ?? false,
      reversalOfId: payment.reversalOfId ?? null,
      cancelledAt: payment.cancelledAt ?? null,
      cancellationReason: payment.cancellationReason ?? null,
      receivedAt: payment.receivedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private calculatePaymentStatus(
    saleTotal: number,
    totalPaid: number,
  ): $Enums.PaymentStatus {
    if (totalPaid <= 0) {
      return $Enums.PaymentStatus.PENDING;
    }

    if (totalPaid >= saleTotal) {
      return $Enums.PaymentStatus.PAID;
    }

    return $Enums.PaymentStatus.PARTIALLY_PAID;
  }

  async create(
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

  async update(
    _id: string,
    _updatePaymentDto: UpdatePaymentDto,
  ): Promise<PaymentResponseDto> {
    throw new BadRequestException(
      'Los pagos confirmados son inmutables. Debes anularlos mediante una reversión',
    );
  }

  async remove(
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

  async findAll(filters?: {
    saleId?: string;
    clientId?: string;
    method?: $Enums.PaymentMethod;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<PaymentResponseDto[]> {
    const where: any = {};

    if (filters?.saleId) {
      where.saleId = filters.saleId;
    }

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.method) {
      where.method = filters.method;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.receivedAt = {};

      if (filters.dateFrom) {
        where.receivedAt.gte = filters.dateFrom;
      }

      if (filters.dateTo) {
        where.receivedAt.lte = filters.dateTo;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        user: true,
        sale: true,
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    return payments.map((payment) => this.toResponse(payment));
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        client: true,
        user: true,
        sale: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    return this.toResponse(payment);
  }

  async getSalePaymentStatus(saleId: string): Promise<SalePaymentStatusDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    const totalPaid = sale.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    const balance = sale.total - totalPaid;

    return {
      saleId: sale.id,
      total: sale.total,
      paid: totalPaid,
      balance,
      saleStatus: sale.status,
      paymentStatus: sale.paymentStatus,
    };
  }

  async getClientBalance(clientId: string): Promise<{
    totalDebt: number;
    totalPaid: number;
    balance: number;
  }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        clientId,
        status: $Enums.SaleStatus.CONFIRMED,
        paymentStatus: {
          in: [
            $Enums.PaymentStatus.PENDING,
            $Enums.PaymentStatus.PARTIALLY_PAID,
          ],
        },
      },
      include: {
        payments: true,
      },
    });

    let totalDebt = 0;
    let totalPaid = 0;

    for (const sale of sales) {
      totalDebt += sale.total;
      totalPaid += sale.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
    }

    return {
      totalDebt,
      totalPaid,
      balance: totalDebt - totalPaid,
    };
  }

  async getCollectionReport(filters?: {
    dateFrom?: Date;
    dateTo?: Date;
    clientId?: string;
  }) {
    const where: any = {};

    if (filters?.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters?.dateFrom || filters?.dateTo) {
      where.receivedAt = {};

      if (filters.dateFrom) {
        where.receivedAt.gte = filters.dateFrom;
      }

      if (filters.dateTo) {
        where.receivedAt.lte = filters.dateTo;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        user: true,
        sale: true,
      },
      orderBy: {
        receivedAt: 'desc',
      },
    });

    const summary = {
      totalCASH: 0,
      totalQR: 0,
      totalBANK_TRANSFER: 0,
      total: 0,
      count: payments.length,
    };

    for (const payment of payments) {
      summary.total += payment.amount;

      if (payment.method === $Enums.PaymentMethod.CASH) {
        summary.totalCASH += payment.amount;
      }

      if (payment.method === $Enums.PaymentMethod.QR) {
        summary.totalQR += payment.amount;
      }

      if (payment.method === $Enums.PaymentMethod.BANK_TRANSFER) {
        summary.totalBANK_TRANSFER += payment.amount;
      }
    }

    return {
      payments: payments.map((payment) => this.toResponse(payment)),
      summary,
    };
  }
}
