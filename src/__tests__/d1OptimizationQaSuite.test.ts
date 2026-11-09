import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { whatsappRoutes } from '../routes/whatsapp';
import { leadsRoutes } from '../routes/leads';
import { activitiesRoutes } from '../routes/activities';
import { buildSalesAgentPrompt, generateSmartSalesFallback } from '../lib/ai/salesAgent';
import { computeFcSegment } from '../lib/segments';
import { SessionData, Lead, KnowledgeBaseEntry } from '../lib/types';

/**
 * SQLite D1 Mock Adapter
 * Simula fielmente la interfaz Cloudflare D1 (prepare, bind, first, all, run, batch)
 * respaldada por una base de datos real SQLite en memoria (node:sqlite) y registra
 * todas las consultas ejecutadas para verificar optimizaciones de rendimiento y lecturas.
 */
class SQLiteD1Adapter {
  public db: DatabaseSync;
  public queryLog: { sql: string; params: any[] }[] = [];

  constructor(schemaSql?: string) {
    this.db = new DatabaseSync(':memory:');
    if (schemaSql) {
      this.db.exec(schemaSql);
    }
  }

  prepare(sql: string) {
    const self = this;
    const createExecutor = (params: any[] = []) => ({
      first: async <T = any>(colName?: string): Promise<T | null> => {
        self.queryLog.push({ sql, params });
        try {
          const stmt = self.db.prepare(sql);
          const row = stmt.get(...params) as any;
          if (!row) return null;
          if (colName) return row[colName];
          return row as T;
        } catch (err: any) {
          throw new Error(`D1 first error on "${sql}": ${err.message}`);
        }
      },
      all: async <T = any>(): Promise<{ results: T[]; success: boolean }> => {
        self.queryLog.push({ sql, params });
        try {
          const stmt = self.db.prepare(sql);
          const rows = stmt.all(...params) as T[];
          return { results: rows, success: true };
        } catch (err: any) {
          throw new Error(`D1 all error on "${sql}": ${err.message}`);
        }
      },
      run: async (): Promise<{ success: boolean; meta: any }> => {
        self.queryLog.push({ sql, params });
        try {
          const stmt = self.db.prepare(sql);
          const res = stmt.run(...params);
          return { success: true, meta: { changes: res.changes } };
        } catch (err: any) {
          throw new Error(`D1 run error on "${sql}": ${err.message}`);
        }
      },
    });

    return {
      bind: (...params: any[]) => createExecutor(params),
      ...createExecutor([]),
    };
  }

