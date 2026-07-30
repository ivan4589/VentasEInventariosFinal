import { Module } from '@nestjs/common';
import { SecurityAwareUsersService } from './security-aware-users.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    {
      provide: UsersService,
      useClass: SecurityAwareUsersService,
    },
  ],
})
export class UsersModule {}
