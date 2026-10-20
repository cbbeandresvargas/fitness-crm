import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { whatsappRoutes } from '../routes/whatsapp';
import {
  parseWebp,
  validateStickerFile,
  isMetaMediaValid,
  stickerFileUrl,
  STICKER_STATIC_MAX_BYTES,
  STICKER_ANIMATED_MAX_BYTES,
} from '../lib/stickers';

function chunk(id: string, data: Uint8Array): Uint8Array {
  const size = data.length;
  const out = new Uint8Array(8 + size + (size & 1));
  for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, size, true);
  out.set(data, 8);
  return out;
}

function riff(chunks: Uint8Array[], padTo = 0): Uint8Array {
  let body = chunks.reduce((n, c) => n + c.length, 4);
  const extra = padTo > body + 8 ? padTo - body - 8 : 0;
  const parts = extra ? [...chunks, chunk('JUNK', new Uint8Array(Math.max(0, extra - 8)))] : chunks;
  body = parts.reduce((n, c) => n + c.length, 4);
  const out = new Uint8Array(8 + body);
  out.set([0x52, 0x49, 0x46, 0x46]);
  new DataView(out.buffer).setUint32(4, body, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  let o = 12;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function vp8x(w: number, h: number, animated: boolean): Uint8Array {
  const d = new Uint8Array(10);
  d[0] = animated ? 0x02 : 0;
  const W = w - 1, H = h - 1;
  d[4] = W & 0xff; d[5] = (W >> 8) & 0xff; d[6] = (W >> 16) & 0xff;
  d[7] = H & 0xff; d[8] = (H >> 8) & 0xff; d[9] = (H >> 16) & 0xff;
  return chunk('VP8X', d);
}

function vp8(w: number, h: number): Uint8Array {
  const d = new Uint8Array(10);
  d.set([0, 0, 0, 0x9d, 0x01, 0x2a]);
  d[6] = w & 0xff; d[7] = (w >> 8) & 0x3f;
  d[8] = h & 0xff; d[9] = (h >> 8) & 0x3f;
  return chunk('VP8 ', d);
}

function vp8l(w: number, h: number): Uint8Array {
  const d = new Uint8Array(5);
  d[0] = 0x2f;
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  new DataView(d.buffer).setUint32(1, bits >>> 0, true);
  return chunk('VP8L', d);
}

describe('Stickers: parseo de WebP', () => {
  it('detecta dimensiones de WebP lossy (VP8)', () => {
    expect(parseWebp(riff([vp8(512, 512)]))).toEqual({ width: 512, height: 512, animated: false });
  });

  it('detecta dimensiones de WebP lossless (VP8L)', () => {
    expect(parseWebp(riff([vp8l(512, 512)]))).toEqual({ width: 512, height: 512, animated: false });
  });

  it('detecta animación por chunk ANIM', () => {
    const file = riff([vp8x(512, 512, false), chunk('ANIM', new Uint8Array(6)), chunk('ANMF', new Uint8Array(16))]);
    expect(parseWebp(file)?.animated).toBe(true);
  });

  it('rechaza archivos que no son RIFF/WebP', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(20).fill(0)]);
    expect(parseWebp(png)).toBeNull();
  });
});

describe('Stickers: validación de reglas de WhatsApp', () => {
  it('acepta sticker estático 512x512 pequeño', () => {
    const res = validateStickerFile(riff([vp8(512, 512)]), 'image/webp');
    expect(res.ok).toBe(true);
  });

  it('rechaza dimensiones distintas a 512x512 con mensaje en español', () => {
    const res = validateStickerFile(riff([vp8(256, 256)]), 'image/webp');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('512x512') });
  });

  it('rechaza mime distinto de WebP', () => {
    const res = validateStickerFile(riff([vp8(512, 512)]), 'image/png');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('WebP');
  });

  it('rechaza estático > 100KB', () => {
    const res = validateStickerFile(riff([vp8(512, 512)], STICKER_STATIC_MAX_BYTES + 100), 'image/webp');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('100KB');
  });

  it('acepta animado de 200KB pero rechaza > 500KB', () => {
    const anim = [vp8x(512, 512, true), chunk('ANIM', new Uint8Array(6))];
    expect(validateStickerFile(riff(anim, 200 * 1024), 'image/webp').ok).toBe(true);
    const big = validateStickerFile(riff(anim, STICKER_ANIMATED_MAX_BYTES + 100), 'image/webp');
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toContain('500KB');
  });

  it('rechaza archivo vacío o corrupto', () => {
    expect(validateStickerFile(new Uint8Array(0)).ok).toBe(false);
    expect(validateStickerFile(new Uint8Array(64)).ok).toBe(false);
  });
});

