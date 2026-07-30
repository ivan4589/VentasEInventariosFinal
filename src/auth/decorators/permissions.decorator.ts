import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../authorization/permissions';

export const PERMISSIONS_KEY = 'required_permissions';
export const ANY_PERMISSIONS_KEY = 'any_required_permissions';

/** Exige que el rol tenga todos los permisos indicados. */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Exige que el rol tenga al menos uno de los permisos indicados. */
export const AnyPermissions = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
