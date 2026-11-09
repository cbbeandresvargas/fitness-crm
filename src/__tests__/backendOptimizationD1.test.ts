import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { whatsappRoutes } from '../routes/whatsapp';
import { leadsRoutes } from '../routes/leads';
import { runSalesAgentTurn } from '../lib/ai/salesAgent';

describe('Pruebas Unitarias de Optimización de Backend y Cloudflare D1', () => {
  describe('1. Endpoint /api/whatsapp/inbox/updates?since=...', () => {
    it('requiere el parámetro query "since"', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request('/api/whatsapp/inbox/updates');
      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toContain('since');
    });

    it('devuelve delta vacío y timestamp sin escanear mensajes cuando no hay actividad reciente', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      let queryExecuted = '';
      const mockDb: any = {
        prepare: vi.fn((sql: string) => {
          queryExecuted = sql;
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] }),
          };
        }),
      };

      const res = await app.request('/api/whatsapp/inbox/updates?since=2026-11-09T20:00:00.000Z', {}, { DB: mockDb } as any);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.conversations).toEqual([]);
      expect(json.timestamp).toBeDefined();
      expect(queryExecuted).toContain('l.last_message_time > ?');
      expect(queryExecuted).not.toContain('whatsapp_messages');
    });
  });

  describe('2. Endpoint /api/whatsapp/leads/:id/chat', () => {
    it('omite la consulta a whatsapp_messages si since >= last_message_time', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      let queriedWhatsappMessages = false;
      const mockDb: any = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('FROM whatsapp_messages')) {
            queriedWhatsappMessages = true;
          }
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'lead_1',
              full_name: 'Lead Test',
              phone: '+59171234567',
              status: 'contactado',
              segment: 'B',
              ai_enabled: 1,
              last_message_time: '2026-11-09T18:00:00.000Z',
              unread_count: 0,
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }),
      };

      // Solicitud con since posterior al último mensaje
      const res = await app.request('/api/whatsapp/leads/lead_1/chat?since=2026-11-09T19:00:00.000Z', {}, { DB: mockDb } as any);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.messages).toEqual([]);
      expect(queriedWhatsappMessages).toBe(false);
    });

    it('no ejecuta UPDATE para marcar leídos si unread_count es 0', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      let executedUpdate = false;
      const mockDb: any = {
        prepare: vi.fn((sql: string) => {
          if (sql.includes('UPDATE whatsapp_messages') || sql.includes('UPDATE leads')) {
            executedUpdate = true;
          }
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue({
              id: 'lead_2',
              full_name: 'Lead Sin No Leidos',
              phone: '+59171234568',
              status: 'contactado',
              segment: 'B',
              ai_enabled: 1,
              last_message_time: '2026-11-09T18:00:00.000Z',
              unread_count: 0, // No hay mensajes no leídos
            }),
            all: vi.fn().mockResolvedValue({ results: [{ id: 'msg_1', content: 'Hola' }] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
        }),
      };

      const res = await app.request('/api/whatsapp/leads/lead_2/chat', {}, { DB: mockDb } as any);
      expect(res.status).toBe(200);
      expect(executedUpdate).toBe(false);
    });
  });

  describe('3. Paginación y Eliminación de N+1 en /api/leads', () => {
    it('aplica LIMIT y OFFSET por defecto y consulta prospect_activities solo para los leads devueltos', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: any } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin', role: 'admin' });
        await next();
      });
      app.route('/', leadsRoutes);

      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockDb: any = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...params: any[]) => {
            executedQueries.push({ sql, params });
            return {
              all: vi.fn().mockImplementation(async () => {
                if (sql.includes('FROM leads l')) {
                  return {
                    results: [
                      {
                        id: 'lead_p1',
                        full_name: 'Lead 1',
                        phone: '+59171000001',
                        status: 'nuevo',
                        tags: '[]',
                        metadata: '{}',
                        created_at: '2026-11-09T12:00:00.000Z',
                      },
                      {
                        id: 'lead_p2',
                        full_name: 'Lead 2',
                        phone: '+59171000002',
                        status: 'contactado',
                        tags: '[]',
                        metadata: '{}',
                        created_at: '2026-11-09T11:00:00.000Z',
                      },
                    ],
                  };
                }
                if (sql.includes('FROM prospect_activities pa')) {
                  return {
                    results: [
                      { lead_id: 'lead_p1', id: 'act_gym', name: 'Gym', is_active: 1 },
                    ],
                  };
                }
                return { results: [] };
              }),
            };
          }),
        })),
      };

      const res = await app.request('/api/leads?limit=2&offset=0', {}, { DB: mockDb } as any);
      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.leads).toHaveLength(2);
      expect(json.limit).toBe(2);
      expect(json.offset).toBe(0);

      // Verificar que la consulta a leads incluyó LIMIT ? OFFSET ?
      const leadQuery = executedQueries.find((q) => q.sql.includes('FROM leads l'));
      expect(leadQuery).toBeDefined();
      expect(leadQuery?.sql).toContain('LIMIT ? OFFSET ?');
      expect(leadQuery?.params).toContain(2);

      // Verificar que la consulta a prospect_activities usó IN (?, ?) con solo los IDs de los 2 leads
      const paQuery = executedQueries.find((q) => q.sql.includes('FROM prospect_activities pa'));
      expect(paQuery).toBeDefined();
      expect(paQuery?.sql).toContain('pa.lead_id IN (?,?)');
      expect(paQuery?.params).toEqual(['lead_p1', 'lead_p2']);
    });
  });

  describe('4. Caché en Memoria en salesAgent', () => {
    it('reutiliza la configuración de whatsapp_settings en llamadas consecutivas evitando lecturas repetidas', async () => {
      let settingsQueryCount = 0;
      const mockLead = {
        id: 'lead_cached_1',
        full_name: 'Lead Caching',
        phone: '+59172000000',
        status: 'contactado' as const,
        segment: 'B' as const,
        ai_enabled: 1,
        handoff_at: null,
        created_at: '2026-11-09T10:00:00Z',
        updated_at: '2026-11-09T10:00:00Z',
        tags: [],
        metadata: {},
      };

      const mockDb: any = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn(async () => {
            if (sql.includes('FROM leads WHERE id = ?')) return mockLead;
            if (sql.includes('FROM whatsapp_settings')) {
              settingsQueryCount++;
              return { ai_enabled: 1 };
            }
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('FROM whatsapp_messages')) return { results: [] };
            if (sql.includes('FROM activities')) return { results: [] };
            return { results: [] };
          }),
          run: vi.fn(async () => ({ success: true })),
        })),
        batch: vi.fn(async () => [{ success: true }]),
      };

      const mockEnv: any = {
        DB: mockDb,
        AI: null,
      };

      // Primera ejecución: debe consultar whatsapp_settings
      await runSalesAgentTurn({
        env: mockEnv,
        leadId: 'lead_cached_1',
        incomingText: 'Hola, qué planes tienen?',
      });

      // Segunda ejecución inmediata: debe usar la caché en memoria y NO consultar D1 de nuevo
      await runSalesAgentTurn({
        env: mockEnv,
        leadId: 'lead_cached_1',
        incomingText: 'Cuánto cuesta el plan Pro?',
      });

      expect(settingsQueryCount).toBe(1);
    });
  });
});
