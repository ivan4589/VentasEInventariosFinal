import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ProductSpreadsheetService } from '../spreadsheets/product-spreadsheet.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ObjectStorageService } from '../storage/object-storage.service';

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: {} },
        { provide: ObjectStorageService, useValue: {} },
        { provide: ProductSpreadsheetService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([
    'spreadsheetTemplate',
    'spreadsheetExport',
    'spreadsheetPreview',
    'spreadsheetImport',
  ] as const)('protege %s para administradores', (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller[method])).toEqual([
      $Enums.Role.ADMIN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller[method])).toEqual([
      PERMISSIONS.PRODUCTS_MANAGE,
    ]);
  });
});
