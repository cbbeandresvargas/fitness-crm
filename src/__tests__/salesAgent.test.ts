import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  AgentActionSchema,
  getActionReplyText,
  getActionStatus,
  getActionNote,
  getActionHandoffReason,
  extractJson,
  buildSalesAgentPrompt,
  generateSmartSalesFallback,
  DEFAULT_BUSINESS_CONTEXT,
  normalizeAiModel,
  DEFAULT_AI_MODEL,
  SUPPORTED_AI_MODELS,
  callCloudflareWorkersAi,
  chatJson,
} from '../lib/ai/salesAgent';
import { Lead, KnowledgeBaseEntry, WhatsAppSettings, Env } from '../lib/types';

describe('FASE 1: IA Comercial Experta & Sales Agent', () => {
  describe('AgentActionSchema (Validación y Resiliencia Zod)', () => {
    it('valida acción rica con extracción de nombre, disciplinas, estado y tags', () => {
      const input = {
        action: 'update_and_reply',
        reply_text: '¡Hola Carlos! En Cochabamba tenemos acceso a Cala Cala y Zona Norte.',
        detected_name: 'Carlos',
        detected_disciplines: ['Natación', 'Musculación / Gym'],
        suggested_status: 'contactado',
        suggested_tags: ['interes_natacion', 'zona_cala_cala'],
        notes: 'Cliente prefiere entrenar en las mañanas',
      };

      const parsed = AgentActionSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.action).toBe('update_and_reply');
      expect(getActionReplyText(parsed.data)).toBe(
        '¡Hola Carlos! En Cochabamba tenemos acceso a Cala Cala y Zona Norte.'
      );
      expect(parsed.data.detected_name).toBe('Carlos');
      expect(parsed.data.detected_disciplines).toEqual(['Natación', 'Musculación / Gym']);
      expect(getActionStatus(parsed.data)).toBe('contactado');
      expect(parsed.data.suggested_tags).toEqual(['interes_natacion', 'zona_cala_cala']);
      expect(getActionNote(parsed.data)).toBe('Cliente prefiere entrenar en las mañanas');
    });

    it('soporta compatibilidad hacia atrás con text, stage y reason', () => {
      const input = {
        action: 'move_stage',
        stage: 'negociacion',
        text: 'Te facilito el QR simple en Bs.',
      };

      const parsed = AgentActionSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(getActionReplyText(parsed.data)).toBe('Te facilito el QR simple en Bs.');
      expect(getActionStatus(parsed.data)).toBe('negociacion');
    });

    it('convierte strings separados por coma en arrays para disciplinas y tags', () => {
      const input = {
        action: 'reply',
        reply_text: 'Claro que sí.',
        detected_disciplines: 'gym, natacion, crossfit',
        suggested_tags: 'interesado, primer_contacto',
      };

      const parsed = AgentActionSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.detected_disciplines).toEqual(['gym', 'natacion', 'crossfit']);
      expect(parsed.data.suggested_tags).toEqual(['interesado', 'primer_contacto']);
    });

    it('sanitiza URLs inválidas o vacías sin romper validación', () => {
      const input = {
        action: 'reply',
        reply_text: 'Hola',
        image_url: '',
      };

      const parsed = AgentActionSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.image_url).toBeUndefined();
    });

    it('valida handoff con reason y farewell', () => {
      const input = {
        action: 'handoff',
        handoff_reason: 'Cliente solicita hablar con una persona',
        farewell: 'Te comunico enseguida con un asesor comercial.',
      };

      const parsed = AgentActionSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;

      expect(parsed.data.action).toBe('handoff');
      expect(getActionHandoffReason(parsed.data)).toBe('Cliente solicita hablar con una persona');
      expect(getActionReplyText(parsed.data)).toBe('Te comunico enseguida con un asesor comercial.');
    });
  });

  describe('extractJson (Limpieza y extracción)', () => {
    it('extrae JSON dentro de bloques markdown ```json ... ```', () => {
      const raw = 'Aquí tienes la respuesta:\n```json\n{"action":"reply","reply_text":"Hola!"}\n```\nSaludos.';
      const result = extractJson(raw) as any;
      expect(result).not.toBeNull();
      expect(result.action).toBe('reply');
      expect(result.reply_text).toBe('Hola!');
    });

    it('repara y extrae JSON con comas sobrantes (trailing commas)', () => {
      const raw = '{"action": "reply", "reply_text": "Todo listo", "detected_disciplines": ["gym", "crossfit", ], }';
      const result = extractJson(raw) as any;
      expect(result).not.toBeNull();
      expect(result.action).toBe('reply');
      expect(result.detected_disciplines).toEqual(['gym', 'crossfit']);
    });
  });

  describe('buildSalesAgentPrompt (Embudo comercial y directivas)', () => {
    const mockLead: Lead = {
      id: 'lead_test_1',
      full_name: 'WhatsApp 71234567',
      phone: '+59171234567',
      status: 'nuevo',
      segment: 'B',
      tags: ['primer_contacto'],
      metadata: {},
      ai_enabled: 1,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
    };

    const mockKb: KnowledgeBaseEntry[] = [
      {
        id: 'kb_1',
        category: 'plan_precio',
        title: 'Fit Básico',
        content: 'Bs 180 por 8 pases mensuales.',
        is_active: 1,
        created_at: '2026-10-07T12:00:00Z',
        updated_at: '2026-10-07T12:00:00Z',
      },
    ];

    const mockSettings: WhatsAppSettings = {
      id: 'ws_default',
      ai_enabled: 1,
      ai_model: '@cf/meta/llama-3.2-3b-instruct',
      ai_tone: 'asesor consultivo y directo',
      ai_instructions: 'Priorizar gimnasios en Zona Norte y Cala Cala.',
      business_context: DEFAULT_BUSINESS_CONTEXT,
      status: 'connected',
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
    };

    it('construye el prompt con las 6 etapas del embudo comercial, contexto del negocio y reglas de oro', () => {
      const prompt = buildSalesAgentPrompt({
        lead: mockLead,
        kbEntries: mockKb,
        settings: mockSettings,
        registeredDisciplines: ['Musculación / Gym'],
      });

      // 1. Verificación de reglas estrictas contra evasión
      expect(prompt).toContain('NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas frases de evasión como:');
      expect(prompt).toContain('No tengo acceso a información privada...');

      // 2. Moneda en Bolivianos y precios confirmados (KB prioritario y planes base)
      expect(prompt).toContain('Bolivianos (Bs)');
      expect(prompt).toContain('Bs 180'); // Entrada de KB
      expect(prompt).toContain('Bs 290'); // Plan base de referencia
      expect(prompt).toContain('Bs 420'); // Plan base de referencia
      expect(prompt).toContain('Bs 560'); // Plan base de referencia

      // Regla de Ajustes y brevedad
      expect(prompt).toContain('FUENTE DE VERDAD Y PRIORIDAD ABSOLUTA (AJUSTES DEL ADMINISTRADOR)');
      expect(prompt).toContain('RESPUESTAS BREVES, DIRECTAS Y CERO RODEOS');

      // 3. Etapas del embudo
      expect(prompt).toContain('ETAPA 1: INDAGACIÓN DISCRETA DE DATOS');
      expect(prompt).toContain('ETAPA 2: CENTROS ALIADOS Y ZONAS DE COCHABAMBA');
      expect(prompt).toContain('ETAPA 3: PLANES Y PRECIOS EN BOLIVIANOS');
      expect(prompt).toContain('ETAPA 5: MÉTODO DE PAGO RÁPIDO (QR Simple / Transferencia)');
      expect(prompt).toContain('ETAPA 6: CONFIRMACIÓN Y DESCARGA DE LA APP');

      // 4. Datos del negocio y prospecto
      expect(prompt).toContain('Fitness Club Pass es la plataforma y app móvil');
      expect(prompt).toContain('WhatsApp 71234567');
      expect(prompt).toContain('Musculación / Gym');
      expect(prompt).toContain('Priorizar gimnasios en Zona Norte y Cala Cala');
    });
  });

  describe('generateSmartSalesFallback (Motor comercial de contingencia)', () => {
    const mockLead: Lead = {
      id: 'lead_fallback',
      full_name: 'WhatsApp 60750474',
      phone: '+59160750474',
      status: 'nuevo',
      segment: 'B',
      tags: [],
      metadata: {},
      ai_enabled: 1,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
    };

    it('dispara handoff si el usuario pide un asesor humano o queja', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: 'Hola, quiero hablar con un asesor humano por favor',
        kbEntries: [],
      });

      expect(action.action).toBe('handoff');
      expect(action.handoff_reason).toContain('atención humana directa');
      expect(getActionReplyText(action)).toContain('te comunico enseguida con un asesor');
    });

    it('extrae discretamente nombre y disciplinas al saludar', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: 'Hola, me llamo Mauricio y me interesa natación y gym',
        kbEntries: [],
      });

      expect(action.action).toBe('update_and_reply');
      expect(action.detected_name).toBe('Mauricio');
      expect(action.detected_disciplines).toContain('Natación');
      expect(action.detected_disciplines).toContain('Musculación / Gym');
      expect(getActionStatus(action)).toBe('contactado');
      expect(getActionReplyText(action)).toContain('Mauricio');
    });

    it('ofrece planes en Bolivianos (Bs) al preguntar precios', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: '¿Cuánto cuesta la membresía y qué planes tienen?',
        kbEntries: [],
      });

      expect(action.action).toBe('update_and_reply');
      expect(getActionStatus(action)).toBe('negociacion');
      const text = getActionReplyText(action);
      expect(text).toContain('Básica: Bs 290');
      expect(text).toContain('Pro: Bs 420');
      expect(text).toContain('Élite: Bs 560');
      expect(text).toContain('¿Qué actividades');
      expect(text).not.toContain('ilimitado');
    });

    it('ofrece QR de pago simple cuando el cliente quiere pagar', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: 'Quiero pagar por QR para empezar mañana',
        kbEntries: [],
      });

      expect(action.action).toBe('update_and_reply');
      expect(getActionStatus(action)).toBe('negociacion');
      expect(action.suggested_tags).toContain('solicito_qr');
      expect(getActionReplyText(action)).toContain('QR simple');
    });

    it('avanza a ganado y pide correo cuando el cliente envía comprobante', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: 'Ya pagué, aquí tengo el comprobante de la transferencia',
        kbEntries: [],
      });

      expect(action.action).toBe('update_and_reply');
      expect(getActionStatus(action)).toBe('ganado');
      expect(action.suggested_tags).toContain('pago_confirmado');
      expect(getActionReplyText(action)).toContain('correo electrónico para dar de alta tu cuenta');
    });

    it('explica centros aliados en Cochabamba al preguntar por gimnasios y sedes', () => {
      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: '¿En qué zonas de Cochabamba tienen gimnasios?',
        kbEntries: [],
      });

      expect(action.action).toBe('update_and_reply');
      expect(getActionStatus(action)).toBe('contactado');
      expect(getActionReplyText(action)).toContain('Cala Cala');
      expect(getActionReplyText(action)).toContain('Zona Central');
    });

    it('fallback utiliza precios dinámicos de kbEntries si están configurados en Ajustes', () => {
      const customKb: KnowledgeBaseEntry[] = [
        {
          id: 'kb_custom',
          category: 'plan_precio',
          title: 'Plan Anual Black',
          content: 'Bs 1500 por 12 meses ilimitados.',
          is_active: 1,
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
        },
      ];

      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: '¿Qué precios tienen?',
        kbEntries: customKb,
      });

      const reply = getActionReplyText(action);
      expect(reply).toContain('Plan Anual Black');
      expect(reply).toContain('Bs 1500');
    });

    it('fallback utiliza precios de settings.business_context si no hay en kbEntries', () => {
      const customSettings: WhatsAppSettings = {
        id: 'ws_custom',
        ai_enabled: 1,
        ai_model: '@cf/meta/llama-3.2-3b-instruct',
        business_context: `Nuevos planes:\n- Plan Semestral: Bs 800\n- Plan Trimestral: Bs 450`,
        status: 'connected',
        created_at: '2026-10-07T12:00:00Z',
        updated_at: '2026-10-07T12:00:00Z',
      };

      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: '¿Cuáles son las tarifas y precios actuales?',
        kbEntries: [],
        settings: customSettings,
      });

      const reply = getActionReplyText(action);
      expect(reply).toContain('Plan Semestral: Bs 800');
      expect(reply).toContain('Plan Trimestral: Bs 450');
    });

    it('fallback extrae precios de business_context incluso si las líneas no tienen viñetas ni guiones', () => {
      const settingsNoBullets: WhatsAppSettings = {
        id: 'ws_no_bullets',
        ai_enabled: 1,
        ai_model: '@cf/meta/llama-3.2-3b-instruct',
        business_context: `Planes y precios oficiales en Cochabamba:
Membresía Básico: Bs 150 mensual
Membresía Ilimitado: Bs 320 mensual`,
        status: 'connected',
        created_at: '2026-10-07T12:00:00Z',
        updated_at: '2026-10-07T12:00:00Z',
      };

      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: 'hola, qué valor tienen los pases?',
        kbEntries: [],
        settings: settingsNoBullets,
      });

      const reply = getActionReplyText(action);
      expect(reply).toContain('Bs 150');
      expect(reply).toContain('Bs 320');
      expect(reply).not.toContain('Bs 290');
    });

    it('fallback ignora entradas de KB inactivas (is_active === 0) y toma solo las activas', () => {
      const kbWithInactive: KnowledgeBaseEntry[] = [
        {
          id: 'kb_inactive',
          category: 'plan_precio',
          title: 'Plan Antiguo Desactivado',
          content: 'Bs 90 mensual',
          is_active: 0,
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
        },
        {
          id: 'kb_active',
          category: 'plan_precio',
          title: 'Plan Oro Vigente',
          content: '\n\nBs 380 mensual con natación incluida',
          is_active: 1,
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
        },
      ];

      const action = generateSmartSalesFallback({
        lead: mockLead,
        incomingText: '¿Tienen paquetes o descuentos?',
        kbEntries: kbWithInactive,
      });

      const reply = getActionReplyText(action);
      expect(reply).toContain('Plan Oro Vigente');
      expect(reply).toContain('Bs 380');
      expect(reply).not.toContain('Plan Antiguo Desactivado');
    });

    it('buildSalesAgentPrompt inyecta advertencia de prioridad obligatoria cuando hay precios configurados en Ajustes', () => {
      const customSettings: WhatsAppSettings = {
        id: 'ws_custom_prompt',
        ai_enabled: 1,
        ai_model: '@cf/meta/llama-3.2-3b-instruct',
        ai_tone: 'ultra directo y conciso',
        ai_instructions: 'Decir siempre el precio en la primera frase.',
        business_context: 'Plan Básico: Bs 190. Plan VIP: Bs 390.',
        status: 'connected',
        created_at: '2026-10-07T12:00:00Z',
        updated_at: '2026-10-07T12:00:00Z',
      };

      const prompt = buildSalesAgentPrompt({
        lead: mockLead,
        kbEntries: [],
        settings: customSettings,
      });

      expect(prompt).toContain('ATENCIÓN OBLIGATORIA: Se han configurado precios o planes específicos en Ajustes');
      expect(prompt).toContain('Plan Básico: Bs 190. Plan VIP: Bs 390.');
      expect(prompt).toContain('ultra directo y conciso');
      expect(prompt).toContain('Decir siempre el precio en la primera frase.');
      expect(prompt).toContain('MÁXIMA CONCISIÓN (1 A 3 FRASES CORTAS)');
      expect(prompt).toContain('CERO RODEOS');
    });
  });

  describe('normalizeAiModel y configuración de modelos de Workers AI', () => {
    it('retorna @cf/zai-org/glm-4.7-flash como modelo por defecto', () => {
      expect(DEFAULT_AI_MODEL).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel(null)).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel(undefined)).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel('')).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel('   ')).toBe('@cf/zai-org/glm-4.7-flash');
    });

    it('reemplaza modelos deprecados como llama-3.1-8b por el modelo recomendado', () => {
      expect(normalizeAiModel('@cf/meta/llama-3.1-8b-instruct')).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel('llama-3.1-8b')).toBe('@cf/zai-org/glm-4.7-flash');
    });

    it('normaliza nombres de modelos con y sin prefijo @cf/', () => {
      expect(normalizeAiModel('glm-4.7-flash')).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel('@cf/zai-org/glm-4.7-flash')).toBe('@cf/zai-org/glm-4.7-flash');
      expect(normalizeAiModel('mistral-small')).toBe('@cf/mistralai/mistral-small-3.1-24b-instruct');
      expect(normalizeAiModel('@cf/mistralai/mistral-small-3.1-24b-instruct')).toBe('@cf/mistralai/mistral-small-3.1-24b-instruct');
      expect(normalizeAiModel('llama-3.3-70b')).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      expect(normalizeAiModel('@cf/meta/llama-3.3-70b-instruct')).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      expect(normalizeAiModel('@cf/meta/llama-3.2-3b-instruct')).toBe('@cf/meta/llama-3.2-3b-instruct');
    });

    it('incluye todos los modelos recomendados en SUPPORTED_AI_MODELS', () => {
      expect(SUPPORTED_AI_MODELS).toContain('@cf/zai-org/glm-4.7-flash');
      expect(SUPPORTED_AI_MODELS).toContain('@cf/mistralai/mistral-small-3.1-24b-instruct');
      expect(SUPPORTED_AI_MODELS).toContain('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
      expect(SUPPORTED_AI_MODELS).toContain('@cf/meta/llama-3.2-3b-instruct');
      expect(SUPPORTED_AI_MODELS).toContain('@cf/meta/llama-3.2-1b-instruct');
    });
  });

  describe('Separación Categórica: DB vs Historial de Chat y Concisión Estricta', () => {
    const mockLead: Lead = {
      id: 'lead_prompt_audit',
      full_name: 'Ana Gómez',
      phone: '+59170011223',
      status: 'nuevo',
      segment: 'A',
      tags: [],
      metadata: {},
      ai_enabled: 1,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
    };

    it('prompt exige categóricamente extraer precios y reglas de DB y jamás del historial de chat', () => {
      const prompt = buildSalesAgentPrompt({
        lead: mockLead,
        kbEntries: [],
      });

      expect(prompt).toContain('SEPARACIÓN CATEGÓRICA: FUENTE DE VERDAD (DB) vs HISTORIAL DE CHAT');
      expect(prompt).toContain('ROL ESTRICTO DEL HISTORIAL DE MENSAJES (SÓLO ESTADO CONVERSACIONAL)');
      expect(prompt).toContain('Queda estrictamente PROHIBIDO extraer o asumir precios, descuentos, planes, promociones, reglas o datos del historial del chat');
      expect(prompt).toContain('La verdad objetiva proviene ÚNICAMENTE de la DB');
      expect(prompt).toContain('No dispongo de ese dato en este momento. ¿Deseas que te comunique con un asesor?');
      expect(prompt).toContain('ESTRICTAMENTE de 1 a 2 oraciones breves');
      expect(prompt).toContain('RESPUESTA INMEDIATA AL GRANO');
      expect(prompt).toContain('CERO RODEOS');
    });

    it('prompt omite advertencia obligatoria de reemplazo si sólo se usa el contexto base por defecto', () => {
      const prompt = buildSalesAgentPrompt({
        lead: mockLead,
        kbEntries: [],
        settings: {
          id: 'ws_default',
          ai_enabled: 1,
          ai_model: '@cf/zai-org/glm-4.7-flash',
          business_context: DEFAULT_BUSINESS_CONTEXT,
          status: 'connected',
          created_at: '2026-10-07T12:00:00Z',
          updated_at: '2026-10-07T12:00:00Z',
        },
      });

      expect(prompt).not.toContain('⚠️ ATENCIÓN OBLIGATORIA: Se han configurado precios o planes específicos en Ajustes');
    });

    it('prompt parsea correctamente metadata y tags en formatos JSON string y nativos', () => {
      const leadWithJson: Lead = {
        ...mockLead,
        metadata: JSON.stringify({ ciudad: 'Cochabamba', horario_preferido: 'tarde' }) as any,
        tags: JSON.stringify(['promo_verano', 'zona_recoleta']) as any,
      };

      const prompt = buildSalesAgentPrompt({
        lead: leadWithJson,
        kbEntries: [],
        registeredDisciplines: ['Pádel', 'Calistenia'],
      });

      expect(prompt).toContain('- ciudad: Cochabamba');
      expect(prompt).toContain('- horario_preferido: tarde');
      expect(prompt).toContain('promo_verano, zona_recoleta');
      expect(prompt).toContain('Pádel, Calistenia');
    });
  });

  describe.skip('Inferencia Cloudflare Workers AI (migrada al microservicio ai-micro)', () => {
    it('ejecuta env.AI.run con temperature: 0.1 por defecto y tokens acotados', async () => {
      const mockAiRun = vi.fn().mockResolvedValue({
        response: '{"action": "reply", "reply_text": "¡Hola! Membresía Pro a Bs 420."}',
      });

      const mockEnv: any = {
        AI: { run: mockAiRun },
      };

      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: 'Prompt del sistema' },
        { role: 'user', content: '¿Precios?' },
      ];

      const res = await callCloudflareWorkersAi(
        mockEnv,
        '@cf/zai-org/glm-4.7-flash',
        messages,
        300,
        0.1
      );

      expect(res).toBe('{"action": "reply", "reply_text": "¡Hola! Membresía Pro a Bs 420."}');
      expect(mockAiRun).toHaveBeenCalledTimes(1);
      expect(mockAiRun).toHaveBeenCalledWith(
        '@cf/zai-org/glm-4.7-flash',
        expect.objectContaining({
          messages,
          max_tokens: 300,
          temperature: 0.1,
        })
      );
    });

    it('reintenta automáticamente con el siguiente modelo de la cadena si el modelo principal falla', async () => {
      let runCount = 0;
      const mockAiRun = vi.fn().mockImplementation(async (model: string) => {
        runCount++;
        if (model === '@cf/meta/llama-3.2-3b-instruct') {
          throw new Error('Model temporarily rate-limited');
        }
        return { response: '{"action": "reply", "reply_text": "Respuesta desde fallback"}' };
      });

      const mockEnv: any = {
        AI: { run: mockAiRun },
      };

      const res = await callCloudflareWorkersAi(
        mockEnv,
        '@cf/meta/llama-3.2-3b-instruct',
        [{ role: 'user', content: 'Hola' }]
      );

      expect(res).toBe('{"action": "reply", "reply_text": "Respuesta desde fallback"}');
      expect(runCount).toBeGreaterThanOrEqual(2);
    });

    it('utiliza Cloudflare REST API de Workers AI si env.AI no está disponible y hay credenciales', async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          result: { response: '{"action": "reply", "reply_text": "Respuesta vía REST API"}' },
        }),
      });
      globalThis.fetch = mockFetch;

      try {
        const mockEnv: any = {
          AI: null,
          CLOUDFLARE_API_TOKEN: 'token_secreto_test',
          CLOUDFLARE_ACCOUNT_ID: 'acc_123456789',
        };

        const res = await callCloudflareWorkersAi(
          mockEnv,
          '@cf/zai-org/glm-4.7-flash',
          [{ role: 'user', content: 'Tarifas' }],
          250,
          0.1
        );

        expect(res).toBe('{"action": "reply", "reply_text": "Respuesta vía REST API"}');
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('https://api.cloudflare.com/client/v4/accounts/acc_123456789/ai/run/'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer token_secreto_test',
              'Content-Type': 'application/json',
            }),
            body: expect.stringContaining('"temperature":0.1'),
          })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('retorna null de forma segura si ni el binding ni la REST API responden', async () => {
      const mockEnv: any = {
        AI: {
          run: vi.fn().mockRejectedValue(new Error('AI cluster unavailable')),
        },
      };

      const res = await callCloudflareWorkersAi(mockEnv, '@cf/zai-org/glm-4.7-flash', [
        { role: 'user', content: 'Hola' },
      ]);

      expect(res).toBeNull();
    });

    it('chatJson ejecuta reintento estricto cuando el primer intento no es JSON válido', async () => {
      let callCount = 0;
      const mockAiRun = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Primer intento: texto plano con markdown defectuoso
          return { response: 'Hola estimado cliente, claro con gusto te paso los precios.' };
        }
        // Segundo intento: JSON corregido
        return {
          response: JSON.stringify({
            action: 'reply',
            reply_text: 'Nuestros planes son Básica Bs 290 y Pro Bs 420.',
          }),
        };
      });

      const mockEnv: any = { AI: { run: mockAiRun } };

      const result = await chatJson(
        AgentActionSchema,
        [{ role: 'user', content: 'Hola' }],
        mockEnv,
        '@cf/zai-org/glm-4.7-flash'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const actionData = result.data as any;
        expect(actionData.action).toBe('reply');
        expect(actionData.reply_text).toContain('Básica Bs 290');
      }
      expect(callCount).toBe(2);
    });
  });

  describe('Auditoría de Concisión y Formato en Respuestas de Contingencia', () => {
    const mockLeadUser: Lead = {
      id: 'lead_concise_test',
      full_name: 'Rodrigo Torrico',
      phone: '+59178945612',
      status: 'nuevo',
      segment: 'A',
      tags: [],
      metadata: {},
      ai_enabled: 1,
      created_at: '2026-10-07T12:00:00Z',
      updated_at: '2026-10-07T12:00:00Z',
    };

    it('personaliza el saludo usando el primer nombre si no es un placeholder del sistema', () => {
      const action = generateSmartSalesFallback({
        lead: mockLeadUser,
        incomingText: 'Buenas tardes',
        kbEntries: [],
      });

      const text = getActionReplyText(action);
      expect(text).toContain('Rodrigo');
      expect(text).not.toContain('WhatsApp');
    });

    it('utiliza saludo neutro si el nombre es un prefijo genérico como WhatsApp 71234567', () => {
      const genericLead: Lead = {
        ...mockLeadUser,
        full_name: 'WhatsApp 71234567',
      };

      const action = generateSmartSalesFallback({
        lead: genericLead,
        incomingText: 'Hola buenas',
        kbEntries: [],
      });

      const text = getActionReplyText(action);
      expect(text).toContain('¡Hola!');
      expect(text).not.toContain('WhatsApp');
    });

    it('las respuestas de precios son directas y no exceden 2 a 3 oraciones cortas', () => {
      const action = generateSmartSalesFallback({
        lead: mockLeadUser,
        incomingText: 'Precios por favor',
        kbEntries: [],
      });

      const text = getActionReplyText(action);
      // Contar oraciones aproximadamente por signos de puntuación (. ? !)
      const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(3);
      expect(text).toContain('Bs 290');
    });
  });
});
