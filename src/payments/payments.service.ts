import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentResponseDto, SalePaymentStatusDto } from './dto/payment-response.dto';
import { PaymentMethod, SaleStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

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

  // ====== CREATE PAYMENT ======
  async create(createPaymentDto: CreatePaymentDto, userId: string): Promise<PaymentResponseDto> {
    const { saleId, clientId, amount, method, reference, observations } = createPaymentDto;

    // Validar que la venta existe y no está anulada
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('No se puede registrar pagos en una venta anulada');
    }

    // Validar que el cliente coincide con el de la venta
    if (sale.clientId !== clientId) {
      throw new BadRequestException('El cliente no coincide con el de la venta');
    }

    // Calcular total pagado hasta ahora
    const totalPaid = sale.payments.reduce((sum, p) => sum + p.amount, 0) + amount;
    const balance = sale.total - totalPaid;

    // Validar que no se pague más del total
    if (totalPaid > sale.total) {
      throw new BadRequestException(`El monto total pagado (${totalPaid}) excede el total de la venta (${sale.total})`);
    }

    // Crear el pago en transacción
    return this.prisma.$transaction(async (prisma) => {
      // 1. Crear el pago
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

      // 2. Actualizar estado de la venta
      let newStatus: SaleStatus;
      if (balance <= 0) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      } else {
        newStatus = 'CONFIRMED'; // Si no se ha pagado nada, queda como CONFIRMED
      }

      await prisma.sale.update({
        where: { id: saleId },
        data: { status: newStatus },
      });

      return this.toResponse(payment);
    });
  }

  // ====== UPDATE PAYMENT ======
  async update(id: string, updatePaymentDto: UpdatePaymentDto, userId: string): Promise<PaymentResponseDto> {
    // Obtener el pago existente
    const existingPayment = await this.prisma.payment.findUnique({
      where: { id },
      include: { sale: { include: { payments: true } } },
    });
    if (!existingPayment) throw new NotFoundException('Pago no encontrado');

    const sale = existingPayment.sale;
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('No se puede editar pagos en una venta anulada');
    }

    // Calcular el nuevo total pagado (restando el monto anterior y sumando el nuevo)
    const oldAmount = existingPayment.amount;
    const newAmount = updatePaymentDto.amount !== undefined ? updatePaymentDto.amount : oldAmount;
    const totalPaid = sale.payments.reduce((sum, p) => {
      if (p.id === id) return sum + newAmount;
      return sum + p.amount;
    }, 0);
    const balance = sale.total - totalPaid;

    if (totalPaid > sale.total) {
      throw new BadRequestException(`El monto total pagado (${totalPaid}) excede el total de la venta (${sale.total})`);
    }

    return this.prisma.$transaction(async (prisma) => {
      // 1. Actualizar el pago
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

      // 2. Actualizar estado de la venta
      let newStatus: SaleStatus;
      if (balance <= 0) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      } else {
        newStatus = 'CONFIRMED';
      }

      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });

      return this.toResponse(updated);
    });
  }

  // ====== DELETE PAYMENT ======
  async remove(id: string, userId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { sale: { include: { payments: true } } },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');

    const sale = payment.sale;
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('No se puede eliminar pagos en una venta anulada');
    }

    return this.prisma.$transaction(async (prisma) => {
      // 1. Eliminar el pago
      await prisma.payment.delete({ where: { id } });

      // 2. Recalcular estado de la venta
      const remainingPayments = sale.payments.filter(p => p.id !== id);
      const totalPaid = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
      const balance = sale.total - totalPaid;

      let newStatus: SaleStatus;
      if (balance <= 0) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      } else {
        newStatus = 'CONFIRMED';
      }

      await prisma.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });
    });
  }

  // ====== FIND ALL PAYMENTS ======
  async findAll(filters?: { saleId?: string; clientId?: string; method?: PaymentMethod; dateFrom?: Date; dateTo?: Date }) {
    const where: any = {};
    if (filters?.saleId) where.saleId = filters.saleId;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.method) where.method = filters.method;
    if (filters?.dateFrom || filters?.dateTo) {
      where.receivedAt = {};
      if (filters.dateFrom) where.receivedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.receivedAt.lte = filters.dateTo;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        user: true,
        sale: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    return payments.map(p => this.toResponse(p));
  }

  // ====== FIND ONE PAYMENT ======
  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        client: true,
        user: true,
        sale: true,
      },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return this.toResponse(payment);
  }

  // ====== GET SALE PAYMENT STATUS ======
  async getSalePaymentStatus(saleId: string): Promise<SalePaymentStatusDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    const totalPaid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = sale.total - totalPaid;

    return {
      saleId: sale.id,
      total: sale.total,
      paid: totalPaid,
      balance: balance,
      status: sale.status,
    };
  }

  // ====== GET CLIENT BALANCE ======
  async getClientBalance(clientId: string): Promise<{ totalDebt: number; totalPaid: number; balance: number }> {
    // Obtener todas las ventas del cliente que no estén pagadas o anuladas
    const sales = await this.prisma.sale.findMany({
      where: {
        clientId,
        status: {
          in: ['CONFIRMED', 'PARTIALLY_PAID'],
        },
      },
      include: { payments: true },
    });

    let totalDebt = 0;
    let totalPaid = 0;

    for (const sale of sales) {
      totalDebt += sale.total;
      totalPaid += sale.payments.reduce((sum, p) => sum + p.amount, 0);
    }

    return {
      totalDebt,
      totalPaid,
      balance: totalDebt - totalPaid,
    };
  }

  // ====== GET COLLECTION REPORT ======
  async getCollectionReport(filters?: { dateFrom?: Date; dateTo?: Date; clientId?: string }) {
    const where: any = {};
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.receivedAt = {};
      if (filters.dateFrom) where.receivedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.receivedAt.lte = filters.dateTo;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        client: true,
        user: true,
        sale: true,
      },
      orderBy: { receivedAt: 'desc' },
    });

    // Agrupar por método de pago
    const summary = {
      totalCASH: 0,
      totalQR: 0,
      totalBANK_TRANSFER: 0,
      total: 0,
      count: payments.length,
    };

    for (const p of payments) {
      summary.total += p.amount;
      if (p.method === 'CASH') summary.totalCASH += p.amount;
      else if (p.method === 'QR') summary.totalQR += p.amount;
      else if (p.method === 'BANK_TRANSFER') summary.totalBANK_TRANSFER += p.amount;
    }

    return {
      payments: payments.map(p => this.toResponse(p)),
      summary,
    };
  }
}