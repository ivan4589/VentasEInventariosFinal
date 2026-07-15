import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { SaleResponseDto } from './dto/sale-response.dto';
import { SaleStatus, PaymentStatus } from '@prisma/client';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const prefix = `${day}-${month}`;

    // Buscar el último número de venta del día
    const lastSale = await this.prisma.sale.findFirst({
      where: {
        saleNumber: { startsWith: prefix },
      },
      orderBy: { saleNumber: 'desc' },
    });

    let nextNumber = 1;
    if (lastSale) {
      const parts = lastSale.saleNumber.split('-');
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }

    const numberStr = String(nextNumber).padStart(3, '0');
    return `${prefix}-${numberStr}`;
  }

  private toResponse(sale: any): SaleResponseDto {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      clientId: sale.clientId,
      clientName: sale.client?.fullName || '',
      userId: sale.userId,
      userName: sale.user?.name || '',
      date: sale.date,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      total: sale.total,
      discount: sale.discount,
      observations: sale.observations,
      pdfUrl: sale.pdfUrl,
      details: sale.details?.map(d => ({
        id: d.id,
        productId: d.productId,
        productName: d.product?.name || '',
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        subtotal: d.subtotal,
      })) || [],
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  // ====== CREATE ======
  async create(createSaleDto: CreateSaleDto, userId: string): Promise<SaleResponseDto> {
    const { clientId, details, discount = 0, observations, paymentStatus } = createSaleDto;

    // Validar cliente
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    // Validar productos
    const productIds = details.map(d => d.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Algunos productos no existen');
    }

    // Calcular total
    const total = details.reduce((sum, d) => sum + d.quantity * d.unitPrice, 0) - discount;

    // Generar número de venta
    const saleNumber = await this.generateSaleNumber();

    // Crear venta en estado PENDING (o CONFIRMED si es contado)
    const status = paymentStatus === PaymentStatus.PAID ? SaleStatus.CONFIRMED : SaleStatus.PENDING;

    const sale = await this.prisma.sale.create({
      data: {
        saleNumber,
        clientId,
        userId,
        status,
        paymentStatus,
        total,
        discount,
        observations,
        details: {
          create: details.map(d => ({
            productId: d.productId,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
            subtotal: d.quantity * d.unitPrice,
          })),
        },
      },
      include: {
        client: true,
        user: true,
        details: { include: { product: true } },
      },
    });

    // Si es contado (PAID), confirmar automáticamente
    if (paymentStatus === PaymentStatus.PAID) {
      return this.confirm(sale.id, userId);
    }

    return this.toResponse(sale);
  }

  // ====== CONFIRM ======
  async confirm(id: string, userId: string): Promise<SaleResponseDto> {
    return this.prisma.$transaction(async (prisma) => {
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          details: { include: { product: true } },
        },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'PENDING') {
        throw new BadRequestException('Solo se pueden confirmar ventas en estado PENDING');
      }

      // Verificar stock y descontar
      const lowStockAlerts = [];
      for (const detail of sale.details) {
        const product = detail.product;
        if (product.stock < detail.quantity) {
          throw new BadRequestException(`Stock insuficiente para el producto ${product.name}. Disponible: ${product.stock}, solicitado: ${detail.quantity}`);
        }

        const newStock = product.stock - detail.quantity;
        await prisma.product.update({
          where: { id: detail.productId },
          data: { stock: newStock },
        });

        // Registrar movimiento de inventario
        await prisma.inventoryMovement.create({
          data: {
            productId: detail.productId,
            userId: userId,
            type: 'SALE',
            quantity: -detail.quantity,
            referenceId: sale.id,
            note: `Venta #${sale.saleNumber}`,
            stockBefore: product.stock,
            stockAfter: newStock,
          },
        });

        // Alerta de stock bajo
        if (newStock < product.minStock) {
          lowStockAlerts.push({
            productId: product.id,
            productName: product.name,
            currentStock: newStock,
            minStock: product.minStock,
          });
        }
      }

      // Cambiar estado a CONFIRMED
      const updated = await prisma.sale.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: {
          client: true,
          user: true,
          details: { include: { product: true } },
        },
      });

      // Generar PDF
      const pdfUrl = await this.reportsService.generateSalePDF(updated.id);
      await prisma.sale.update({
        where: { id },
        data: { pdfUrl },
      });

      const result = await prisma.sale.findUnique({
        where: { id },
        include: {
          client: true,
          user: true,
          details: { include: { product: true } },
        },
      });

      return {
        ...this.toResponse(result),
        lowStockAlerts, // Incluir alertas en la respuesta
      };
    });
  }

  // ====== UPDATE (solo si PENDING) ======
  async update(id: string, updateSaleDto: UpdateSaleDto, userId: string): Promise<SaleResponseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden editar ventas en estado PENDING');
    }

    const { details, discount, observations } = updateSaleDto;

    let total = sale.total;
    if (details) {
      // Eliminar detalles antiguos
      await this.prisma.saleDetail.deleteMany({
        where: { saleId: id },
      });
      // Crear nuevos detalles
      const newDetails = details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        subtotal: d.quantity * d.unitPrice,
      }));
      total = newDetails.reduce((sum, d) => sum + d.subtotal, 0) - (discount !== undefined ? discount : sale.discount);
      await this.prisma.saleDetail.createMany({
        data: newDetails.map(d => ({ ...d, saleId: id })),
      });
    }

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        discount: discount !== undefined ? discount : sale.discount,
        observations: observations !== undefined ? observations : sale.observations,
        total,
      },
      include: {
        client: true,
        user: true,
        details: { include: { product: true } },
      },
    });

    return this.toResponse(updated);
  }

  // ====== CANCEL ======
  async cancel(id: string, userId: string): Promise<SaleResponseDto> {
    return this.prisma.$transaction(async (prisma) => {
      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          details: { include: { product: true } },
        },
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('La venta ya está anulada');
      }

      // Si estaba confirmada, reponer stock
      if (sale.status === 'CONFIRMED') {
        for (const detail of sale.details) {
          const product = detail.product;
          const newStock = product.stock + detail.quantity;
          await prisma.product.update({
            where: { id: detail.productId },
            data: { stock: newStock },
          });
          await prisma.inventoryMovement.create({
            data: {
              productId: detail.productId,
              userId: userId,
              type: 'ADJUSTMENT',
              quantity: detail.quantity,
              referenceId: sale.id,
              note: `Anulación de venta #${sale.saleNumber}`,
              stockBefore: product.stock,
              stockAfter: newStock,
            },
          });
        }
      }

      const cancelled = await prisma.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          client: true,
          user: true,
          details: { include: { product: true } },
        },
      });

      return this.toResponse(cancelled);
    });
  }

  // ====== FIND ALL ======
  async findAll(filters?: { 
    status?: SaleStatus; 
    paymentStatus?: PaymentStatus; 
    clientId?: string; 
    dateFrom?: Date; 
    dateTo?: Date;
  }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        client: true,
        user: true,
        details: { include: { product: true } },
      },
      orderBy: { date: 'desc' },
    });

    return sales.map(s => this.toResponse(s));
  }

  // ====== FIND ONE ======
  async findOne(id: string): Promise<SaleResponseDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        user: true,
        details: { include: { product: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return this.toResponse(sale);
  }

  // ====== REPORTE DE STOCK BAJO ======
  async getLowStockProducts() {
    const products = await this.prisma.product.findMany({
      where: {
        stock: { lt: this.prisma.product.fields.minStock },
      },
    });
    return products;
  }
}