import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export const STOCK_EPSILON = 0.000001;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function requireOperationKey(value?: string): string {
  const key = value?.trim();
  if (!key) {
    throw new BadRequestException(
      'La operación requiere la cabecera Idempotency-Key',
    );
  }
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new BadRequestException(
      'La cabecera Idempotency-Key no tiene un formato válido',
    );
  }
  return key;
}

export function requireReason(value?: string, action = 'la operación'): string {
  const reason = value?.trim();
  if (!reason || reason.length < 10) {
    throw new BadRequestException(
      `Debes indicar un motivo de al menos 10 caracteres para ${action}`,
    );
  }
  if (reason.length > 500) {
    throw new BadRequestException('El motivo no puede superar 500 caracteres');
  }
  return reason;
}

export async function lockEconomicResources(
  tx: any,
  resources: string[],
): Promise<void> {
  const ordered = [...new Set(resources.filter(Boolean))].sort();
  for (const resource of ordered) {
    if (typeof tx.$queryRawUnsafe !== 'function') continue;
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      resource,
    );
  }
}

export async function recordEconomicAudit(
  tx: any,
  input: {
    userId: number;
    action: string;
    entityType: string;
    entityId: string;
    operationKey?: string | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await tx.economicAuditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        operationKey: input.operationKey || null,
        reason: input.reason || null,
        details: input.details || undefined,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002' && input.operationKey) {
      throw new ConflictException(
        'La operación ya fue procesada con la misma clave de idempotencia',
      );
    }
    throw error;
  }
}
