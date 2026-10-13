import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
// Precisión exclusiva del comprobante: no cambia la configuración monetaria global.
const NoteDecimal = Prisma.Decimal.clone({ precision: 400 });

export interface SaleNoteDetail {
  productId: string;
  quantity: number;
  unitPrice: number | string | Prisma.Decimal;
  subtotal: number | string | Prisma.Decimal;
  product: { name: string; subCategory?: { id: string; name: string } | null };
}

/** DTO de presentación: nunca sustituye SaleDetail ni sirve para escribir una venta. */
export interface SaleNoteLine {
  key: string;
  name: string;
  quantity: number;
  unitPrice: Prisma.Decimal | null;
  subtotal: Prisma.Decimal;
}

export function buildSaleNoteLines(details: readonly SaleNoteDetail[]): SaleNoteLine[] {
  const groups = new Map<string, SaleNoteLine>();
  for (const detail of details) {
    if (!detail.productId || !Number.isSafeInteger(detail.quantity) || detail.quantity <= 0) {
      throw new BadRequestException('El comprobante requiere productos identificados y cantidades enteras positivas');
    }
    const category = detail.product.subCategory;
    const valid = Boolean(category?.id && category.name.trim());
    const key = valid ? `subcategory:${category!.id}` : `product:${detail.productId}`;
    const price = new NoteDecimal(detail.unitPrice);
    const subtotal = new NoteDecimal(detail.subtotal);
    if (!price.isFinite() || !subtotal.isFinite()) throw new BadRequestException('Importe inválido en el comprobante');
    const current = groups.get(key);
    if (current) {
      const quantity = current.quantity + detail.quantity;
      if (!Number.isSafeInteger(quantity)) throw new BadRequestException('Cantidad agrupada fuera de rango');
      current.quantity = quantity;
      current.subtotal = current.subtotal.plus(subtotal);
      if (current.unitPrice !== null && !current.unitPrice.equals(price)) current.unitPrice = null;
    } else {
      groups.set(key, {
        key, name: valid ? category!.name : detail.product.name,
        quantity: detail.quantity, unitPrice: price, subtotal,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'es') || a.key.localeCompare(b.key, 'es'),
  );
}
