import { $Enums } from '../../../generated/prisma/client';

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  USERS_MANAGE: 'users.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  SECURITY_SELF_MANAGE: 'security.self.manage',

  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_UPDATE: 'clients.update',
  CLIENTS_DELETE: 'clients.delete',

  PROVIDERS_VIEW: 'providers.view',
  PROVIDERS_MANAGE: 'providers.manage',
  CATALOG_VIEW: 'catalog.view',
  CATALOG_MANAGE: 'catalog.manage',
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage',
  PRODUCTS_VIEW_COSTS: 'products.costs.view',

  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_MANAGE: 'purchases.manage',

  SALES_VIEW_ALL: 'sales.view.all',
  SALES_VIEW_ASSIGNED: 'sales.view.assigned',
  SALES_CREATE: 'sales.create',
  SALES_UPDATE_OWN: 'sales.update.own',
  SALES_CONFIRM_OWN: 'sales.confirm.own',
  SALES_RETURN_OWN: 'sales.return.own',
  SALES_CANCEL: 'sales.cancel',
  SALES_DOWNLOAD_ALL: 'sales.download.all',
  SALES_WHATSAPP_OWN: 'sales.whatsapp.own',

  COLLECTIONS_VIEW_ALL: 'collections.view.all',
  COLLECTIONS_VIEW_OWN_SALES: 'collections.view.own-sales',
  COLLECTIONS_VIEW_ASSIGNED: 'collections.view.assigned',
  COLLECTIONS_ASSIGN: 'collections.assign',

  PAYMENTS_VIEW_ALL: 'payments.view.all',
  PAYMENTS_VIEW_OWN_SALES: 'payments.view.own-sales',
  PAYMENTS_VIEW_ASSIGNED: 'payments.view.assigned',
  PAYMENTS_CREATE_ASSIGNED: 'payments.create.assigned',
  PAYMENTS_UPDATE: 'payments.update',
  PAYMENTS_CANCEL: 'payments.cancel',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  INVENTORY_TRANSFER: 'inventory.transfer',

  REPORTS_SALES_ALL: 'reports.sales.all',
  REPORTS_COLLECTIONS_ALL: 'reports.collections.all',
  REPORTS_COLLECTIONS_ASSIGNED: 'reports.collections.assigned',
  REPORTS_INVENTORY: 'reports.inventory',
  REPORTS_FINANCIAL: 'reports.financial',
  REPORTS_HISTORY_ALL: 'reports.history.all',
  REPORTS_HISTORY_OWN: 'reports.history.own',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<$Enums.Role, readonly Permission[]> = {
  [$Enums.Role.ADMIN]: ALL_PERMISSIONS,
  [$Enums.Role.VENDEDOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.SECURITY_SELF_MANAGE,
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.CLIENTS_CREATE,
    PERMISSIONS.CLIENTS_UPDATE,
    PERMISSIONS.CATALOG_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SALES_VIEW_ALL,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.SALES_UPDATE_OWN,
    PERMISSIONS.SALES_CONFIRM_OWN,
    PERMISSIONS.SALES_RETURN_OWN,
    PERMISSIONS.SALES_DOWNLOAD_ALL,
    PERMISSIONS.SALES_WHATSAPP_OWN,
    PERMISSIONS.COLLECTIONS_VIEW_OWN_SALES,
    PERMISSIONS.PAYMENTS_VIEW_OWN_SALES,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.REPORTS_SALES_ALL,
    PERMISSIONS.REPORTS_INVENTORY,
    PERMISSIONS.REPORTS_HISTORY_OWN,
  ],
  [$Enums.Role.COBRADOR]: [
    PERMISSIONS.SECURITY_SELF_MANAGE,
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.CATALOG_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SALES_VIEW_ASSIGNED,
    PERMISSIONS.COLLECTIONS_VIEW_ASSIGNED,
    PERMISSIONS.PAYMENTS_VIEW_ASSIGNED,
    PERMISSIONS.PAYMENTS_CREATE_ASSIGNED,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.REPORTS_COLLECTIONS_ASSIGNED,
    PERMISSIONS.REPORTS_INVENTORY,
    PERMISSIONS.REPORTS_HISTORY_OWN,
  ],
};

export function permissionsForRole(role: $Enums.Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

export function roleHasPermissions(
  role: $Enums.Role | undefined,
  requiredPermissions: readonly Permission[],
): boolean {
  if (!role) return false;
  const granted = new Set(ROLE_PERMISSIONS[role] ?? []);
  return requiredPermissions.every((permission) => granted.has(permission));
}
