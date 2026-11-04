import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from './sales.service';

/**
 * Mobile-only, opt-in delivery workflow. No truck stock is tracked.
 * The sale itself remains PENDING until every final ordered unit was delivered.
 * All writes serialize using the same per-sale advisory lock as SalesService.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  private async lock(tx: any, saleId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${saleId})::bigint) IS NULL AS locked`;
  }

  private async pendingSale(tx: any, saleId: string) {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { details: true, bonusDetails: true, client: true },
    });
    if (!sale) throw new NotFoundException('Preventa no encontrada');
    if (sale.status !== 'PENDING') throw new BadRequestException('La preventa ya no esta pendiente');
    return sale;
  }

  private totals(events: Array<{ productId: string; kind: string; quantity: number }>) {
    const delivered = new Map<string, number>();
    for (const e of events) {
      delivered.set(e.productId, (delivered.get(e.productId) ?? 0) + (e.kind === 'DELIVER' ? e.quantity : -e.quantity));
    }
    return delivered;
  }

  async summary(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        details: { include: { product: { select: { name: true } } } },
        deliveryEvents: { orderBy: { createdAt: 'asc' }, select: {
          id: true, productId: true, userId: true, kind: true, quantity: true, createdAt: true,
        } },
      },
    });
    if (!sale) throw new NotFoundException('Preventa no encontrada');
    const totals = this.totals(sale.deliveryEvents);
    const products = sale.details.map((d) => ({
      saleDetailId: d.id,
      productId: d.productId,
      name: d.product.name,
      ordered: d.quantity,
      delivered: totals.get(d.productId) ?? 0,
      pending: d.quantity - (totals.get(d.productId) ?? 0),
    }));
    return {
      saleId: sale.id, saleNumber: sale.saleNumber, saleStatus: sale.status,
      deliveryMode: sale.deliveryMode, revision: sale.deliveryRevision,
      complete: sale.deliveryMode && products.length > 0 && products.every(p => p.pending === 0),
      products, events: sale.deliveryEvents,
    };
  }

  async start(saleId: string) {
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, saleId);
      const sale = await this.pendingSale(tx, saleId);
      if (!sale.deliveryMode) {
        await tx.sale.update({ where: { id: saleId }, data: {
          deliveryMode: true, deliveryRevision: { increment: 1 },
        } });
      }
    });
    return this.summary(saleId);
  }

  async record(
    saleId: string,
    productId: string,
    kind: 'DELIVER' | 'RETURN',
    quantity: number,
    expectedRevision: number,
    operationKey: string,
    userId: number,
  ) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      throw new BadRequestException('La cantidad debe ser un entero positivo');
    if (!operationKey || operationKey.length > 128)
      throw new BadRequestException('Se requiere Idempotency-Key');
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, saleId);
      const previous = await tx.saleDeliveryEvent.findUnique({ where: { operationKey } });
      if (previous) {
        if (previous.saleId !== saleId || previous.productId !== productId ||
            previous.kind !== kind || previous.quantity !== quantity || previous.userId !== userId)
          throw new ConflictException('Clave de operacion ya utilizada con otros datos');
        return; // Retrying the same recorded delivery is safe.
      }
      const sale = await this.pendingSale(tx, saleId);
      if (!sale.deliveryMode) throw new BadRequestException('Active primero el control de reparto');
      if (sale.deliveryRevision !== expectedRevision)
        throw new ConflictException('El pedido cambio. Actualice antes de registrar la entrega');
      const detail = sale.details.find(d => d.productId === productId);
      if (!detail) throw new BadRequestException('El producto no pertenece al pedido');
      const events = await tx.saleDeliveryEvent.findMany({ where: { saleId, productId } });
      const delivered = this.totals(events).get(productId) ?? 0;
      const next = delivered + (kind === 'DELIVER' ? quantity : -quantity);
      if (next < 0 || next > detail.quantity)
        throw new BadRequestException('Entrega o devolucion supera la cantidad permitida');
      await tx.saleDeliveryEvent.create({ data: { operationKey, saleId, productId, userId, kind, quantity } });
      await tx.sale.update({ where: { id: saleId }, data: { deliveryRevision: { increment: 1 } } });
    });
    return this.summary(saleId);
  }

  /**
   * Adjust one product without recreating SaleDetail IDs. The reservation is
   * changed atomically and becomes available to other sales immediately.
   * Bonus-bearing sales are temporarily blocked from quantity changes because
   * changing bonus entitlements requires a separate allocation recalculation.
   */
  async adjustQuantity(
    saleId: string, productId: string, quantity: number, expectedRevision: number,
  ) {
    if (!Number.isSafeInteger(quantity) || quantity < 0)
      throw new BadRequestException('Cantidad invalida');
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, saleId);
      const sale = await this.pendingSale(tx, saleId);
      if (!sale.deliveryMode) throw new BadRequestException('El pedido no tiene reparto activo');
      if (sale.deliveryRevision !== expectedRevision)
        throw new ConflictException('El pedido cambio. Vuelva a cargar la informacion');
      if (sale.bonusDetails.length)
        throw new BadRequestException('Este pedido tiene bonificaciones: regularice su asignacion antes de cambiar cantidades');
      const existing = sale.details.find(d => d.productId === productId);
      if (!existing && quantity === 0) throw new BadRequestException('Producto no incluido');
      if (sale.details.length === 1 && existing && quantity === 0)
        throw new BadRequestException('El pedido debe conservar al menos un producto');
      const currentDelivered = this.totals(await tx.saleDeliveryEvent.findMany({ where: { saleId, productId } })).get(productId) ?? 0;
      if (quantity < currentDelivered)
        throw new BadRequestException('No puede reducir por debajo de lo entregado; registre primero la devolucion');

      const delta = quantity - (existing?.quantity ?? 0);
      const warehouse = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
      if (!warehouse) throw new BadRequestException('Almacen Central no disponible');
      const product = await tx.product.findFirst({
        where: { id: productId, isActive: true, provider: { isActive: true } },
      });
      if (!product) throw new BadRequestException('Producto inactivo o inexistente');

      if (delta !== 0) {
        const affected = delta > 0
          ? await tx.$executeRaw`
              UPDATE "warehouse_stocks" SET "reservedStock" = "reservedStock" + ${delta},
              "updatedAt" = NOW()
              WHERE "warehouseId" = ${warehouse.id} AND "productId" = ${productId}
                AND "stock" - "reservedStock" >= ${delta}
            `
          : await tx.$executeRaw`
              UPDATE "warehouse_stocks" SET "reservedStock" = "reservedStock" + ${delta},
              "updatedAt" = NOW()
              WHERE "warehouseId" = ${warehouse.id} AND "productId" = ${productId}
                AND "reservedStock" >= ${-delta}
            `;
        if (affected !== 1)
          throw new BadRequestException('Stock libre o reserva insuficiente');
        await tx.product.update({ where: { id: productId }, data: {
          reservedStock: { increment: delta },
        } });
      }

      // Preserve an already agreed unit price for existing products.
      // New products get the current automatic client/wholesale price.
      const price = existing?.unitPrice ?? (
        sale.client.type === 'CAMINO' ? product.priceCamino :
        sale.client.type === 'ESPECIAL' ? product.priceEspecial :
        product.priceMayorista != null && product.minQuantityWholesale != null &&
          quantity >= product.minQuantityWholesale ? product.priceMayorista : product.priceNormal
      );
      if (existing) {
        if (quantity === 0) {
          await tx.saleDetail.delete({ where: { id: existing.id } });
        } else {
          await tx.saleDetail.update({ where: { id: existing.id }, data: {
            quantity, subtotal: Math.round(quantity * price * 100) / 100,
          } });
        }
      } else {
        await tx.saleDetail.create({ data: {
          saleId, productId, quantity, unitPrice: price,
          subtotal: Math.round(quantity * price * 100) / 100,
        } });
      }

      const lines = await tx.saleDetail.findMany({ where: { saleId } });
      const subtotal = Math.round(lines.reduce((sum, d) => sum + d.subtotal, 0) * 100) / 100;
      const total = Math.round((subtotal - sale.discount) * 100) / 100;
      if (total < 0) throw new BadRequestException('Descuento mayor al subtotal');
      const payments = await tx.payment.aggregate({ where: { saleId }, _sum: { amount: true } });
      const paid = Math.round(((payments._sum.amount ?? 0) as number) * 100) / 100;
      if (paid > total) throw new BadRequestException('El nuevo total es inferior a los pagos existentes; regularice el cobro');
      const paymentStatus = paid === 0 ? 'PENDING' : paid >= total ? 'PAID' : 'PARTIALLY_PAID';
      await tx.sale.update({ where: { id: saleId }, data: {
        subtotal, total, paymentStatus, deliveryRevision: { increment: 1 },
      } });
    });
    return this.summary(saleId);
  }

  async confirm(saleId: string, userId: number) {
    // SalesService.confirm independently validates completion under the sale
    // advisory lock, avoiding a read/confirm race with either truck.
    const state = await this.summary(saleId);
    if (!state.deliveryMode) throw new BadRequestException('No es un pedido con control de reparto');
    return this.salesService.confirm(saleId, userId);
  }
}
