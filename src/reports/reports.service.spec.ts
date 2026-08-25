import { Test, TestingModule } from '@nestjs/testing';
import { renderPdf } from '../common/pdf/render-pdf';
import { ObjectStorageService } from '../storage/object-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportHistoryService } from './report-history.service';
import { ReportsService } from './reports.service';

jest.mock('../common/pdf/render-pdf', () => ({
  renderPdf: jest.fn(),
}));

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    sale: {
      findUnique: jest.Mock;
    };
  };
  let storage: {
    savePrivatePdf: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      sale: {
        findUnique: jest.fn(),
      },
    };
    storage = {
      savePrivatePdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportHistoryService, useValue: {} },
        { provide: ObjectStorageService, useValue: storage },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    (renderPdf as jest.Mock).mockResolvedValue(Buffer.from('pdf'));
    storage.savePrivatePdf.mockResolvedValue('sales/venta-20260825-008.pdf');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('genera una nota corporativa sin mostrar el usuario que atendió', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      id: 'sale-1',
      saleNumber: '20260825-008',
      date: new Date('2026-08-25T06:10:03-04:00'),
      subtotal: 7275,
      discount: 0,
      total: 7275,
      observations: 'Entregar por la mañana',
      client: {
        fullName: 'Franklin Cutili',
        location: {
          name: 'Caranavi',
        },
      },
      details: [
        {
          quantity: 10,
          unitPrice: 110,
          subtotal: 1100,
          product: {
            name: 'Wafles Suprema 100 g',
          },
        },
      ],
    });

    await service.generateSalePDF('sale-1');

    expect(renderPdf).toHaveBeenCalledTimes(1);
    const html = (renderPdf as jest.Mock).mock.calls[0][0] as string;

    expect(html).toContain('alt="Yungas Distribuidora"');
    expect(html).toContain('data:image/jpeg;base64,');
    expect(html).toContain('Franklin Cutili');
    expect(html).toContain('20260825-008');
    expect(html).not.toContain('Atendido por');
    expect(html).not.toContain('Eriverto Condori Antonio');
    expect(storage.savePrivatePdf).toHaveBeenCalledWith(
      'sales',
      'venta-20260825-008.pdf',
      expect.any(Buffer),
    );
  });
});
