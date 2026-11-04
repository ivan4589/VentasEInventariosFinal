import { ServiceUnavailableException } from '@nestjs/common';
import { RealtimeAccessController } from './realtime-access.controller';

describe('RealtimeAccessController', () => {
  const user = { id: 22, role: 'VENDEDOR', securityVersion: 4, sessionId: 'sid-1' };
  const jwt: any = { sign: jest.fn().mockReturnValue('short-lived-token') };

  it('issues only a short-lived authenticated Realtime token for a validated user', () => {
    const controller = new RealtimeAccessController(
      { get: jest.fn().mockReturnValue('a'.repeat(40)) } as any, jwt,
    );
    expect(controller.access({ user })).toEqual({
      accessToken: 'short-lived-token', expiresInSeconds: 300,
      channels: ['yungas:delivery', 'yungas:inventory'], private: true,
    });
    expect(jwt.sign).toHaveBeenCalledWith({
      sub: '22', role: 'authenticated', yungas_user_id: '22',
      yungas_security_version: '4', yungas_session_id: 'sid-1',
    }, {
      secret: 'a'.repeat(40), algorithm: 'HS256', audience: 'authenticated',
      expiresIn: '5m',
    });
  });

  it('fails closed without server-side Supabase Realtime signing secret', () => {
    const controller = new RealtimeAccessController(
      { get: jest.fn().mockReturnValue(undefined) } as any, jwt,
    );
    expect(() => controller.access({ user })).toThrow(ServiceUnavailableException);
  });
});
