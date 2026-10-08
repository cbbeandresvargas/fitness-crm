import { describe, it, expect } from 'vitest';
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
} from '../lib/ai/salesAgent';
import { Lead, KnowledgeBaseEntry, WhatsAppSettings } from '../lib/types';

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

      // 2. Moneda en Bolivianos
      expect(prompt).toContain('Bolivianos (Bs)');
      expect(prompt).toContain('Bs 180');
      expect(prompt).toContain('Bs 280');
      expect(prompt).toContain('Bs 380');

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
      expect(text).toContain('Fit Básico: Bs 180');
      expect(text).toContain('Fit Pro: Bs 280');
      expect(text).toContain('Black VIP: Bs 380');
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
  });
});
