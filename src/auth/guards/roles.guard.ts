import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { $Enums } from '../../../generated/prisma/client';
import {
  ROLE_PERMISSIONS,
  roleHasPermissions,
  type Permission,
} from '../authorization/permissions';
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<$Enums.Role[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const anyRequiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      !requiredRoles?.length &&
      !requiredPermissions?.length &&
      !anyRequiredPermissions?.length
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{
      user?: {
        role?: $Enums.Role;
        mustChangePassword?: boolean;
      };
    }>();

    if (user?.mustChangePassword) {
      throw new ForbiddenException({
        message:
          'Debes cambiar la contraseña temporal antes de usar los módulos del sistema',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }

    const roleAllowed =
      !requiredRoles?.length ||
      requiredRoles.some((role) => user?.role === role);
    const allPermissionsAllowed =
      !requiredPermissions?.length ||
      roleHasPermissions(user?.role, requiredPermissions);
    const granted = new Set(
      user?.role ? ROLE_PERMISSIONS[user.role] ?? [] : [],
    );
    const anyPermissionAllowed =
      !anyRequiredPermissions?.length ||
      anyRequiredPermissions.some((permission) => granted.has(permission));

    if (!roleAllowed || !allPermissionsAllowed || !anyPermissionAllowed) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta operación',
      );
    }

    return true;
  }
}
