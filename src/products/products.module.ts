import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SpreadsheetsModule } from '../spreadsheets/spreadsheets.module';

@Module({
  imports: [SpreadsheetsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