describe('Stickers: caché de media_id de Meta', () => {
  it('valida vigencia del media_id', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(isMetaMediaValid('123', '2026-01-10T00:00:00Z', now)).toBe(true);
    expect(isMetaMediaValid('123', '2025-12-31T00:00:00Z', now)).toBe(false);
    expect(isMetaMediaValid(null, '2026-01-10T00:00:00Z', now)).toBe(false);
    expect(isMetaMediaValid('123', null, now)).toBe(false);
    expect(isMetaMediaValid('123', 'not-a-valid-date', now)).toBe(false);
    expect(isMetaMediaValid('123', '2026-01-01T00:00:00Z', now)).toBe(false); // Exacto al instante actual -> expirado
    expect(isMetaMediaValid('', '2026-01-10T00:00:00Z', now)).toBe(false);
  });

  it('construye la URL servible del sticker', () => {
    expect(stickerFileUrl('stk_abc')).toBe('/api/whatsapp/stickers/stk_abc/file');
  });
});

describe('Stickers: casos límite adicionales de tamaño y formato', () => {
  it('acepta estático exactamente en el límite de 100KB (102400 bytes)', () => {
    const res = validateStickerFile(riff([vp8(512, 512)], STICKER_STATIC_MAX_BYTES), 'image/webp');
    expect(res.ok).toBe(true);
  });

  it('rechaza estático con 100KB + 1 byte (102401 bytes)', () => {
    const res = validateStickerFile(riff([vp8(512, 512)], STICKER_STATIC_MAX_BYTES + 1), 'image/webp');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('100KB');
  });

  it('acepta animado exactamente en el límite de 500KB (512000 bytes)', () => {
    const anim = [vp8x(512, 512, true), chunk('ANIM', new Uint8Array(6))];
    const res = validateStickerFile(riff(anim, STICKER_ANIMATED_MAX_BYTES), 'image/webp');
    expect(res.ok).toBe(true);
  });

  it('rechaza animado con 500KB + 1 byte (512001 bytes)', () => {
    const anim = [vp8x(512, 512, true), chunk('ANIM', new Uint8Array(6))];
    const res = validateStickerFile(riff(anim, STICKER_ANIMATED_MAX_BYTES + 1), 'image/webp');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('500KB');
  });

  it('detecta animación en VP8X incluso sin chunk ANIM explícito', () => {
    const file = riff([vp8x(512, 512, true), vp8(512, 512)]);
    expect(parseWebp(file)?.animated).toBe(true);
  });

  it('rechaza archivos WebP con cabecera VP8 corrupta', () => {
    const badVp8 = new Uint8Array(10);
    badVp8.set([0, 0, 0, 0x00, 0x00, 0x00]); // magic bytes incorrectos
    const file = riff([chunk('VP8 ', badVp8)]);
    expect(parseWebp(file)).toBeNull();
  });

  it('rechaza dimensiones rectangulares no cuadradas (ej. 512x256)', () => {
    const res = validateStickerFile(riff([vp8(512, 256)]), 'image/webp');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('512x512');
  });

  it('acepta declaredMime application/octet-stream si el contenido binario es WebP válido', () => {
    const res = validateStickerFile(riff([vp8(512, 512)]), 'application/octet-stream');
    expect(res.ok).toBe(true);
  });

  it('rechaza mimes no compatibles (ej. image/jpeg, image/gif)', () => {
    const resJpeg = validateStickerFile(riff([vp8(512, 512)]), 'image/jpeg');
    expect(resJpeg.ok).toBe(false);
    if (!resJpeg.ok) expect(resJpeg.error).toContain('Formato no soportado');

    const resGif = validateStickerFile(riff([vp8(512, 512)]), 'image/gif');
    expect(resGif.ok).toBe(false);
  });
});

