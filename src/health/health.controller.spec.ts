import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reporta disponibilidad cuando la base responde', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) };
    const controller = new HealthController(prisma as never);
    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      database: 'up',
    });
  });

  it('no declara readiness cuando falla la base', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const controller = new HealthController(prisma as never);
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