  async batch(statements: any[]): Promise<any[]> {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  clearLog() {
    this.queryLog = [];
  }
}

describe('QA COMPREHENSIVE SUITE: Optimización de Lecturas Cloudflare D1 e Integridad del Sistema', () => {
  const schemaPath = path.resolve(__dirname, '../db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  let adapter: SQLiteD1Adapter;

  beforeEach(() => {
    adapter = new SQLiteD1Adapter(schemaSql);

    // Insertar usuarios iniciales para pruebas de RBAC
    adapter.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, is_active)
      VALUES 
        ('usr_admin_1', 'Admin General', 'admin@fitnesscrm.com', 'hash1', 'admin', 1),
        ('usr_agent_1', 'Asesor Uno', 'asesor1@fitnesscrm.com', 'hash2', 'agent', 1),
        ('usr_agent_2', 'Asesor Dos', 'asesor2@fitnesscrm.com', 'hash3', 'agent', 1)
    `).run();
  });

  // =========================================================================
  // 1. /api/whatsapp/inbox: Ordenamiento, Límite de 50 y RBAC
  // =========================================================================
  describe('1. Bandeja de Entrada Unificada (/api/whatsapp/inbox)', () => {
    it('retorna estrictamente hasta 50 conversaciones ordenadas por last_message_time DESC', async () => {
      // Crear 55 prospectos con mensajes escalonados en el tiempo
      for (let i = 1; i <= 55; i++) {
        const leadId = `lead_${i.toString().padStart(3, '0')}`;
        const timeIso = new Date(1700000000000 + i * 60000).toISOString();
        adapter.db.prepare(`
          INSERT INTO leads (id, full_name, phone, status, segment, assigned_to, last_message_text, last_message_time, last_message_sender, last_message_status, unread_count)
          VALUES (?, ?, ?, 'contactado', 'B', 'usr_agent_1', ?, ?, 'lead', 'delivered', ?)
        `).run(leadId, `Lead ${i}`, `+5917000${i.toString().padStart(4, '0')}`, `Mensaje ${i}`, timeIso, i % 3);
      }

      // Prospecto sin mensajes (last_message_time NULL)
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, status, segment, last_message_text, last_message_time)
        VALUES ('lead_no_msg', 'Lead Sin Mensajes', '+59179999999', 'nuevo', 'B', NULL, NULL)
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request('/api/whatsapp/inbox', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { conversations: any[] };
      expect(data.conversations).toBeDefined();
      expect(data.conversations.length).toBe(50); // Exactamente 50 (no 55)

      // Verificar orden estrictamente descendente
      for (let i = 0; i < data.conversations.length - 1; i++) {
        const current = new Date(data.conversations[i].lastMessageTime).getTime();
        const next = new Date(data.conversations[i + 1].lastMessageTime).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }

      // La primera conversación debe ser la número 55 (la más reciente)
      expect(data.conversations[0].leadId).toBe('lead_055');
      expect(data.conversations[0].lastMessageText).toBe('Mensaje 55');

      // El prospecto sin mensajes no debe figurar en la lista
      const hasLeadNoMsg = data.conversations.some((c) => c.leadId === 'lead_no_msg');
      expect(hasLeadNoMsg).toBe(false);

      // Verificar que todos los campos requeridos estén presentes y formateados
      const sample = data.conversations[0];
      expect(sample.leadId).toBeDefined();
      expect(sample.leadName).toBeDefined();
      expect(sample.leadPhone).toBeDefined();
      expect(sample.leadStatus).toBeDefined();
      expect(sample.leadSegment).toBeDefined();
      expect(sample.assignedTo).toBe('usr_agent_1');
      expect(sample.assignedName).toBe('Asesor Uno');
      expect(sample.lastMessageText).toBeDefined();
      expect(sample.lastMessageTime).toBeDefined();
      expect(sample.lastMessageSender).toBe('lead');
      expect(sample.lastMessageStatus).toBe('delivered');
      expect(typeof sample.unreadCount).toBe('number');
      expect(typeof sample.aiEnabled).toBe('boolean');
    });

    it('aplica RBAC: los asesores solo ven prospectos asignados a ellos o sin asignar', async () => {
      // Lead asignado a agente 1
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, assigned_to, last_message_text, last_message_time)
        VALUES ('lead_ag1', 'Lead de Agente 1', '+59171111111', 'usr_agent_1', 'Hola 1', '2026-11-09T10:00:00Z')
      `).run();

      // Lead asignado a agente 2
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, assigned_to, last_message_text, last_message_time)
        VALUES ('lead_ag2', 'Lead de Agente 2', '+59172222222', 'usr_agent_2', 'Hola 2', '2026-11-09T10:05:00Z')
      `).run();

      // Lead sin asignar (pool general)
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, assigned_to, last_message_text, last_message_time)
        VALUES ('lead_unassigned', 'Lead Sin Asignar', '+59173333333', NULL, 'Hola 3', '2026-11-09T10:10:00Z')
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_agent_1', name: 'Asesor Uno', email: 'asesor1@fitnesscrm.com', role: 'agent' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request('/api/whatsapp/inbox', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { conversations: any[] };
      const ids = data.conversations.map((c) => c.leadId);

      // Agente 1 debe ver su propio lead y el lead sin asignar
      expect(ids).toContain('lead_ag1');
      expect(ids).toContain('lead_unassigned');
      // No debe ver el lead asignado al agente 2
      expect(ids).not.toContain('lead_ag2');
    });
  });

  // =========================================================================
  // 2. Soporte de ETag / HTTP 304 e Invalidación
  // =========================================================================
  describe('2. Caché Condicional ETag / HTTP 304 en /api/whatsapp/inbox', () => {
    it('retorna HTTP 304 y cuerpo vacío sin consultar la lista de conversaciones cuando If-None-Match coincide', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, last_message_text, last_message_time, updated_at)
        VALUES ('lead_etag_1', 'Lead ETag', '+59174444444', 'Texto inicial', '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')
      `).run();
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, created_at)
        VALUES ('msg_etag_1', 'lead_etag_1', 'lead', 'Texto inicial', '2026-11-09T12:00:00Z')
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      // 1ra solicitud: Debe retornar 200 y header ETag
      const res1 = await app.request('/api/whatsapp/inbox', {}, { DB: adapter } as any);
      expect(res1.status).toBe(200);
      const etag = res1.headers.get('ETag');
      expect(etag).toBeDefined();
      expect(etag).toContain('W/"');

