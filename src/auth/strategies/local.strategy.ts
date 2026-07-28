import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

/**
 * Se conserva para compatibilidad con módulos antiguos. El controlador nuevo
 * usa DTO directamente porque el login puede responder con un desafío 2FA.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  validate(email: string, password: string) {
    return this.authService.login({ email, password });
  }
}
