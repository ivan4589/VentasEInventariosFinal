import { $Enums } from '../../../generated/prisma/client';
import {
  PERMISSIONS,
  permissionsForRole,
  roleHasPermissions,
} from './permissions';

describe('Matriz fija de roles y permisos', () => {
  it('otorga todos los permisos al administrador', () => {
    expect(
      roleHasPermissions($Enums.Role.ADMIN, Object.values(PERMISSIONS)),
    ).toBe(true);
  });

  it('permite al vendedor consultar todas las ventas y reportes de ventas', () => {
    expect(
      roleHasPermissions($Enums.Role.VENDEDOR, [
        PERMISSIONS.SALES_VIEW_ALL,
        PERMISSIONS.SALES_DOWNLOAD_ALL,
        PERMISSIONS.REPORTS_SALES_ALL,
      ]),
    ).toBe(true);
  });

  it('impide al vendedor administrar compras, pagos y usuarios', () => {
    const permissions = permissionsForRole($Enums.Role.VENDEDOR);

    expect(permissions).not.toContain(PERMISSIONS.PURCHASES_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.PAYMENTS_CREATE_ASSIGNED);
    expect(permissions).not.toContain(PERMISSIONS.USERS_MANAGE);
  });

  it('limita al cobrador a ventas, pagos y reportes asignados', () => {
    expect(
      roleHasPermissions($Enums.Role.COBRADOR, [
        PERMISSIONS.SALES_VIEW_ASSIGNED,
        PERMISSIONS.COLLECTIONS_VIEW_ASSIGNED,
        PERMISSIONS.PAYMENTS_CREATE_ASSIGNED,
        PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
      ]),
    ).toBe(true);

    const permissions = permissionsForRole($Enums.Role.COBRADOR);
    expect(permissions).not.toContain(PERMISSIONS.DASHBOARD_VIEW);
    expect(permissions).not.toContain(PERMISSIONS.CLIENTS_VIEW);
    expect(permissions).not.toContain(PERMISSIONS.PRODUCTS_VIEW);
    expect(permissions).not.toContain(PERMISSIONS.INVENTORY_VIEW);
    expect(permissions).not.toContain(PERMISSIONS.SALES_VIEW_ALL);
    expect(permissions).not.toContain(PERMISSIONS.SALES_DOWNLOAD_ALL);
    expect(permissions).not.toContain(PERMISSIONS.PAYMENTS_UPDATE);
    expect(permissions).not.toContain(PERMISSIONS.PAYMENTS_CANCEL);
  });
});
