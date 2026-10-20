/**
 * Utilidades de stickers de WhatsApp Cloud API.
 * Requisitos de Meta: WebP 512x512, estático <= 100KB, animado <= 500KB.
 */

export const STICKER_DIMENSION = 512;
export const STICKER_STATIC_MAX_BYTES = 100 * 1024;
export const STICKER_ANIMATED_MAX_BYTES = 500 * 1024;
/** Meta conserva los media subidos ~30 días; cacheamos el media_id 25 días por seguridad. */
export const STICKER_META_MEDIA_TTL_MS = 25 * 24 * 60 * 60 * 1000;

export interface WebpInfo {
  width: number;
  height: number;
  animated: boolean;
}

export type StickerValidationResult =
  | { ok: true; info: WebpInfo }
  | { ok: false; error: string };

function fourcc(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

/**
 * Parsea el contenedor RIFF/WebP. Devuelve null si no es un WebP válido.
 * La animación se detecta por la presencia del chunk ANIM (o el flag de animación en VP8X).
 */
export function parseWebp(bytes: Uint8Array): WebpInfo | null {
  if (bytes.length < 20) return null;
  if (fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP') return null;

  let width = 0;
  let height = 0;
  let animated = false;
  let offset = 12;
  const end = Math.min(bytes.length, u32le(bytes, 4) + 8);

  while (offset + 8 <= end) {
    const id = fourcc(bytes, offset);
    const size = u32le(bytes, offset + 4);
    const data = offset + 8;
    if (data + size > bytes.length) break; // Chunk truncado

    if (id === 'VP8X' && size >= 10) {
      if (bytes[data] & 0x02) animated = true;
      width = u24le(bytes, data + 4) + 1;
      height = u24le(bytes, data + 7) + 1;
    } else if (id === 'ANIM') {
      animated = true;
    } else if (id === 'VP8 ' && size >= 10 && !width) {
      if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return null;
      width = (bytes[data + 6] | (bytes[data + 7] << 8)) & 0x3fff;
      height = (bytes[data + 8] | (bytes[data + 9] << 8)) & 0x3fff;
    } else if (id === 'VP8L' && size >= 5 && !width) {
      if (bytes[data] !== 0x2f) return null;
      const bits = u32le(bytes, data + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }

    offset = data + size + (size & 1);
  }

  if (!width || !height) return null;
  return { width, height, animated };
}

/** Valida un archivo de sticker y devuelve errores claros en español. */
export function validateStickerFile(bytes: Uint8Array, declaredMime?: string | null): StickerValidationResult {
  if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };

  if (declaredMime && declaredMime !== 'image/webp' && declaredMime !== 'application/octet-stream') {
    return { ok: false, error: `Formato no soportado (${declaredMime}). El sticker debe ser una imagen WebP.` };
  }

  const info = parseWebp(bytes);
  if (!info) {
    return { ok: false, error: 'El archivo no es un WebP válido. Convierte la imagen a WebP antes de subirla.' };
  }

  if (info.width !== STICKER_DIMENSION || info.height !== STICKER_DIMENSION) {
    return {
      ok: false,
      error: `El sticker debe medir exactamente 512x512 píxeles (recibido ${info.width}x${info.height}).`,
    };
  }

  const max = info.animated ? STICKER_ANIMATED_MAX_BYTES : STICKER_STATIC_MAX_BYTES;
  if (bytes.length > max) {
    const kb = Math.ceil(bytes.length / 1024);
    return {
      ok: false,
      error: info.animated
        ? `El sticker animado pesa ${kb}KB; el máximo permitido por WhatsApp es 500KB.`
        : `El sticker estático pesa ${kb}KB; el máximo permitido por WhatsApp es 100KB.`,
    };
  }

  return { ok: true, info };
}

/** Indica si el media_id cacheado de Meta sigue vigente. */
export function isMetaMediaValid(mediaId: string | null | undefined, expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!mediaId || !expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > now;
}

export function stickerFileUrl(id: string): string {
  return `/api/whatsapp/stickers/${id}/file`;
}
