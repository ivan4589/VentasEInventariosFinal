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

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
    userId: number,
  ): Promise<PaymentResponseDto> {
    const { saleId, clientId, amount, method, reference, observations } =
      createPaymentDto;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        payments: true,
        client: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    if (sale.status === $Enums.SaleStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede registrar pagos en una venta anulada',
      );
    }

    if (sale.status !== $Enums.SaleStatus.CONFIRMED) {
      throw new BadRequestException(
        'Solo se puede registrar pagos en ventas confirmadas',
      );
    }

    if (sale.clientId !== clientId) {
      throw new BadRequestException('El cliente no coincide con el de la venta');
    }

    const alreadyPaid = sale.payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    const totalPaid = alreadyPaid + amount;

    if (totalPaid > sale.total) {
      throw new BadRequestException(
        `El monto total pagado (${totalPaid}) excede el total de la venta (${sale.total})`,
      );
    }

    const newPaymentStatus = this.calculatePaymentStatus(sale.total, totalPaid);

    return this.prisma.$transaction(async (prisma) => {
      const payment = await prisma.payment.create({
        data: {
          saleId,
          clientId,
          userId,
          amount,
          method,
          reference,
          observations,
        },
        include: {
          client: true,
          user: true,
        },
      });

      await prisma.sale.update({
        where: { id: saleId },
        data: {
          paymentStatus: newPaymentStatus,
        },
      });

      return this.toResponse(payment);
    });
  }

  async update(
    id: string,
    updatePaymentDto: UpdatePaymentDto,
  ): Promise<PaymentResponseDto> {
    const existingPayment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            payments: true,
          },
        },
      },
    });

    if (!existingPayment) {
      throw new NotFoundException('Pago no encontrado');
    }

    const sale = existingPayment.sale;

    if (sale.status === $Enums.SaleStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede editar pagos en una venta anulada',
      );
    }

    const newAmount =
      updatePaymentDto.amount !== undefined
        ? updatePaymentDto.amount
        : existingPayment.amount;

    const totalPaid = sale.payments.reduce((sum, payment) => {
      if (payment.id === id) {
        return sum + newAmount;
      }

      return sum + payment.amount;
    }, 0);

    if (totalPaid > sale.total) {
      throw new BadRequestException(
        `El monto total pagado (${totalPaid}) excede el total de la venta (${sale.total})`,
      );
    }

    const newPaymentStatus = this.calculatePaymentStatus(sale.total, totalPaid);

    return this.prisma.$transaction(async (prisma) => {
      const updated = await prisma.payment.update({
        where: { id },
        data: {
          amount: newAmount,
          method: updatePaymentDto.method,
          reference: updatePaymentDto.reference,
          observations: updatePaymentDto.observations,
        },
        include: {
          client: true,
          user: true,
        },
      });

      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          paymentStatus: newPaymentStatus,
        },
      });

      return this.toResponse(updated);
    });
  }

  async remove(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            payments: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    const sale = payment.sale;

    if (sale.status === $Enums.SaleStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede eliminar pagos en una venta anulada',
      );
    }

    const remainingPayments = sale.payments.filter(
      (currentPayment) => currentPayment.id !== id,
    );

    const totalPaid = remainingPayments.reduce(
      (sum, currentPayment) => sum + currentPayment.amount,
      0,
    );

    const newPaymentStatus = this.calculatePaymentStatus(sale.total, totalPaid);

    await this.prisma.$transaction(async (prisma) => {
      await prisma.payment.delete({
        where: { id },
      });

      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          paymentStatus: newPaymentStatus,
        },
      });
    });

    return {
      message: 'Pago eliminado correctamente',
    };
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