import { BadRequestException } from '@nestjs/common';

export function normalizeDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeSearchText(value: string): string {
  return normalizeDisplayText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeOptionalText(
  value?: string | null,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeDisplayText(value);
  return normalized || null;
}

export function normalizeOptionalEmail(
  value?: string | null,
): string | null {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function normalizeOptionalPhone(
  value?: string | null,
): string | null {
  if (value === undefined || value === null || !value.trim()) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 8 ? `591${digits}` : digits;

  if (normalized.length < 8 || normalized.length > 15) {
    throw new BadRequestException(
      'El teléfono debe tener entre 8 y 15 dígitos',
    );
  }

  return normalized;
}

export function requireChangeReason(
  value: string | undefined,
  action: string,
): string {
  const reason = normalizeOptionalText(value);
  if (!reason || reason.length < 10) {
    throw new BadRequestException(
      `Debes indicar un motivo de al menos 10 caracteres para ${action}`,
    );
  }
  if (reason.length > 500) {
    throw new BadRequestException(
      'El motivo no puede superar 500 caracteres',
    );
  }
  return reason;
}
