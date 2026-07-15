import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { PurchaseStatus } from '@prisma/client';
import { ReportsService } from '../reports/reports.service'; // Lo crearemos luego

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService, // Para generar PDF
  ) {}

  private toResponse(purchase: any): PurchaseResponseDto {
    return {
      id: purchase.id,
      providerId: purchase.providerId,
      providerName: purchase.provider?.companyName || '',
      userId: purchase.userId,
      userName: purchase.user?.name || '',
      date: purchase.date,
      status: purchase.status,
      total: purchase.total,
      observations: purchase.observations,
      pdfUrl: purchase.pdfUrl,
      details: purchase.details?.map(d => ({
        id: d.id,
        productId: d.productId,
        productName: d.product?.name || '',
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        subtotal: d.subtotal,
      })) || [],
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  // ====== CREATE ======
  async create(createPurchaseDto: CreatePurchaseDto, userId: string): Promise<PurchaseResponseDto> {
    const { providerId, observations, details, updatePrices } = createPurchaseDto;

    // Validar que todos los productos existan
    const productIds = details.map(d => d.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Algunos productos no existen');
    }

    const total = details.reduce((sum, d) => sum + d.quantity * d.unitPrice, 0);

    // Crear la compra en estado PENDING
    const purchase = await this.prisma.purchase.create({
      data: {
        providerId,
        userId,
        observations,
        total,
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
        provider: true,
        user: true,
        details: { include: { product: true } },
      },
    });

    return this.toResponse(purchase);
  }

  // ====== RECEIVE ======
  async receive(id: string, receiveDto: ReceivePurchaseDto, userId: string): Promise<PurchaseResponseDto> {
    const { updatePrices = true } = receiveDto;

    return this.prisma.$transaction(async (prisma) => {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          details: { include: { product: true } },
        },
      });
      if (!purchase) throw new NotFoundException('Compra no encontrada');
      if (purchase.status !== 'PENDING') {
        throw new BadRequestException('Solo se puede recibir compras en estado PENDIENTE');
      }

      // Actualizar cada producto
      for (const detail of purchase.details) {
        const product = detail.product;

        // Calcular nuevo stock
        const newStock = product.stock + detail.quantity;

        // Preparar datos de actualización
        const updateData: any = {
          stock: newStock,
          purchasePrice: detail.unitPrice, // Último precio de compra
        };

        // Recalcular precios de venta si se solicita
        if (updatePrices) {
          updateData.priceNormal = detail.unitPrice * (1 + product.markupNormal / 100);
          updateData.priceCamino = detail.unitPrice * (1 + product.markupCamino / 100);
          updateData.priceEspecial = detail.unitPrice * (1 + product.markupEspecial / 100);
          if (product.priceMayorista !== null) {
            updateData.priceMayorista = detail.unitPrice * (1 + product.markupMayorista / 100);
          }
        }

        await prisma.product.update({
          where: { id: detail.productId },
          data: updateData,
        });

        // Registrar movimiento de inventario
        await prisma.inventoryMovement.create({
          data: {
            productId: detail.productId,
            userId: userId,
            type: 'PURCHASE',
            quantity: detail.quantity,
            referenceId: purchase.id,
            note: `Compra #${purchase.id} - Proveedor: ${purchase.providerId}`,
            stockBefore: product.stock,
            stockAfter: newStock,
          },
        });
      }

      // Cambiar estado a RECEIVED
      const updated = await prisma.purchase.update({
        where: { id },
        data: { status: 'RECEIVED' },
        include: {
          provider: true,
          user: true,
          details: { include: { product: true } },
        },
      });

      // Generar PDF automáticamente
      const pdfUrl = await this.reportsService.generatePurchasePDF(updated.id);
      await prisma.purchase.update({
        where: { id },
        data: { pdfUrl },
      });

      // Volver a obtener con pdfUrl actualizado
      return this.toResponse(await prisma.purchase.findUnique({
        where: { id },
        include: {
          provider: true,
          user: true,
          details: { include: { product: { include: { category: true } } } },
        },
      }));
    });
  }

  // ====== UPDATE (solo si PENDING) ======
  async update(id: string, updatePurchaseDto: UpdatePurchaseDto, userId: string): Promise<PurchaseResponseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { details: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden editar compras en estado PENDIENTE');
    }

    const { observations, details, updatePrices } = updatePurchaseDto;

    // Recalcular total si se actualizan detalles
    let total = purchase.total;
    if (details) {
      // Eliminar detalles antiguos
      await this.prisma.purchaseDetail.deleteMany({
        where: { purchaseId: id },
      });
      // Crear nuevos detalles
      const newDetails = details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        subtotal: d.quantity * d.unitPrice,
      }));
      total = newDetails.reduce((sum, d) => sum + d.subtotal, 0);
      await this.prisma.purchaseDetail.createMany({
        data: newDetails.map(d => ({ ...d, purchaseId: id })),
      });
    }

    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        observations: observations !== undefined ? observations : purchase.observations,
        total,
      },
      include: {
        provider: true,
        user: true,
        details: { include: { product: true } },
      },
    });

    return this.toResponse(updated);
  }

  // ====== CANCEL ======
  async cancel(id: string, userId: string): Promise<PurchaseResponseDto> {
    return this.prisma.$transaction(async (prisma) => {
      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          details: { include: { product: true } },
        },
      });
      if (!purchase) throw new NotFoundException('Compra no encontrada');
      if (purchase.status === 'CANCELLED') {
        throw new BadRequestException('La compra ya está anulada');
      }
      if (purchase.status === 'RECEIVED') {
        // Si ya fue recibida, debemos revertir el stock
        for (const detail of purchase.details) {
          const product = detail.product;
          const newStock = product.stock - detail.quantity;
          await prisma.product.update({
            where: { id: detail.productId },
            data: { stock: newStock },
          });
          await prisma.inventoryMovement.create({
            data: {
              productId: detail.productId,
              userId: userId,
              type: 'ADJUSTMENT',
              quantity: -detail.quantity,
              referenceId: purchase.id,
              note: `Anulación de compra #${purchase.id}`,
              stockBefore: product.stock,
              stockAfter: newStock,
            },
          });
        }
      }

      const cancelled = await prisma.purchase.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          provider: true,
          user: true,
          details: { include: { product: true } },
        },
      });

      return this.toResponse(cancelled);
    });
  }

  // ====== FIND ALL ======
  async findAll(filters?: { status?: PurchaseStatus; providerId?: string; dateFrom?: Date; dateTo?: Date }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.providerId) where.providerId = filters.providerId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = filters.dateFrom;
      if (filters.dateTo) where.date.lte = filters.dateTo;
    }

    const purchases = await this.prisma.purchase.findMany({
      where,
      include: {
        provider: true,
        user: true,
        details: { include: { product: { include: { category: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    return purchases.map(p => this.toResponse(p));
  }

  // ====== FIND ONE ======
  async findOne(id: string): Promise<PurchaseResponseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        provider: true,
        user: true,
        details: { include: { product: { include: { category: true } } } },
      },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return this.toResponse(purchase);
  }
}