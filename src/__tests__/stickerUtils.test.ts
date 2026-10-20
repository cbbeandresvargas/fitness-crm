import { describe, it, expect } from 'vitest';
import {
  isAnimatedWebp,
  formatBytesToKb,
  MAX_STATIC_STICKER_BYTES,
  MAX_ANIMATED_STICKER_BYTES,
} from '../client/utils/stickerUtils';

function createMockBlob(bytes: number[]): Blob {
  const u8 = new Uint8Array(bytes);
  return new Blob([u8], { type: 'image/webp' });
}

describe('stickerUtils', () => {
  it('formatea correctamente los bytes a KB', () => {
    expect(formatBytesToKb(0)).toBe('0 KB');
    expect(formatBytesToKb(1024)).toBe('1.0 KB');
    expect(formatBytesToKb(102400)).toBe('100.0 KB');
    expect(formatBytesToKb(512000)).toBe('500.0 KB');
  });

  it('verifica los límites oficiales de WhatsApp para stickers', () => {
    expect(MAX_STATIC_STICKER_BYTES).toBe(102400); // 100 KB
    expect(MAX_ANIMATED_STICKER_BYTES).toBe(512000); // 500 KB
  });

  it('detecta correctamente un archivo WebP no animado (sin chunk ANIM/ANMF)', async () => {
    // Cabecera RIFF .... WEBP VP8 ...
    const staticBytes = [
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
      0x00, 0x00, 0x00, 0x00,
    ];
    const blob = createMockBlob(staticBytes);
    const isAnim = await isAnimatedWebp(blob);
    expect(isAnim).toBe(false);
  });

  it('detecta correctamente un archivo WebP con chunk ANIM', async () => {
    // Cabecera que incluye la secuencia 'ANIM' (0x41, 0x4E, 0x49, 0x4D)
    const animBytes = [
      0x52, 0x49, 0x46, 0x46, 0x30, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x41, 0x4E, 0x49, 0x4D, // ANIM
      0x06, 0x00, 0x00, 0x00,
    ];
    const blob = createMockBlob(animBytes);
    const isAnim = await isAnimatedWebp(blob);
    expect(isAnim).toBe(true);
  });

  it('detecta correctamente un archivo WebP con chunk ANMF', async () => {
    const anmfBytes = [
      0x52, 0x49, 0x46, 0x46, 0x30, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      0x41, 0x4E, 0x4D, 0x46, // ANMF
    ];
    const blob = createMockBlob(anmfBytes);
    const isAnim = await isAnimatedWebp(blob);
    expect(isAnim).toBe(true);
  });

  it('maneja casos borde en formatBytesToKb (cero, nulos, NaN, negativos y fracciones)', () => {
    expect(formatBytesToKb(0)).toBe('0 KB');
    expect(formatBytesToKb(-10)).toBe('0 KB');
    expect(formatBytesToKb(NaN)).toBe('0 KB');
    expect(formatBytesToKb(null as any)).toBe('0 KB');
    expect(formatBytesToKb(undefined as any)).toBe('0 KB');
    expect(formatBytesToKb(1536)).toBe('1.5 KB');
    expect(formatBytesToKb(2560)).toBe('2.5 KB');
  });

  it('devuelve false para blob vacío o truncado menor a 4 bytes', async () => {
    expect(await isAnimatedWebp(createMockBlob([]))).toBe(false);
    expect(await isAnimatedWebp(createMockBlob([0x52, 0x49]))).toBe(false);
  });

  it('no confunde secuencias que inician con AN pero no son ANIM o ANMF', async () => {
    // Secuencia con 'ANXX' en vez de ANIM o ANMF
    const fakeChunk = [
      0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x41, 0x4E, 0x58, 0x58, // 'ANXX'
    ];
    const blob = createMockBlob(fakeChunk);
    expect(await isAnimatedWebp(blob)).toBe(false);
  });

  it('maneja excepciones de lectura de forma segura sin propagar error', async () => {
    const corruptBlob: any = {
      slice: () => ({
        arrayBuffer: () => Promise.reject(new Error('Lectura de archivo abortada')),
      }),
    };
    expect(await isAnimatedWebp(corruptBlob)).toBe(false);
  });
});
