import { Test, TestingModule } from '@nestjs/testing';
import { $Enums } from '../../generated/prisma/client';
import { PERMISSIONS } from '../auth/authorization/permissions';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ClientSpreadsheetService } from '../spreadsheets/client-spreadsheet.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

describe('ClientsController', () => {
  let controller: ClientsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [
        { provide: ClientsService, useValue: {} },
        { provide: ClientSpreadsheetService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ClientsController>(ClientsController);
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
      PERMISSIONS.CLIENTS_UPDATE,
    ]);
  });
});
