import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSalesAgentTurn } from '../lib/ai/salesAgent';
import { Lead, Env } from '../lib/types';
import { DEFAULT_BUSINESS_CONTEXT } from '../lib/ai/salesAgentPrompt';

describe('Integración con Microservicio Autónomo de IA (ai-micro)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createMockEnv(overrides: Partial<Env> = {}) {
    const mockLead: Lead = {
      id: 'lead_micro_1',
      full_name: 'WhatsApp 70712345',
      phone: '+59170712345',
      status: 'nuevo',
      segment: 'B',
      tags: [],
      metadata: {},
      ai_enabled: 1,
      handoff_at: null,
      handoff_reason: null,
      assigned_to: null,
      created_at: '2026-11-04T10:00:00Z',
      updated_at: '2026-11-04T10:00:00Z',
    };

    const preparedQueries: { sql: string; params: any[] }[] = [];

    const createPreparedStatement = (sql: string, params: any[] = []) => {
      preparedQueries.push({ sql: sql.trim(), params });
      return {
        bind: vi.fn((...bindParams: any[]) => createPreparedStatement(sql, bindParams)),
        first: vi.fn(async () => {
          if (sql.includes('FROM leads WHERE id = ?')) return mockLead;
          if (sql.includes('FROM whatsapp_settings')) {
            return {
              id: 'ws_test',
              ai_enabled: 1,
              ai_model: '@cf/zai-org/glm-4.7-flash',
              business_context: DEFAULT_BUSINESS_CONTEXT,
            };
          }
          if (sql.includes("role = 'agent' AND u.is_active = 1")) {
            return { id: 'usr_coach_1', name: 'Coach Turno' };
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM knowledge_base')) return { results: [] };
          if (sql.includes('FROM prospect_activities')) return { results: [] };
          if (sql.includes('FROM whatsapp_messages')) return { results: [] };
          return { results: [] };
        }),
        run: vi.fn(async () => ({ success: true })),
      };
    };

    const mockDb: any = {
      prepare: vi.fn((sql: string) => createPreparedStatement(sql)),
    };

    const env: Env = {
      DB: mockDb,
      KV: {} as any,
      STORAGE: {} as any,
      AI_MICROSERVICE_URL: 'http://127.0.0.1:8788',
      AI: {
        run: vi.fn().mockResolvedValue({ response: '{"action":"reply","reply_text":"Workers AI"}' }),
      },
      ...overrides,
    };

    return { env, mockLead, preparedQueries };
  }

  it('llama prioritariamente al microservicio POST /chat y omite la inferencia local de Workers AI', async () => {
    const { env, preparedQueries } = createMockEnv();

    let capturedUrl = '';
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reply: 'Nuestros planes en Cochabamba son Básica Bs 290, Pro Bs 420 y Élite Bs 560.',
          action: 'reply',
          detectedName: 'Marco Antonio',
          detectedDisciplines: ['Pádel', 'Crossfit'],
        }),
      } as Response;
    });

    const result = await runSalesAgentTurn({
      env,
      leadId: 'lead_micro_1',
      incomingText: 'Hola, me llamo Marco Antonio y me interesa pádel y crossfit',
    });

    expect(result.executed).toBe(true);
    expect(capturedUrl).toBe('http://127.0.0.1:8788/chat');
    expect(capturedBody).toEqual(
      expect.objectContaining({
        lead: {
          id: 'lead_micro_1',
          name: 'WhatsApp 70712345',
          phone: '+59170712345',
          status: 'nuevo',
        },
        message: 'Hola, me llamo Marco Antonio y me interesa pádel y crossfit',
      })
    );

    // Verificamos que se asignó la respuesta y se extrajeron las entidades
    expect(result.action?.reply_text).toBe(
      'Nuestros planes en Cochabamba son Básica Bs 290, Pro Bs 420 y Élite Bs 560.'
    );
    expect(result.action?.detected_name).toBe('Marco Antonio');
    expect(result.action?.detected_disciplines).toEqual(['Pádel', 'Crossfit']);
    expect(result.action?.suggested_status).toBe('contactado');

    // La inferencia local de Workers AI NO debió ser ejecutada
    expect(env.AI.run).not.toHaveBeenCalled();

    // Verificamos persistencia de nombre actualizado en D1
    const nameUpdate = preparedQueries.find(
      (q) => q.sql.includes('UPDATE leads SET full_name = ?') && q.params.length > 0
    );
    expect(nameUpdate).toBeDefined();
    expect(nameUpdate?.params[0]).toBe('Marco Antonio');
  });

  it('procesa correctamente una acción "handoff" devuelta por el microservicio', async () => {
    const { env, preparedQueries } = createMockEnv();

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reply: 'Te comunico enseguida con uno de nuestros asesores para coordinar tu caso.',
          action: 'handoff',
          detectedName: null,
          detectedDisciplines: [],
        }),
      } as Response;
    });

    const result = await runSalesAgentTurn({
      env,
      leadId: 'lead_micro_1',
      incomingText: 'Quiero hacer un reclamo con un supervisor',
    });

    expect(result.executed).toBe(true);
    expect(result.action?.action).toBe('handoff');
    expect(result.action?.handoff_reason).toBe('Solicitud detectada por microservicio de IA');

    // Se debe haber actualizado handoff_at en leads
    const handoffUpdate = preparedQueries.find(
      (q) => q.sql.includes('UPDATE leads') && q.sql.includes('handoff_at')
    );
    expect(handoffUpdate).toBeDefined();

    // El Workers AI local no debió llamarse
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('utiliza respuesta directa simple de contingencia si el microservicio retorna HTTP 500', async () => {
    const { env } = createMockEnv();

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Cluster error' }),
      } as Response;
    });

    const result = await runSalesAgentTurn({
      env,
      leadId: 'lead_micro_1',
      incomingText: 'Hola, ¿qué planes tienen?',
    });

    expect(result.executed).toBe(true);
    // Workers AI local ya no se llama en el proyecto principal
    expect(env.AI.run).not.toHaveBeenCalled();
    expect(result.action?.reply_text).toBe(
      'Hola, en este momento un asesor atenderá tu consulta personalmente.'
    );
  });

  it('utiliza respuesta directa simple de contingencia si el microservicio falla por error de red', async () => {
    const { env } = createMockEnv({ AI: null });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:8788'));

    const result = await runSalesAgentTurn({
      env,
      leadId: 'lead_micro_1',
      incomingText: 'Hola, información sobre precios',
    });

    expect(result.executed).toBe(true);
    expect(result.action?.reply_text).toBe(
      'Hola, en este momento un asesor atenderá tu consulta personalmente.'
    );
  });

  it('normaliza la URL del microservicio eliminando slashes finales duplicados', async () => {
    const { env } = createMockEnv({ AI_MICROSERVICE_URL: 'http://127.0.0.1:8788///' });

    let calledUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reply: 'Hola!',
          action: 'reply',
        }),
      } as Response;
    });

    await runSalesAgentTurn({
      env,
      leadId: 'lead_micro_1',
      incomingText: 'Hola',
    });

    expect(calledUrl).toBe('http://127.0.0.1:8788/chat');
  });
});
