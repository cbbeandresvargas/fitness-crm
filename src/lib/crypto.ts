import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export type EncryptedValue = {
  cipher: string; // base64
  iv: string;     // base64
  tag: string;    // base64
};

const DEFAULT_SECRET_FALLBACK = 'ironpeak_fitness_crm_secret_key_32b_2026!'; // Exact 32 bytes

function getMasterKey(customKey?: string): Buffer {
  if (customKey && customKey.trim().length > 0) {
    try {
      const buf = Buffer.from(customKey, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      // fallback
    }
  }
  // Ensure exactly 32 bytes
  const fallback = Buffer.from(DEFAULT_SECRET_FALLBACK, 'utf8');
  return fallback.subarray(0, 32);
}

/**
 * Cifra un secreto (token de Meta WhatsApp) en reposo usando AES-256-GCM
 */
export function encryptSecret(plain: string, customKey?: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(customKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return {
    cipher: Buffer.from(encrypted).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    tag: Buffer.from(cipher.getAuthTag()).toString('base64'),
  };
}

/**
 * Descifra un secreto cifrado con AES-256-GCM
 */
export function decryptSecret(value: EncryptedValue, customKey?: string): string {
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getMasterKey(customKey),
      Buffer.from(value.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(value.cipher, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Error descifrando secreto:', err);
    return '';
  }
}

/**
 * Comparación segura de cadenas en tiempo constante
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Validación de firma HMAC-SHA256 enviada por Meta en el header x-hub-signature-256
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined
): boolean {
  if (!appSecret || appSecret.trim() === '') {
    // Si no se configuró appSecret, la capa de firma está desactivada
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const signature = signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  return safeEqual(signature, expected);
}

/**
 * Devuelve los últimos 4 caracteres del token para previsualización segura
 */
export function tokenLast4(token: string): string {
  if (!token) return '';
  return token.length > 4 ? token.slice(-4) : token;
}