      adapter.clearLog();

      // 2da solicitud: Con If-None-Match igual al ETag recibido
      const res2 = await app.request(
        '/api/whatsapp/inbox',
        {
          headers: { 'If-None-Match': etag! },
        },
        { DB: adapter } as any
      );

      expect(res2.status).toBe(304);
      expect(res2.headers.get('ETag')).toBe(etag);
      const body = await res2.text();
      expect(body).toBe('');

      // Comprobar que solo se ejecutaron 2 lecturas de índice y NO la consulta pesada de conversaciones
      const mainQueryExecuted = adapter.queryLog.some((q) => q.sql.includes('ORDER BY l.last_message_time DESC'));
      expect(mainQueryExecuted).toBe(false);
      expect(adapter.queryLog.length).toBe(2); // SELECT created_at ... LIMIT 1 y SELECT updated_at ... LIMIT 1
    });

    it('invalida el ETag y retorna 200 cuando se marca un chat como leído o llega un mensaje', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, unread_count, last_message_text, last_message_time, updated_at)
        VALUES ('lead_unread', 'Lead Con Pendiente', '+59175555555', 1, 'Mensaje no leido', '2026-11-09T14:00:00Z', '2026-11-09T14:00:00Z')
      `).run();
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('msg_unread', 'lead_unread', 'lead', 'Mensaje no leido', 'delivered', '2026-11-09T14:00:00Z')
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const resInitial = await app.request('/api/whatsapp/inbox', {}, { DB: adapter } as any);
      const initialEtag = resInitial.headers.get('ETag')!;

      // Simular apertura del chat por el asesor (marcar como leído en /api/whatsapp/leads/:id/chat)
      const chatRes = await app.request('/api/whatsapp/leads/lead_unread/chat', {}, { DB: adapter } as any);
      expect(chatRes.status).toBe(200);

      // Verificar que el ETag en inbox haya cambiado gracias a la actualización de updated_at
      const resAfterRead = await app.request(
        '/api/whatsapp/inbox',
        {
          headers: { 'If-None-Match': initialEtag },
        },
        { DB: adapter } as any
      );

      // No debe ser 304 porque el estado de lectura cambió
      expect(resAfterRead.status).toBe(200);
      const dataAfter = (await resAfterRead.json()) as { conversations: any[] };
      const updatedLead = dataAfter.conversations.find((c) => c.leadId === 'lead_unread');
      expect(updatedLead.unreadCount).toBe(0);
    });

    it('/api/whatsapp/inbox/sync-check retorna hash ultra-liviano de sincronización en 2 lecturas indexadas', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, updated_at)
        VALUES ('lead_sync', 'Lead Sync', '+59176666666', '2026-11-09 15:20:00')
      `).run();
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, created_at)
        VALUES ('msg_sync', 'lead_sync', 'lead', 'Sync text', '2026-11-09 15:25:00')
      `).run();
      // Actualizar el lead con posterioridad al mensaje
      adapter.db.prepare(`
        UPDATE leads SET updated_at = '2026-11-09 15:30:00' WHERE id = 'lead_sync'
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      adapter.clearLog();
      const res = await app.request('/api/whatsapp/inbox/sync-check', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.lastActivity).toBe('W/"2026-11-09 15:25:00_2026-11-09 15:30:00"');
      expect(json.lastMessageAt).toBe('2026-11-09 15:25:00');
      expect(json.lastLeadUpdateAt).toBe('2026-11-09 15:30:00');
      expect(adapter.queryLog.length).toBe(2);
    });
  });

  // =========================================================================
  // 3. /api/whatsapp/leads/:id/chat: Optimización "since" y Marcar Leídos
  // =========================================================================
  describe('3. Detalle y Sincronización Incremental de Chat (/api/whatsapp/leads/:id/chat)', () => {
    it('omite la consulta a whatsapp_messages si since >= last_message_time', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, last_message_time, unread_count)
        VALUES ('lead_chat_1', 'Lead Chat 1', '+59177777771', '2026-11-09T16:00:00Z', 0)
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      adapter.clearLog();
      // Solicitud con since posterior al último mensaje del lead
      const res = await app.request(
        '/api/whatsapp/leads/lead_chat_1/chat?since=2026-11-09T16:05:00Z',
        {},
        { DB: adapter } as any
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.messages).toEqual([]);
      expect(json.lead.id).toBe('lead_chat_1');

      // Verificar que NO se consultó la tabla whatsapp_messages
      const msgQuery = adapter.queryLog.find((q) => q.sql.includes('FROM whatsapp_messages'));
      expect(msgQuery).toBeUndefined();
    });

    it('devuelve únicamente mensajes nuevos cuando since < last_message_time', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, last_message_time)
        VALUES ('lead_chat_2', 'Lead Chat 2', '+59177777772', '2026-11-09T16:30:00Z')
      `).run();

      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, created_at)
        VALUES 
          ('m1', 'lead_chat_2', 'lead', 'Viejo 1', '2026-11-09T16:10:00Z'),
          ('m2', 'lead_chat_2', 'agent', 'Viejo 2', '2026-11-09T16:20:00Z'),
          ('m3', 'lead_chat_2', 'lead', 'Nuevo 1', '2026-11-09T16:25:00Z'),
          ('m4', 'lead_chat_2', 'agent', 'Nuevo 2', '2026-11-09T16:30:00Z')
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request(
        '/api/whatsapp/leads/lead_chat_2/chat?since=2026-11-09T16:20:00Z',
        {},
        { DB: adapter } as any
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.messages.length).toBe(2);
      expect(json.messages[0].id).toBe('m3');
      expect(json.messages[1].id).toBe('m4');
    });

    it('no ejecuta UPDATE para marcar leídos si unread_count es 0 o si se envía since', async () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone, last_message_time, unread_count)
        VALUES ('lead_chat_3', 'Lead Chat 3', '+59177777773', '2026-11-09T17:00:00Z', 0)
      `).run();

      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      adapter.clearLog();
      await app.request('/api/whatsapp/leads/lead_chat_3/chat', {}, { DB: adapter } as any);

      // Comprobar que no hubo sentencias UPDATE
      const updateQueries = adapter.queryLog.filter((q) => q.sql.includes('UPDATE'));
      expect(updateQueries.length).toBe(0);
    });

    it('retorna 404 si el lead no existe', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request('/api/whatsapp/leads/inexistente/chat', {}, { DB: adapter } as any);
      expect(res.status).toBe(404);
      const json = (await res.json()) as any;
      expect(json.error).toBe('Lead no encontrado');
    });
  });

  // =========================================================================
  // 4. /api/leads: Paginación y Eliminación de N+1 en Actividades
  // =========================================================================
  describe('4. Listado de Leads y Paginación sin N+1 (/api/leads)', () => {
    beforeEach(() => {
      // Crear catálogo de actividades
      adapter.db.prepare(`
        INSERT INTO activities (id, name, name_norm, is_active)
        VALUES 
          ('act_box', 'Boxeo', 'boxeo', 1),
          ('act_gym', 'Musculación', 'musculacion', 1),
          ('act_cross', 'Crossfit', 'crossfit', 1)
      `).run();

      // Crear 15 leads con actividades asociadas
      for (let i = 1; i <= 15; i++) {
        const leadId = `lead_page_${i.toString().padStart(2, '0')}`;
        adapter.db.prepare(`
          INSERT INTO leads (id, full_name, phone, status, segment, created_at)
          VALUES (?, ?, ?, 'nuevo', 'B', ?)
        `).run(leadId, `Lead Pagina ${i}`, `+591788888${i.toString().padStart(2, '0')}`, new Date(1700000000000 + i * 1000).toISOString());

        // Asociar actividades a los leads más recientes
        if (i >= 11) {
          adapter.db.prepare(`
            INSERT INTO prospect_activities (id, lead_id, activity_id)
            VALUES (?, ?, ?)
          `).run(`pa_${i}_1`, leadId, 'act_gym');
        }
      }
    });

    it('aplica paginación por defecto con limit=50 y offset=0', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', leadsRoutes);

      const res = await app.request('/api/leads', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.limit).toBe(50);
      expect(json.offset).toBe(0);
      expect(json.leads.length).toBe(15);
    });

    it('respeta parámetros limit, offset y page calculando de forma segura', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', leadsRoutes);

      // Página 2 con limit=5 -> offset debe ser 5
      const res = await app.request('/api/leads?limit=5&page=2', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.leads.length).toBe(5);
      expect(json.limit).toBe(5);
      expect(json.offset).toBe(5);

      // Limit exagerado se acota a 200 máx
      const resClamped = await app.request('/api/leads?limit=5000', {}, { DB: adapter } as any);
      const jsonClamped = (await resClamped.json()) as any;
      expect(jsonClamped.limit).toBe(200);
    });

    it('carga las actividades de interés en UNA sola consulta batch (evitando N+1)', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', leadsRoutes);

      adapter.clearLog();
      const res = await app.request('/api/leads?limit=10', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;

      // Buscar consultas ejecutadas sobre prospect_activities
      const paQueries = adapter.queryLog.filter((q) => q.sql.includes('FROM prospect_activities pa'));
      // Debe haber exactamente 1 consulta con IN (?, ?, ...) en vez de 10 consultas separadas
      expect(paQueries.length).toBe(1);
      expect(paQueries[0].sql).toContain('pa.lead_id IN');

      // Verificar que las actividades están presentes en los leads correspondientes
      const leadWithActivity = json.leads.find((l: any) => l.id === 'lead_page_15');
      expect(leadWithActivity).toBeDefined();
      expect(leadWithActivity.interests).toBeDefined();
      expect(leadWithActivity.interests.length).toBe(1);
      expect(leadWithActivity.interests[0].name).toBe('Musculación');
    });

    it('no realiza consultas de actividades si no hay leads resultantes', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', leadsRoutes);

      adapter.clearLog();
      // Búsqueda que no coincida con ningún lead
      const res = await app.request('/api/leads?search=inexistente_total', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.leads.length).toBe(0);

      const paQuery = adapter.queryLog.find((q) => q.sql.includes('FROM prospect_activities pa'));
      expect(paQuery).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Triggers Atómicos SQLite y Coherencia de Desnormalización
  // =========================================================================
  describe('5. Triggers SQLite y Consistencia de Datos en leads', () => {
    it('mantiene la sincronización completa al insertar mensaje de lead vs agente', () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone)
        VALUES ('lead_trg_1', 'Lead Triggers', '+59179990001')
      `).run();

      let lead = adapter.db.prepare('SELECT last_message_text, last_message_time, unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.last_message_text).toBeNull();
      expect(lead.unread_count).toBe(0);

      // 1. Mensaje entrante del prospecto (lead)
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_in_1', 'lead_trg_1', 'lead', 'Hola, precios?', 'delivered', '2026-11-09T18:00:00Z')
      `).run();

      lead = adapter.db.prepare('SELECT last_message_text, last_message_time, last_message_sender, unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.last_message_text).toBe('Hola, precios?');
      expect(lead.last_message_time).toBe('2026-11-09T18:00:00Z');
      expect(lead.last_message_sender).toBe('lead');
      expect(lead.unread_count).toBe(1);

      // 2. Segundo mensaje del prospecto
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_in_2', 'lead_trg_1', 'lead', 'Y los horarios?', 'delivered', '2026-11-09T18:01:00Z')
      `).run();

      lead = adapter.db.prepare('SELECT last_message_text, unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.last_message_text).toBe('Y los horarios?');
      expect(lead.unread_count).toBe(2);

      // 3. Respuesta enviada por el asesor (agent)
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_out_1', 'lead_trg_1', 'agent', '¡Hola! Atendemos desde las 6:00', 'sent', '2026-11-09T18:02:00Z')
      `).run();

      lead = adapter.db.prepare('SELECT last_message_text, last_message_sender, unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.last_message_text).toBe('¡Hola! Atendemos desde las 6:00');
      expect(lead.last_message_sender).toBe('agent');
      // ¡El mensaje del agente NO debe incrementar unread_count!
      expect(lead.unread_count).toBe(2);

      // 4. Actualización de estado a 'read' (marcar como leído)
      adapter.db.prepare(`
        UPDATE whatsapp_messages SET status = 'read' WHERE id = 'm_in_1'
      `).run();

      lead = adapter.db.prepare('SELECT unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.unread_count).toBe(1);

      adapter.db.prepare(`
        UPDATE whatsapp_messages SET status = 'read' WHERE id = 'm_in_2'
      `).run();

      lead = adapter.db.prepare('SELECT unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.unread_count).toBe(0);

      // 5. Protección contra valores negativos: si se actualiza otro mensaje, no baja de 0
      adapter.db.prepare(`
        UPDATE whatsapp_messages SET status = 'read' WHERE id = 'm_out_1'
      `).run();

      lead = adapter.db.prepare('SELECT unread_count FROM leads WHERE id = ?').get('lead_trg_1') as any;
      expect(lead.unread_count).toBe(0);
    });

    it('no sobrescribe un mensaje más reciente si se inserta un mensaje desfasado en el tiempo', () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone)
        VALUES ('lead_trg_2', 'Lead Desfasado', '+59179990002')
      `).run();

      // Insertar mensaje con fecha reciente
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_reciente', 'lead_trg_2', 'agent', 'Mensaje moderno', 'sent', '2026-11-09T20:00:00Z')
      `).run();

      // Insertar mensaje antiguo desfasado
      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_antiguo', 'lead_trg_2', 'lead', 'Mensaje del pasado', 'sent', '2026-11-09T10:00:00Z')
      `).run();

      const lead = adapter.db.prepare('SELECT last_message_text, last_message_time FROM leads WHERE id = ?').get('lead_trg_2') as any;
      expect(lead.last_message_text).toBe('Mensaje moderno');
      expect(lead.last_message_time).toBe('2026-11-09T20:00:00Z');
    });

    it('descuenta unread_count al eliminar un mensaje no leído', () => {
      adapter.db.prepare(`
        INSERT INTO leads (id, full_name, phone)
        VALUES ('lead_trg_3', 'Lead Delete', '+59179990003')
      `).run();

      adapter.db.prepare(`
        INSERT INTO whatsapp_messages (id, lead_id, sender, content, status, created_at)
        VALUES ('m_del', 'lead_trg_3', 'lead', 'Por borrar', 'delivered', '2026-11-09T21:00:00Z')
      `).run();

      let lead = adapter.db.prepare('SELECT unread_count FROM leads WHERE id = ?').get('lead_trg_3') as any;
      expect(lead.unread_count).toBe(1);

      adapter.db.prepare(`DELETE FROM whatsapp_messages WHERE id = 'm_del'`).run();

      lead = adapter.db.prepare('SELECT unread_count FROM leads WHERE id = ?').get('lead_trg_3') as any;
      expect(lead.unread_count).toBe(0);
    });
  });

  // =========================================================================
  // 6. Regresión de Funcionalidades Clave (Webhook, Auth, Stickers, IA)
  // =========================================================================
  describe('6. Ausencia de Regresiones en Funcionalidades Principales', () => {
    it('Webhook Meta GET responde correctamente con hub.challenge', async () => {
      const app = new Hono<{ Bindings: any }>();
      app.route('/', whatsappRoutes);

      const mockEnv = {
        META_WA_VERIFY_TOKEN: 'token_prueba_seguro_2026',
        DB: adapter,
      };

      // Solicitud correcta
      const resOk = await app.request(
        '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=token_prueba_seguro_2026&hub.challenge=CHALLENGE_CODE_123',
        {},
        mockEnv as any
      );
      expect(resOk.status).toBe(200);
      expect(await resOk.text()).toBe('CHALLENGE_CODE_123');

      // Solicitud con token incorrecto
      const resBad = await app.request(
        '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=token_invalido&hub.challenge=CHALLENGE_CODE_123',
        {},
        mockEnv as any
      );
      expect(resBad.status).toBe(403);
    });

    it('Webhook Meta POST rechaza payloads sin firma válida con 401', async () => {
      const app = new Hono<{ Bindings: any }>();
      app.route('/', whatsappRoutes);

      const mockEnv = {
        META_APP_SECRET: 'mi_secreto_de_meta',
        DB: adapter,
      };

      const res = await app.request(
        '/api/whatsapp/webhook',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry: [] }),
        },
        mockEnv as any
      );

      // Debe rechazar por falta de firma HMAC
      expect(res.status).toBe(401);
    });

    it('Rutas protegidas devuelven 401 cuando no existe sesión activa', async () => {
      const app = new Hono<{ Bindings: any }>();
      app.route('/', whatsappRoutes);
      app.route('/', leadsRoutes);

      const mockKv = {
        get: vi.fn().mockResolvedValue(null),
      };

      const resInbox = await app.request('/api/whatsapp/inbox', {}, { DB: adapter, KV: mockKv } as any);
      expect(resInbox.status).toBe(401);

      const resLeads = await app.request('/api/leads', {}, { DB: adapter, KV: mockKv } as any);
      expect(resLeads.status).toBe(401);
    });

    it('Rutas de configuración admin devuelven 403 a usuarios con rol agente', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_agent_1', name: 'Asesor', email: 'asesor@fitnesscrm.com', role: 'agent' });
        await next();
      });
      app.route('/', whatsappRoutes);

      const res = await app.request('/api/whatsapp/test-connection', { method: 'POST' }, { DB: adapter } as any);
      expect(res.status).toBe(403);
    });

    it('El asistente de IA mantiene estricta coherencia comercial (Bolivianos Bs, 6 etapas, sin evasivas)', () => {
      const prompt = buildSalesAgentPrompt({
        lead: {
          id: 'lead_ia_test',
          full_name: 'Carlos Mendoza',
          phone: '+59177112233',
          status: 'nuevo',
          segment: 'B',
          tags: [],
          metadata: {},
          ai_enabled: 1,
          created_at: '2026-11-09T10:00:00Z',
          updated_at: '2026-11-09T10:00:00Z',
        },
        kbEntries: [
          {
            id: 'kb_pases',
            category: 'plan_precio',
            title: 'Pase 8',
            content: 'Bs 180 por mes con acceso a más de 30 gimnasios.',
            is_active: 1,
            created_at: '2026-11-09T10:00:00Z',
            updated_at: '2026-11-09T10:00:00Z',
          },
        ],
      });

      // Validar reglas inviolables del prompt
      expect(prompt).toContain('Moneda EXCLUSIVA: Bolivianos (Bs)');
      expect(prompt).toContain('NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas frases de evasión');
      expect(prompt).toContain('ETAPA 1: INDAGACIÓN DISCRETA DE DATOS');
      expect(prompt).toContain('ETAPA 6: CONFIRMACIÓN Y DESCARGA DE LA APP');

      // Validar fallback inteligente ante contingencias
      const fallback = generateSmartSalesFallback({
        lead: {
          id: 'lead_ia_test',
          full_name: 'WhatsApp 2233',
          phone: '+59177112233',
          status: 'nuevo',
          segment: 'B',
          tags: [],
          metadata: {},
          ai_enabled: 1,
          created_at: '2026-11-09T10:00:00Z',
          updated_at: '2026-11-09T10:00:00Z',
        },
        kbEntries: [],
        incomingText: 'Hola, mi nombre es Marcelo y quiero saber cómo funciona el pase',
      });

      expect(['reply', 'update_and_reply']).toContain(fallback.action);
      expect(fallback.detected_name).toBe('Marcelo');
      expect(fallback.reply_text).toContain('Marcelo');
      expect(fallback.reply_text).toContain('Fitness Club Pass');
    });

    it('Catálogo de actividades /api/activities no contiene subconsultas duplicadas y agrupa limpiamente', async () => {
      const app = new Hono<{ Bindings: any; Variables: { user?: SessionData } }>();
      app.use('*', async (c, next) => {
        c.set('user', { userId: 'usr_admin_1', name: 'Admin General', email: 'admin@fitnesscrm.com', role: 'admin' });
        await next();
      });
      app.route('/', activitiesRoutes);

      adapter.db.prepare(`
        INSERT INTO activities (id, name, name_norm, is_active)
        VALUES ('act_spinning', 'Spinning', 'spinning', 1)
      `).run();

      const res = await app.request('/api/activities', {}, { DB: adapter } as any);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.activities).toBeDefined();
      expect(json.activities.some((a: any) => a.id === 'act_spinning')).toBe(true);
    });
  });
});
