import {
  createOpaqueToken,
  createRecoveryCodes,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  hashToken,
} from './security-crypto';

describe('security-crypto', () => {
  it('genera tokens opacos diferentes y suficientemente largos', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it('genera hashes deterministas sin conservar el valor original', () => {
    const value = 'token-super-secreto';
    expect(hashToken(value)).toBe(hashToken(value));
    expect(hashToken(value)).not.toContain(value);
  });

  it('cifra y descifra secretos TOTP con AES-GCM', () => {
    const secret = createTotpSecret();
    const encrypted = encryptSecret(secret, 'clave-de-prueba-larga-y-distinta');
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, 'clave-de-prueba-larga-y-distinta')).toBe(
      secret,
    );
  });

  it('genera ocho códigos de recuperación únicos', () => {
    const codes = createRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((code) => {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    });
  });
});
