import { Module } from '@nestjs/common';
import { SpreadsheetFileService } from './spreadsheet-file.service';
import { ClientSpreadsheetService } from './client-spreadsheet.service';
import { ProductSpreadsheetService } from './product-spreadsheet.service';

@Module({
  providers: [
    SpreadsheetFileService,
    ClientSpreadsheetService,
    ProductSpreadsheetService,
  ],
  exports: [ClientSpreadsheetService, ProductSpreadsheetService],
})
export class SpreadsheetsModule {}