describe('Stickers: integración de endpoints de API y control de acceso (RBAC)', () => {
  const validWebpBytes = riff([vp8(512, 512)]);

  function createMockDb(initial?: { stickers?: any[]; leads?: any[]; messages?: any[] }) {
    const stickersMap = new Map<string, any>((initial?.stickers || []).map((s) => [s.id, { ...s }]));
    const leadsMap = new Map<string, any>((initial?.leads || []).map((l) => [l.id, { ...l }]));
    const messagesList: any[] = [...(initial?.messages || [])];

    return {
      stickersMap,
      leadsMap,
      messagesList,
      prepare(sql: string) {
        let boundArgs: any[] = [];
        const stmt = {
          bind(...args: any[]) {
            boundArgs = args;
            return stmt;
          },
          async first<T = any>(): Promise<T | null> {
            if (sql.includes('FROM stickers WHERE id = ?') || sql.includes('SELECT r2_key, mime_type FROM stickers WHERE id = ?')) {
              return (stickersMap.get(boundArgs[0]) || null) as T;
            }
            if (sql.includes('FROM leads WHERE id = ?')) {
              return (leadsMap.get(boundArgs[0]) || null) as T;
            }
            if (sql.includes('FROM whatsapp_settings')) {
              return null;
            }
            return null;
          },
          async all<T = any>(): Promise<{ results: T[] }> {
            if (sql.includes('FROM stickers')) {
              return { results: Array.from(stickersMap.values()) as T[] };
            }
            return { results: [] };
          },
          async run(): Promise<{ success: boolean }> {
            if (sql.includes('INSERT INTO stickers')) {
              const [id, name, r2_key, mime_type, animated, size_bytes, created_by, created_at] = boundArgs;
              stickersMap.set(id, { id, name, r2_key, mime_type, animated, size_bytes, created_by, created_at });
            } else if (sql.includes('DELETE FROM stickers WHERE id = ?')) {
              stickersMap.delete(boundArgs[0]);
            } else if (sql.includes('INSERT INTO whatsapp_messages')) {
              const [id, lead_id, user_id, content, media_url, status, whatsapp_message_id, raw_payload, created_at] = boundArgs;
              messagesList.push({
                id,
                lead_id,
                user_id,
                sender: 'agent',
                message_type: 'sticker',
                content,
                media_url,
                status,
                whatsapp_message_id,
                raw_payload,
                created_at,
              });
            }
            return { success: true };
          },
        };
        return stmt;
      },
    };
  }

  function createMockStorage(initial?: Record<string, Uint8Array>) {
    const store = new Map<string, Uint8Array>(Object.entries(initial || {}));
    return {
      store,
      async get(key: string) {
        const data = store.get(key);
        if (!data) return null;
        return {
          body: data,
          httpMetadata: { contentType: 'image/webp' },
          arrayBuffer: async () => data.buffer,
        };
      },
      async put(key: string, data: Uint8Array | ArrayBuffer) {
        store.set(key, data instanceof Uint8Array ? data : new Uint8Array(data));
        return {};
      },
      async delete(key: string) {
        store.delete(key);
        return {};
      },
    };
  }

  function createTestHono(user?: { userId: string; role: 'admin' | 'agent'; name: string } | null) {
    const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
    app.use('*', async (c: any, next: any) => {
      if (user) {
        c.set('user', user);
      }
      await next();
    });
    app.route('/', whatsappRoutes);
    return app;
  }

  it('RBAC: deniega subida de stickers a usuarios no administradores (403)', async () => {
    const app = createTestHono({ userId: 'usr_agent_1', role: 'agent', name: 'Agente Ventas' });
    const mockDb = createMockDb();
    const mockStorage = createMockStorage();

    const form = new FormData();
    form.append('file', new Blob([validWebpBytes as any], { type: 'image/webp' }), 'test.webp');
    form.append('name', 'Sticker Agente');

    const res = await app.request('/api/whatsapp/stickers', {
      method: 'POST',
      body: form,
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toContain('rol de Administrador');
  });

  it('RBAC: deniega borrado de stickers a usuarios no administradores (403)', async () => {
    const app = createTestHono({ userId: 'usr_agent_1', role: 'agent', name: 'Agente Ventas' });
    const mockDb = createMockDb({
      stickers: [{ id: 'stk_1', name: 'Promo', r2_key: 'wa-stickers/stk_1.webp', mime_type: 'image/webp', animated: 0, size_bytes: 100 }],
    });
    const mockStorage = createMockStorage();

    const res = await app.request('/api/whatsapp/stickers/stk_1', {
      method: 'DELETE',
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(403);
  });

  it('RBAC: permite a agentes consultar la lista de stickers (200)', async () => {
    const app = createTestHono({ userId: 'usr_agent_1', role: 'agent', name: 'Agente Ventas' });
    const mockDb = createMockDb({
      stickers: [{ id: 'stk_1', name: 'Sticker Promo', r2_key: 'wa-stickers/stk_1.webp', mime_type: 'image/webp', animated: 0, size_bytes: 100, created_at: '2026-01-01T00:00:00Z' }],
    });

    const res = await app.request('/api/whatsapp/stickers', {
      method: 'GET',
    }, { DB: mockDb });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.stickers).toHaveLength(1);
    expect(body.stickers[0].name).toBe('Sticker Promo');
  });

  it('Subida: administrador puede subir sticker válido 512x512 (201)', async () => {
    const app = createTestHono({ userId: 'usr_admin_1', role: 'admin', name: 'Admin Principal' });
    const mockDb = createMockDb();
    const mockStorage = createMockStorage();

    const form = new FormData();
    form.append('file', new Blob([validWebpBytes as any], { type: 'image/webp' }), 'sticker.webp');
    form.append('name', 'Bienvenida 2026');

    const res = await app.request('/api/whatsapp/stickers', {
      method: 'POST',
      body: form,
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.sticker.name).toBe('Bienvenida 2026');
    expect(body.sticker.animated).toBe(false);
    expect(mockDb.stickersMap.size).toBe(1);
    expect(mockStorage.store.size).toBe(1);
  });

  it('Subida: rechaza archivo si excede 80 caracteres en el nombre (400)', async () => {
    const app = createTestHono({ userId: 'usr_admin_1', role: 'admin', name: 'Admin Principal' });
    const mockDb = createMockDb();
    const mockStorage = createMockStorage();

    const form = new FormData();
    form.append('file', new Blob([validWebpBytes as any], { type: 'image/webp' }), 'sticker.webp');
    form.append('name', 'a'.repeat(81));

    const res = await app.request('/api/whatsapp/stickers', {
      method: 'POST',
      body: form,
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toContain('80 caracteres');
  });

  it('Subida: rechaza archivo no WebP o con dimensiones incorrectas (400)', async () => {
    const app = createTestHono({ userId: 'usr_admin_1', role: 'admin', name: 'Admin Principal' });
    const mockDb = createMockDb();
    const mockStorage = createMockStorage();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3]) as any], { type: 'image/png' }), 'corrupt.png');
    form.append('name', 'Sticker Corrupto');

    const res = await app.request('/api/whatsapp/stickers', {
      method: 'POST',
      body: form,
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(400);
  });

  it('Envío: preserva estado failed en BD cuando falla el envío a Meta (502)', async () => {
    const app = createTestHono({ userId: 'usr_agent_1', role: 'agent', name: 'Asesor' });
    const mockDb = createMockDb({
      leads: [{ id: 'lead_test_1', full_name: 'Carlos Perez', phone: '+59171234567' }],
      stickers: [{ id: 'stk_1', name: 'Promo', r2_key: 'wa-stickers/stk_1.webp', mime_type: 'image/webp', animated: 0, size_bytes: 100 }],
    });
    const mockStorage = createMockStorage({
      'wa-stickers/stk_1.webp': validWebpBytes,
    });

    // Envío sin credenciales de Meta configuradas -> simula fallo de despacho
    const res = await app.request('/api/whatsapp/leads/lead_test_1/send-sticker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sticker_id: 'stk_1' }),
    }, { DB: mockDb, STORAGE: mockStorage });

    expect(res.status).toBe(502);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.messageId).toMatch(/^msg_/);
    expect(body.metaSendError).toBeTruthy();

    // Verificación crítica de QA: el mensaje fue guardado en BD con status 'failed'
    expect(mockDb.messagesList).toHaveLength(1);
    expect(mockDb.messagesList[0].status).toBe('failed');
    expect(mockDb.messagesList[0].message_type).toBe('sticker');
    expect(mockDb.messagesList[0].media_url).toBe('/api/whatsapp/stickers/stk_1/file');
  });
});

describe('Stickers: auditoría estática de rutas', () => {
  const wa = fs.readFileSync(path.resolve(__dirname, '../routes/whatsapp.ts'), 'utf-8');
  it('expone los endpoints de stickers y envío', () => {
    expect(wa).toContain("whatsappRoutes.get('/api/whatsapp/stickers'");
    expect(wa).toContain("whatsappRoutes.post('/api/whatsapp/stickers'");
    expect(wa).toContain("whatsappRoutes.delete('/api/whatsapp/stickers/:id'");
    expect(wa).toContain("whatsappRoutes.get('/api/whatsapp/stickers/:id/file'");
    expect(wa).toContain("whatsappRoutes.post('/api/whatsapp/leads/:id/send-sticker'");
  });
  it('protege subida/borrado con requireAdmin y maneja stickers entrantes', () => {
    expect(wa).toContain("whatsappRoutes.use('/api/whatsapp/stickers/*', stickersAdminGuard)");
    expect(wa).toContain("msgType === 'sticker'");
  });
  it('el esquema permite message_type sticker', () => {
    const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf-8');
    expect(schema).toContain("'sticker'");
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS stickers');
  });
});
