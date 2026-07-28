import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function createOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function encodeBase32(buffer: Buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=|\s|-/g, '');
  let bits = '';

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Secreto TOTP inválido');
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function createTotpSecret() {
  return encodeBase32(randomBytes(20));
}

function totpAt(secret: string, timestamp: number) {
  const counter = Math.floor(timestamp / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string) {
  const now = Math.floor(Date.now() / 1000);
  return [-1, 0, 1].some((window) => {
    const expected = Buffer.from(totpAt(secret, now + window * 30));
    const received = Buffer.from(code);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  });
}

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string, keyMaterial: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyMaterial), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string, keyMaterial: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Secreto cifrado inválido');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyMaterial),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function createRecoveryCodes(quantity = 8) {
  return Array.from({ length: quantity }, () => {
    const value = randomBytes(6).toString('hex').toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}
