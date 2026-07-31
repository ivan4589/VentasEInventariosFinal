import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminStepUpService } from './admin-step-up.service';
import { DataScopeService } from './authorization/data-scope.service';
import { AuthController } from './auth.controller';
import { AuthSecurityCompletionService } from './auth-security-completion.service';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { SecurityEmailService } from './security-email.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET no está definido en el archivo .env');
        }
        return {
          secret: jwtSecret,
          signOptions: { expiresIn: '15m' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    SecurityEmailService,
    AuthSecurityCompletionService,
    AuthRateLimitGuard,
    DataScopeService,
    AdminStepUpService,
    {
      provide: AuthService,
      useClass: EmailAuthService,
    },
    JwtStrategy,
  ],
  exports: [
    AuthService,
    AuthSecurityCompletionService,
    DataScopeService,
    AdminStepUpService,
  ],
})
export class AuthModule {}
