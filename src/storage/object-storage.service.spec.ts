import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('guarda documentos privados sin exponer una URL pública', async () => {
    const config = new ConfigService({
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      SUPABASE_PRIVATE_BUCKET: 'private-documents',
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new ObjectStorageService(config);

    await expect(
      service.savePrivatePdf('sales', 'nota 1.pdf', Buffer.from('pdf')),
    ).resolves.toBe('/uploads/sales/nota_1.pdf');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/storage/v1/object/private-documents/sales/nota_1.pdf',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rechaza rutas privadas fuera de las carpetas permitidas', async () => {
    const service = new ObjectStorageService(
      new ConfigService({ STORAGE_DRIVER: 'local' }),
    );
    await expect(service.readPrivate('../../.env')).rejects.toThrow(
      'La ruta del documento no es válida',
    );
  });
});
