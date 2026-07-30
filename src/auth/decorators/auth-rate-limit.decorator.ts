import { SetMetadata } from '@nestjs/common';

export const AUTH_RATE_LIMIT_KEY = 'auth_rate_limit';

export type AuthRateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
  includeEmail?: boolean;
  bodyFields?: string[];
};

export const AuthRateLimit = (options: AuthRateLimitOptions) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, options);
