import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  it('delega el resumen al servicio', async () => {
    const dashboardService = {
      getKPI: jest.fn().mockResolvedValue({ salesToday: 100 }),
    };
    const controller = new DashboardController(
      dashboardService as unknown as DashboardService,
    );

    await expect(controller.getKPI({}, { user: { id: 1, role: 'ADMIN' } })).resolves.toEqual({
      salesToday: 100,
    });
    expect(dashboardService.getKPI).toHaveBeenCalledWith({});
  });
});
