import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyMetaSignature,
  safeEqual,
  encryptSecret,
  decryptSecret,
  tokenLast4,
} from '../lib/crypto';

describe('verifyMetaSignature (Meta WhatsApp Webhook HMAC)', () => {
  const testSecret = 'my_meta_app_secret_super_secure_123';
  const testPayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '12345', changes: [] }],
  });

  function generateValidHeader(payload: string, secret: string): string {
    const hash = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    return `sha256=${hash}`;
  }

  describe('Comportamiento Fail-Closed (Seguridad estricta)', () => {
    it('retorna false cuando appSecret es undefined', () => {
      const header = generateValidHeader(testPayload, testSecret);
      expect(verifyMetaSignature(testPayload, header, undefined)).toBe(false);
    });

    it('retorna false cuando appSecret es una cadena vacía o sólo espacios', () => {
      const header = generateValidHeader(testPayload, testSecret);
      expect(verifyMetaSignature(testPayload, header, '')).toBe(false);
      expect(verifyMetaSignature(testPayload, header, '   ')).toBe(false);
    });

    it('retorna false cuando signatureHeader es undefined o null', () => {
      expect(verifyMetaSignature(testPayload, undefined, testSecret)).toBe(false);
      expect(verifyMetaSignature(testPayload, null, testSecret)).toBe(false);
    });

    it('retorna false cuando signatureHeader no tiene el prefijo sha256=', () => {
      const hash = createHmac('sha256', testSecret).update(testPayload, 'utf8').digest('hex');
      expect(verifyMetaSignature(testPayload, hash, testSecret)).toBe(false);
      expect(verifyMetaSignature(testPayload, `md5=${hash}`, testSecret)).toBe(false);
    });

    it('retorna false cuando la firma no coincide', () => {
      const wrongSignature = 'sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      expect(verifyMetaSignature(testPayload, wrongSignature, testSecret)).toBe(false);
    });

    it('retorna false cuando el cuerpo de la petición fue manipulado (tampering)', () => {
      const validHeader = generateValidHeader(testPayload, testSecret);
      const tamperedPayload = testPayload + ' ';
      expect(verifyMetaSignature(tamperedPayload, validHeader, testSecret)).toBe(false);
    });
  });

  describe('Validación positiva de firmas legítimas', () => {
    it('retorna true cuando la firma HMAC-SHA256 coincide exactamente con el payload y el secreto', () => {
      const validHeader = generateValidHeader(testPayload, testSecret);
      expect(verifyMetaSignature(testPayload, validHeader, testSecret)).toBe(true);
    });

    it('valida correctamente payloads con caracteres UTF-8 especiales y acentos', () => {
      const utf8Payload = JSON.stringify({ mensaje: '¡Hola Cochabamba! ¿Qué planes hay?' });
      const validHeader = generateValidHeader(utf8Payload, testSecret);
      expect(verifyMetaSignature(utf8Payload, validHeader, testSecret)).toBe(true);
    });
  });
});

describe('Utilidades criptográficas complementarias', () => {
  it('safeEqual compara cadenas en tiempo constante', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });

  it('tokenLast4 devuelve los últimos 4 caracteres para previsualización segura', () => {
    expect(tokenLast4('EAABwxyz1234')).toBe('1234');
    expect(tokenLast4('abc')).toBe('abc');
    expect(tokenLast4('')).toBe('');
  });

  it('encryptSecret y decryptSecret cifran y descifran con AES-256-GCM', () => {
    const secret = 'super_secret_wa_access_token_token';
    const encrypted = encryptSecret(secret);
    expect(encrypted.cipher).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(secret);
  });
});
