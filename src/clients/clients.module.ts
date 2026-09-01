import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { SpreadsheetsModule } from '../spreadsheets/spreadsheets.module';

@Module({
  imports: [SpreadsheetsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
