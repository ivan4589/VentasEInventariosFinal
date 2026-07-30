import {
  CanActivate,
  ExecutionContext,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTH_RATE_LIMIT_KEY,
  AuthRateLimitOptions,
} from '../decorators/auth-rate-limit.decorator';

type RateEntry = {
  count: number;
  windowEndsAt: number;
  blockedUntil: number;
};

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateEntry>();
  private cleanupCounter = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<AuthRateLimitOptions>(
      AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = this.keyFor(request, options);
    const current = this.entries.get(key);

    if (current?.blockedUntil && current.blockedUntil > now) {
      throw new TooManyRequestsException(
        'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
      );
    }

    const entry =
      !current || current.windowEndsAt <= now
        ? {
            count: 0,
            windowEndsAt: now + options.windowMs,
            blockedUntil: 0,
          }
        : current;

    entry.count += 1;

    if (entry.count > options.limit) {
      entry.blockedUntil = now + (options.blockMs ?? options.windowMs);
      this.entries.set(key, entry);
      throw new TooManyRequestsException(
        'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
      );
    }

    this.entries.set(key, entry);
    this.cleanup(now);
    return true;
  }

  private keyFor(request: Request, options: AuthRateLimitOptions) {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0]?.trim() || request.ip || 'unknown';
    const email = options.includeEmail
      ? String((request.body as { email?: string } | undefined)?.email || '')
          .trim()
          .toLowerCase()
      : '';

    return `${request.method}:${request.route?.path || request.path}:${ip}:${email}`;
  }

  private cleanup(now: number) {
    this.cleanupCounter += 1;
    if (this.cleanupCounter % 100 !== 0) return;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.windowEndsAt <= now && entry.blockedUntil <= now) {
        this.entries.delete(key);
      }
    }
  }
}
