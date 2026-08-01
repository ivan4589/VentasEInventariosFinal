import { BadRequestException } from '@nestjs/common';
import {
  requireOperationKey,
  requireReason,
  roundMoney,
  roundQuantity,
} from './economic-integrity';

describe('economic integrity helpers', () => {
  it('normaliza dinero y cantidades', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundQuantity(1.23456789)).toBe(1.234568);
  });

  it('exige una clave de idempotencia válida', () => {
    expect(requireOperationKey('sale:abc-123')).toBe('sale:abc-123');
    expect(() => requireOperationKey('x')).toThrow(BadRequestException);
    expect(() => requireOperationKey(undefined)).toThrow(BadRequestException);
  });

  it('exige motivo suficiente para reversar operaciones', () => {
    expect(requireReason('Error de registro confirmado')).toBe(
      'Error de registro confirmado',
    );
    expect(() => requireReason('corto')).toThrow(BadRequestException);
  });
});
