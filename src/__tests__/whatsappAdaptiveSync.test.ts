import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { whatsappRoutes } from '../routes/whatsapp';

describe('Sincronización Adaptativa y Eficiencia Cloudflare D1 en WhatsApp', () => {
  const inboxPath = path.resolve(__dirname, '../client/pages/WhatsAppInbox.tsx');
  const inboxContent = fs.readFileSync(inboxPath, 'utf-8');

  describe('1. Auditoría de Código Frontend (WhatsAppInbox.tsx)', () => {
    it('elimina el polling incondicional agresivo de 3.5s', () => {
      expect(inboxContent).not.toContain('setInterval(() => {');
      expect(inboxContent).not.toContain('}, 3500)');
    });

    it('implementa In-Flight Guards para chat e inbox', () => {
      expect(inboxContent).toContain('isChatInFlight');
      expect(inboxContent).toContain('isInboxInFlight');
    });

    it('soporta sincronización incremental con timestamp "since" para chats', () => {
      expect(inboxContent).toContain('lastMsgTime');
      expect(inboxContent).toContain('api.getWhatsAppChat(leadId, lastMsgTime)');
    });

    it('implementa backoff adaptativo por inactividad y detección de visibilidad', () => {
      expect(inboxContent).toContain('recordUserActivity');
      expect(inboxContent).toContain('visibilitychange');
      expect(inboxContent).toContain('document.hidden');
      expect(inboxContent).toContain('setSyncStatus');
    });

    it('preserva botones táctiles de 44px y accesibilidad móvil requerida por QA', () => {
      expect(inboxContent).toContain('handleBackToList');
      expect(inboxContent).toContain('min-h-[44px]');
      expect(inboxContent).toContain('Volver');
      expect(inboxContent).toContain('min-h-[44px] min-w-[44px]');
    });

    it('ofrece botón de sincronización manual inmediata y estado en vivo', () => {
      expect(inboxContent).toContain('handleManualRefresh');
      expect(inboxContent).toContain('Sincronizar');
    });
  });

  describe('2. Endpoints Backend de Eficiencia D1 (whatsapp.ts)', () => {
    const mockKv = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          userId: 'usr_admin_test',
          name: 'Admin Tester',
          email: 'admin@fitnesscrm.com',
          role: 'admin',
        })
      ),
    };

    it('soporta ruta GET /api/whatsapp/inbox/sync-check con consultas ultra-livianas indexadas', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_test', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const mockDb: any = {
        prepare: vi.fn().mockImplementation((sql: string) => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('whatsapp_messages')) {
              return { created_at: '2026-11-09 20:00:00' };
            }
            if (sql.includes('leads')) {
              return { updated_at: '2026-11-09 20:05:00' };
            }
            return null;
          }),
        })),
      };

      const res = await app.request(
        '/api/whatsapp/inbox/sync-check',
        {
          headers: { 'Content-Type': 'application/json' },
        },
        {
          DB: mockDb,
        } as any
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.lastActivity).toBe('W/"2026-11-09 20:00:00_2026-11-09 20:05:00"');
      expect(json.lastMessageAt).toBe('2026-11-09 20:00:00');
      expect(json.lastLeadUpdateAt).toBe('2026-11-09 20:05:00');
    });

    it('devuelve HTTP 304 Not Modified cuando If-None-Match coincide con el ETag', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_test', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const targetEtag = 'W/"2026-11-09 20:00:00_2026-11-09 20:05:00"';
      let cteExecuted = false;

      const mockDb: any = {
        prepare: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('WITH ranked_messages')) {
            cteExecuted = true;
          }
          return {
            first: vi.fn().mockImplementation(async () => {
              if (sql.includes('whatsapp_messages')) {
                return { created_at: '2026-11-09 20:00:00' };
              }
              if (sql.includes('leads')) {
                return { updated_at: '2026-11-09 20:05:00' };
              }
              return null;
            }),
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        }),
      };

      const res = await app.request(
        '/api/whatsapp/inbox',
        {
          headers: {
            'Content-Type': 'application/json',
            'If-None-Match': targetEtag,
          },
        },
        {
          DB: mockDb,
        } as any
      );

      expect(res.status).toBe(304);
      expect(res.headers.get('ETag')).toBe(targetEtag);
      // Confirma que NO se ejecutó la consulta pesada CTE
      expect(cteExecuted).toBe(false);
    });
  });
});
