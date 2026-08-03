import { ConfigService } from '@nestjs/config';
import { SecurityEmailService } from './security-email.service';

describe('SecurityEmailService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('usa RESEND_FROM_EMAIL como remitente del dominio verificado', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test';
        if (key === 'RESEND_FROM_EMAIL') {
          return 'seguridad@yungasdistribuidora.cc';
        }
        return undefined;
      }),
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const service = new SecurityEmailService(
      config as unknown as ConfigService,
    );

    await service.sendPasswordChangedEmail({
      to: 'usuario@example.com',
      name: 'Usuario',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        body: expect.any(String),
      }),
    );
    const options = (global.fetch as jest.Mock).mock.calls[0][1] as {
      body: string;
    };
    expect(JSON.parse(options.body)).toMatchObject({
      from: 'Yungas Distribuidora <seguridad@yungasdistribuidora.cc>',
      to: ['usuario@example.com'],
    });
  });

  it('no intenta enviar si falta RESEND_API_KEY', async () => {
    const config = { get: jest.fn(() => undefined) };
    global.fetch = jest.fn();
    const service = new SecurityEmailService(
      config as unknown as ConfigService,
    );

    const result = await service.sendPasswordChangedEmail({
      to: 'usuario@example.com',
      name: 'Usuario',
    });

    expect(result).toEqual({
      sent: false,
      error: 'RESEND_API_KEY no está configurado',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
