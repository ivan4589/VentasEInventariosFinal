jest.mock('./sales.service', () => ({ SalesService: class SalesService {} }));
jest.mock('./whatsapp.service', () => ({ WhatsAppService: class WhatsAppService {} }));

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { $Enums } from '../../generated/prisma/client';
import { DataScopeService } from '../auth/authorization/data-scope.service';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SalesController } from './sales.controller';

describe('SalesController - gestión compartida', () => {
  const sale = {
    id: 'sale_1', userId: 1, saleNumber: '001', total: 20,
    paidAmount: 5, balance: 15, paymentStatus: $Enums.PaymentStatus.PARTIALLY_PAID,
  };
  const vendor = { user: { id: 2, role: $Enums.Role.VENDEDOR } };
  let sales: any;
  let whatsapp: any;
  let integrity: any;
  let controller: SalesController;

  beforeEach(() => {
    sales = {
      update: jest.fn().mockResolvedValue(sale),
      confirm: jest.fn().mockResolvedValue(sale),
      findOne: jest.fn().mockResolvedValue(sale),
      createReturn: jest.fn(),
    };
    whatsapp = { sendSaleDocument: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    integrity = {
      run: jest.fn(async (options) => (await options.execute('operation:123')).value),
      reason: jest.fn().mockReturnValue('Motivo de devolución'),
    };
    const scope = new DataScopeService({
      sale: { findUnique: jest.fn().mockResolvedValue(sale) },
    } as any);
    controller = new SalesController(sales, whatsapp, scope, integrity);
  });

  it.each(['confirm', 'update'] as const)(
    '%s permite preventas ajenas y conserva la restricción de datos financieros',
    async (action) => {
      const result = action === 'confirm'
        ? await controller.confirm('sale_1', vendor, 'operation:123')
        : await controller.update('sale_1', {}, vendor, 'operation:123');
      expect(result.userId).toBe(1);
      expect(result).not.toHaveProperty('paidAmount');
      expect(result).not.toHaveProperty('balance');
      expect(result).not.toHaveProperty('paymentStatus');
      expect(integrity.run.mock.calls[0][0]).toEqual(expect.objectContaining({
        userId: 2, operationKey: 'operation:123', locks: ['sale:sale_1'],
      }));
      if (action === 'confirm') expect(sales.confirm).toHaveBeenCalledWith('sale_1', 2);
      else expect(sales.update).toHaveBeenCalledWith('sale_1', {}, $Enums.Role.VENDEDOR, 2);
    },
  );

  it('mantiene los datos financieros para ADMIN', async () => {
    const result = await controller.confirm('sale_1', {
      user: { id: 2, role: $Enums.Role.ADMIN },
    }, 'operation:123');
    expect(result).toEqual(sale);
  });

  it.each(['confirm', 'update'] as const)('COBRADOR no puede %s preventas', async (action) => {
    const collector = { user: { id: 2, role: $Enums.Role.COBRADOR } };
    await expect(action === 'confirm'
      ? controller.confirm('sale_1', collector, 'operation:123')
      : controller.update('sale_1', {}, collector, 'operation:123'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(integrity.run).not.toHaveBeenCalled();
  });

  it('mantiene las devoluciones del vendedor limitadas a ventas propias', async () => {
    await expect(controller.createReturn('sale_1', {
      details: [], observations: 'Motivo de devolución',
    }, vendor, 'operation:123')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sales.createReturn).not.toHaveBeenCalled();
  });

  it('envía WhatsApp de ventas ajenas con el actor real', async () => {
    await controller.sendWhatsApp('sale_1', { resend: false }, vendor);
    expect(whatsapp.sendSaleDocument).toHaveBeenCalledWith('sale_1', 2, false);
  });

  it('mantiene los guards de permisos y anulaciones exclusivas de ADMIN', () => {
    for (const [action, permission] of [
      ['update', PERMISSIONS.SALES_UPDATE_ALL],
      ['confirm', PERMISSIONS.SALES_CONFIRM_ALL],
      ['sendWhatsApp', PERMISSIONS.SALES_WHATSAPP_ALL],
    ] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[action])).toEqual([permission]);
      expect(Reflect.getMetadata(ROLES_KEY, controller[action]))
        .toEqual([$Enums.Role.ADMIN, $Enums.Role.VENDEDOR]);
    }
    expect(Reflect.getMetadata(ROLES_KEY, controller.cancel)).toEqual([$Enums.Role.ADMIN]);
  });

  it('propaga el rechazo de una clave de idempotencia repetida sin confirmar', async () => {
    integrity.run.mockRejectedValueOnce(new ConflictException('Ya procesada'));
    await expect(controller.confirm('sale_1', vendor, 'operation:123'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(sales.confirm).not.toHaveBeenCalled();
  });
});
