import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../authorization/permissions';

export const PERMISSIONS_KEY = 'required_permissions';

export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
