import ExcelJS from 'exceljs';
import {
  ClientSpreadsheetService,
  CLIENT_SPREADSHEET_HEADERS,
} from './client-spreadsheet.service';
import { DataAuditService } from '../data-protection/data-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpreadsheetFileService } from './spreadsheet-file.service';

async function clientWorkbook(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Clientes');
  sheet.addRow([...CLIENT_SPREADSHEET_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('ClientSpreadsheetService', () => {
  const existingClient = {
    id: 'client-1',
    fullName: 'Ana',
    alias: null,
    type: 'NORMAL',
    locationId: 'location-1',
    phone: '70000000',
    phoneNormalized: '59170000000',
    whatsappConsent: false,
    additionalInfo: null,
    isActive: true,
  };
  type ClientRecord = typeof existingClient & Record<string, unknown>;
  type MutationArgs = { data: Record<string, unknown> };
  type TransactionOperation = (tx: PrismaMock) => Promise<unknown>;
  type PrismaMock = {
    location: {
      findMany: jest.Mock<Promise<unknown[]>, unknown[]>;
    };
    client: {
      findMany: jest.Mock<Promise<ClientRecord[]>, unknown[]>;
      findUnique: jest.Mock<Promise<ClientRecord | null>, unknown[]>;
      create: jest.Mock<Promise<ClientRecord>, [MutationArgs]>;
      update: jest.Mock<Promise<ClientRecord>, [MutationArgs]>;
    };
    $transaction: jest.Mock<Promise<unknown>, [TransactionOperation]>;
  };
  type AuditMock = {
    record: jest.Mock<Promise<void>, unknown[]>;
  };
  let prisma: PrismaMock;
  let audit: AuditMock;
  let service: ClientSpreadsheetService;

  beforeEach(() => {
    prisma = {
      location: {
        findMany: jest
          .fn<Promise<unknown[]>, unknown[]>()
          .mockResolvedValue([{ id: 'location-1', name: 'Caranavi' }]),
      },
      client: {
        findMany: jest
          .fn<Promise<ClientRecord[]>, unknown[]>()
          .mockResolvedValue([existingClient]),
        findUnique: jest
          .fn<Promise<ClientRecord | null>, unknown[]>()
          .mockResolvedValue(existingClient),
        create: jest
          .fn<Promise<ClientRecord>, [MutationArgs]>()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              ...existingClient,
              id: 'client-created',
              ...data,
            }),
          ),
        update: jest
          .fn<Promise<ClientRecord>, [MutationArgs]>()
          .mockImplementation(({ data }) =>
            Promise.resolve({
              ...existingClient,
              ...data,
            }),
          ),
      },
      $transaction: jest.fn<Promise<unknown>, [TransactionOperation]>(),
    };
    prisma.$transaction.mockImplementation((operation) => operation(prisma));
    audit = {
      record: jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined),
    };
    service = new ClientSpreadsheetService(
      prisma as unknown as PrismaService,
      audit as unknown as DataAuditService,
      new SpreadsheetFileService(),
    );
  });

  it('genera una plantilla con datos, catálogos e instrucciones', async () => {
    const buffer = await service.template();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.getWorksheet('Clientes')).toBeDefined();
    expect(workbook.getWorksheet('Catalogos')).toBeDefined();
    expect(workbook.getWorksheet('Instrucciones')).toBeDefined();
    expect(workbook.getWorksheet('Clientes')?.getCell('A1').value).toBe(
      'ID_SISTEMA',
    );
  });

  it('detecta clientes nuevos y actualizaciones por teléfono', async () => {
    const buffer = await clientWorkbook([
      ['', 'Ana Actualizada', '', '', '', '70000000', '', '', ''],
      [
        '',
        'Luis',
        'Tienda Luis',
        'CAMINO',
        'Caranavi',
        '71111111',
        'SI',
        '',
        '',
      ],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(true);
    expect(preview.summary).toEqual(
      expect.objectContaining({ created: 1, updated: 1, errors: 0 }),
    );
  });

  it('no acepta una localidad inexistente', async () => {
    const buffer = await clientWorkbook([
      [
        '',
        'Luis',
        '',
        'NORMAL',
        'Localidad inventada',
        '71111111',
        'NO',
        '',
        '',
      ],
    ]);

    const preview = await service.preview(buffer);

    expect(preview.valid).toBe(false);
    expect(preview.summary.errors).toBe(1);
    expect(preview.rows[0].errors).toContain(
      'LOCALIDAD no existe en el sistema',
    );
  });

  it('crea y actualiza en la confirmación de una importación válida', async () => {
    const buffer = await clientWorkbook([
      ['', 'Ana Actualizada', '', '', '', '70000000', '', '', ''],
      ['', 'Luis', '', 'NORMAL', 'Caranavi', '71111111', 'NO', '', ''],
    ]);

    const result = await service.import(buffer, 1);

    expect(result.summary.created).toBe(1);
    expect(result.summary.updated).toBe(1);
    expect(prisma.client.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
});
