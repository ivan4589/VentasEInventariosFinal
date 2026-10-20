/**
 * Pure calculation only. Inventory movements and rule persistence are handled
 * by the sales transaction; never use this result as an authorization to ship.
 */
export interface BonusRuleInput {
  subCategoryId: string;
  minimumQuantity: number;
  bonusQuantity: number;
}

export interface SoldProductInput {
  productId: string;
  subCategoryId: string | null;
  quantity: number;
}

export interface BonusAllocationInput {
  productId: string;
  quantity: number;
}

export interface BonusProductInput {
  id: string;
  subCategoryId: string | null;
  availableStock: number;
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} debe ser un entero positivo`);
  }
}

export function calculateBonusEntitlement(
  rule: BonusRuleInput,
  items: SoldProductInput[],
): number {
  if (!rule.subCategoryId) throw new Error('La subcategoría es obligatoria');
  positiveInteger(rule.minimumQuantity, 'Cantidad mínima');
  positiveInteger(rule.bonusQuantity, 'Cantidad de bonificación');
  let sold = 0;
  for (const item of items) {
    positiveInteger(item.quantity, 'Cantidad vendida');
    if (item.subCategoryId === rule.subCategoryId) sold += item.quantity;
  }
  if (!Number.isSafeInteger(sold)) throw new Error('Cantidad vendida fuera de rango');
  const entitled = Math.floor(sold / rule.minimumQuantity) * rule.bonusQuantity;
  if (!Number.isSafeInteger(entitled)) throw new Error('Bonificación fuera de rango');
  return entitled;
}

/**
 * Validate that exactly the earned quantity is distributed among products of
 * the eligible subcategory. availableStock must be computed against current
 * Central Warehouse stock and existing reservations, INCLUDING sold items.
 * Repeat this check atomically at confirmation; frontend checks are advisory.
 */
export function validateBonusAllocation(
  rule: BonusRuleInput,
  items: SoldProductInput[],
  allocations: BonusAllocationInput[],
  eligibleProducts: BonusProductInput[],
): void {
  const entitled = calculateBonusEntitlement(rule, items);
  if (entitled === 0 && allocations.length === 0) return;
  const catalogue = new Map(eligibleProducts.map(product => [product.id, product]));
  const allocated = new Map<string, number>();
  for (const allocation of allocations) {
    positiveInteger(allocation.quantity, 'Cantidad bonificada');
    const product = catalogue.get(allocation.productId);
    if (!product || product.subCategoryId !== rule.subCategoryId) {
      throw new Error('Producto bonificado fuera de la subcategoría');
    }
    allocated.set(allocation.productId, (allocated.get(allocation.productId) || 0) + allocation.quantity);
  }
  let total = 0;
  for (const [id, quantity] of allocated) {
    if (!Number.isSafeInteger(quantity)) throw new Error('Cantidad bonificada fuera de rango');
    const product = catalogue.get(id)!;
    if (!Number.isFinite(product.availableStock) || product.availableStock < quantity) {
      throw new Error('Stock insuficiente para la bonificación');
    }
    total += quantity;
  }
  if (total !== entitled) throw new Error(`Bonificación incorrecta: corresponde ${entitled} y se asignó ${total}`);
}
