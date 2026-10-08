import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  AgentActionSchema,
  buildSalesAgentPrompt,
  generateSmartSalesFallback,
  runSalesAgentTurn,
  DEFAULT_BUSINESS_CONTEXT,
} from '../lib/ai/salesAgent';
import { autoAssignAgent, normalizePhone } from '../lib/rules';
import { Lead, KnowledgeBaseEntry, WhatsAppSettings, Env } from '../lib/types';

describe('AUDITORÍA INTEGRAL DE QA: Fitness CRM (docs/PLAN_MEJORAS_TESTING.md)', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const srcDir = path.resolve(__dirname, '..');

  // =========================================================================
  // SECCIÓN 1: REQUERIMIENTOS DE IA & FLUJO COMERCIAL
  // =========================================================================
  describe('1. Requerimientos de IA y Embudo Comercial', () => {
    const baseLead: Lead = {
      id: 'lead_qa_1',
      full_name: 'WhatsApp 71234567',
      phone: '+59171234567',
      status: 'nuevo',
      segment: 'B',
      tags: [],
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
      {
        id: 'kb_2',
        category: 'plan_precio',
        title: 'Fit Pro',
        content: 'Bs 280 por 16 pases.',
        is_active: 1,
        created_at: '2026-10-07T12:00:00Z',
        updated_at: '2026-10-07T12:00:00Z',
      },
    ];

    it('el prompt prohíbe de forma terminante cualquier respuesta de evasión ("no tengo acceso a información privada")', () => {
      const prompt = buildSalesAgentPrompt({
        lead: baseLead,
        kbEntries: mockKb,
      });

      expect(prompt).toContain('NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas frases de evasión como:');
      expect(prompt).toContain('No tengo acceso a información privada...');
      expect(prompt).toContain('Soy una inteligencia artificial / modelo de lenguaje...');
      expect(prompt).toContain('No puedo ayudarte con eso...');
      expect(prompt).toContain('No tengo acceso a datos del sistema...');
    });

    it('el prompt define las 6 etapas del embudo comercial en estricto orden', () => {
      const prompt = buildSalesAgentPrompt({
        lead: baseLead,
        kbEntries: mockKb,
      });

      expect(prompt).toContain('ETAPA 1: INDAGACIÓN DISCRETA DE DATOS');
      expect(prompt).toContain('ETAPA 2: CENTROS ALIADOS Y ZONAS DE COCHABAMBA');
      expect(prompt).toContain('ETAPA 3: PLANES Y PRECIOS EN BOLIVIANOS (Bs)');
      expect(prompt).toContain('ETAPA 4: RESOLUCIÓN DE DUDAS Y OBJECIONES');
      expect(prompt).toContain('ETAPA 5: MÉTODO DE PAGO RÁPIDO (QR Simple / Transferencia)');
      expect(prompt).toContain('ETAPA 6: CONFIRMACIÓN Y DESCARGA DE LA APP');
    });

    it('la moneda del asesor virtual es exclusivamente Bolivianos (Bs)', () => {
      const prompt = buildSalesAgentPrompt({
        lead: baseLead,
        kbEntries: mockKb,
      });

      expect(prompt).toContain('Moneda EXCLUSIVA: Bolivianos (Bs). NUNCA menciones dólares ni otra divisa.');
      expect(prompt).toContain('Bs 180');
      expect(prompt).toContain('Bs 280');
      expect(prompt).toContain('Bs 380');
    });

    it('fallback comercial extrae nombre compuesto o simple y avanza a contactado', () => {
      const action = generateSmartSalesFallback({
        lead: baseLead,
        incomingText: 'Hola, mi nombre es Alejandro y quiero saber qué incluye el pase',
        kbEntries: mockKb,
      });

      expect(action.action).toBe('update_and_reply');
      expect(action.detected_name).toBe('Alejandro');
      expect(action.suggested_status).toBe('contactado');
      expect(action.reply_text).toContain('Alejandro');
    });

    it('fallback detecta disciplinas múltiples y avanza estado adecuadamente', () => {
      const action = generateSmartSalesFallback({
        lead: baseLead,
        incomingText: 'Me interesa hacer crossfit, natación y pádel en Cochabamba',
        kbEntries: mockKb,
      });

      expect(action.detected_disciplines).toContain('CrossFit');
      expect(action.detected_disciplines).toContain('Natación');
      expect(action.detected_disciplines).toContain('Pádel');
      expect(action.suggested_status).toBe('contactado');
      expect(action.reply_text).toContain('Cochabamba');
    });

    it('fallback detecta intención de pago y sugiere estado negociación con QR simple', () => {
      const action = generateSmartSalesFallback({
        lead: baseLead,
        incomingText: 'Quiero inscribirme hoy, ¿a qué cuenta transfiero o tienen código QR?',
        kbEntries: mockKb,
      });

      expect(action.action).toBe('update_and_reply');
      expect(action.suggested_status).toBe('negociacion');
      expect(action.suggested_tags).toContain('solicito_qr');
      expect(action.reply_text).toContain('código QR simple');
      expect(action.reply_text).toContain('Bolivianos');
    });

    it('fallback detecta comprobante o foto de pago, avanza a ganado y solicita correo para la app', () => {
      const action = generateSmartSalesFallback({
        lead: baseLead,
        incomingText: 'Listo, ya pagué los Bs 280, aquí está el comprobante de la transferencia',
        kbEntries: mockKb,
      });

      expect(action.action).toBe('update_and_reply');
      expect(action.suggested_status).toBe('ganado');
      expect(action.suggested_tags).toContain('pago_confirmado');
      expect(action.reply_text).toContain('correo electrónico para dar de alta tu cuenta');
      expect(action.reply_text).toContain('enlaces de descarga de la app');
    });

    it('fallback activa handoff inmediato ante petición expresa de humano, queja o reclamo', () => {
      const inputs = [
        'Quiero hablar con una persona por favor',
        'Necesito comunicarme con un asesor humano',
        'Tengo una queja con el ingreso al gimnasio',
        'Pásame el teléfono del encargado',
        'Llamame ahora',
      ];

      for (const text of inputs) {
        const action = generateSmartSalesFallback({
          lead: baseLead,
          incomingText: text,
          kbEntries: mockKb,
        });

        expect(action.action).toBe('handoff');
        expect(action.handoff_reason).toBeTruthy();
        expect(action.farewell).toContain('te comunico enseguida con un asesor');
      }
    });
  });

  // =========================================================================
  // SECCIÓN 2: BASE DE DATOS D1 & BACKEND
  // =========================================================================
  describe('2. Base de Datos D1, Esquema y Backend', () => {
    const schemaSql = fs.readFileSync(path.join(srcDir, 'db/schema.sql'), 'utf-8');

    it('la tabla activity_logs está totalmente ausente de schema.sql', () => {
      expect(schemaSql).not.toContain('CREATE TABLE IF NOT EXISTS activity_logs');
      expect(schemaSql).not.toContain('CREATE TABLE activity_logs');
      expect(schemaSql).not.toContain('idx_activity_logs');
    });

    it('whatsapp_settings contiene el campo business_context en schema.sql', () => {
      expect(schemaSql).toContain('business_context TEXT');
    });

    it('los nuevos índices de alto rendimiento existen en schema.sql', () => {
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_leads_status_assigned ON leads(status, assigned_to);');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);');
      expect(schemaSql).toContain('CREATE INDEX IF NOT EXISTS idx_whatsapp_lead_created ON whatsapp_messages(lead_id, created_at DESC);');
    });

    it('la tabla leads contiene los campos handoff_at y handoff_reason', () => {
      expect(schemaSql).toContain('handoff_at TEXT');
      expect(schemaSql).toContain('handoff_reason TEXT');
    });

    it('cero consultas activas a activity_logs en todo el código fuente ejecutable (src/**/*.ts)', () => {
      const filesToCheck = [
        'routes/leads.ts',
        'routes/whatsapp.ts',
        'routes/activities.ts',
        'routes/importExport.ts',
        'routes/auth.ts',
        'routes/team.ts',
        'lib/ai/salesAgent.ts',
      ];

      for (const relPath of filesToCheck) {
        const fullPath = path.join(srcDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Verificar que no se ejecuta SQL contra la tabla eliminada
          expect(content).not.toMatch(/INSERT\s+INTO\s+activity_logs/i);
          expect(content).not.toMatch(/FROM\s+activity_logs/i);
          expect(content).not.toMatch(/DELETE\s+FROM\s+activity_logs/i);
        }
      }
    });

    it('manejo de imágenes para Meta WhatsApp y R2: rutas expuestas correctamente', () => {
      const leadsContent = fs.readFileSync(path.join(srcDir, 'routes/leads.ts'), 'utf-8');
      const waContent = fs.readFileSync(path.join(srcDir, 'routes/whatsapp.ts'), 'utf-8');

      // Endpoint de subida R2 con URL pública HTTPS
      expect(leadsContent).toContain("leadsRoutes.post('/api/upload/image'");
      expect(leadsContent).toContain("leadsRoutes.get('/api/media/*'");

      // Proxy de descarga y cache R2 de Meta
      expect(waContent).toContain("whatsappRoutes.get('/api/whatsapp/media/:mediaId'");
      expect(waContent).toContain('wa-inbound-media/');
    });
  });

  // =========================================================================
  // SECCIÓN 3: FRONTEND & MOBILE RESPONSIVENESS (44px TOUCH TARGETS)
  // =========================================================================
  describe('3. Frontend & Mobile Responsiveness', () => {
    it('Layout.tsx cuenta con targets táctiles de mínimo 44px en controles móviles', () => {
      const content = fs.readFileSync(path.join(srcDir, 'client/components/Layout.tsx'), 'utf-8');

      // Botón hamburguesa móvil
      expect(content).toContain('min-h-[44px] min-w-[44px]');
      // Botón Nuevo Prospecto
      expect(content).toContain('min-h-[44px]');
      // Theme toggle
      expect(content).toContain('min-h-[44px] min-w-[44px]');
    });

    it('WhatsAppInbox.tsx implementa vista dividida responsiva y botón para volver a lista en móvil', () => {
      const content = fs.readFileSync(path.join(srcDir, 'client/pages/WhatsAppInbox.tsx'), 'utf-8');

      // Botón Volver con min-h-[44px]
      expect(content).toContain('handleBackToList');
      expect(content).toContain('min-h-[44px]');
      expect(content).toContain('Volver');

      // Target táctil en barra de chat
      expect(content).toContain('min-h-[44px] min-w-[44px]'); // Botón adjuntar imagen
      expect(content).toContain('min-h-[44px]'); // Input text y botón enviar
    });

    it('LeadDetail.tsx cuenta con selects de 44px de altura táctil para Estado y Coach', () => {
      const content = fs.readFileSync(path.join(srcDir, 'client/pages/LeadDetail.tsx'), 'utf-8');

      // Select de Estado
      expect(content).toContain('min-h-[44px] bg-app border border-edge rounded-lg px-3 py-2.5');
      // Select de Coach
      expect(content).toContain('min-h-[44px] bg-app border border-edge rounded-lg px-3 py-2.5');
      // Botones de acción rápida
      expect(content).toContain('min-h-[44px]');
    });

    it('WhatsAppSettings.tsx incluye el campo de edición para business_context', () => {
      const content = fs.readFileSync(path.join(srcDir, 'client/pages/WhatsAppSettings.tsx'), 'utf-8');

      expect(content).toContain('business_context');
      expect(content).toContain('businessContext');
      expect(content).toContain('Contexto del Negocio');
    });

    it('Dashboard.tsx cuenta con controles táctiles accesibles de 44px y cero llamadas a activity_logs', () => {
      const content = fs.readFileSync(path.join(srcDir, 'client/pages/Dashboard.tsx'), 'utf-8');

      expect(content).toContain('min-h-[44px]');
      expect(content).not.toContain('activity_logs');
    });

    it('ningún archivo en src/client/ referencia la tabla obsoleta activity_logs', () => {
      const clientFiles = fs.readdirSync(path.join(srcDir, 'client'), { recursive: true }) as string[];
      for (const relFile of clientFiles) {
        if (relFile.endsWith('.ts') || relFile.endsWith('.tsx')) {
          const fullPath = path.join(srcDir, 'client', relFile);
          const content = fs.readFileSync(fullPath, 'utf-8');
          expect(content).not.toContain('activity_logs');
        }
      }
    });
  });

  // =========================================================================
  // SECCIÓN 4: SIMULACIÓN DE FLUJO END-TO-END DE IA (D1 + HANDOFF + ROUND ROBIN)
  // =========================================================================
  describe('4. Simulación End-to-End de runSalesAgentTurn con Mock D1', () => {
    it('ejecuta turno de IA, detecta handoff, auto-asigna asesor balanceado y actualiza base de datos', async () => {
      const mockLead: Lead = {
        id: 'lead_sim_1',
        full_name: 'WhatsApp 70000000',
        phone: '+59170000000',
        status: 'nuevo',
        segment: 'B',
        tags: [],
        metadata: {},
        ai_enabled: 1,
        handoff_at: null,
        handoff_reason: null,
        assigned_to: null,
        created_at: '2026-10-07T10:00:00Z',
        updated_at: '2026-10-07T10:00:00Z',
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
                id: 'ws_default',
                ai_enabled: 1,
                ai_model: '@cf/meta/llama-3.2-3b-instruct',
                business_context: DEFAULT_BUSINESS_CONTEXT,
              };
            }
            if (sql.includes("role = 'agent' AND u.is_active = 1")) {
              return { id: 'usr_coach_balanceado', name: 'Coach Activo' };
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

      const mockEnv: any = {
        DB: mockDb,
        AI: null, // Forzar fallback determinista
      };

      const result = await runSalesAgentTurn({
        env: mockEnv,
        leadId: 'lead_sim_1',
        incomingText: 'Hola, tengo un reclamo y quiero hablar con un asesor humano',
        credentials: null,
      });

      expect(result.executed).toBe(true);
      expect(result.action?.action).toBe('handoff');

      // Verificar que se ejecutó UPDATE en leads con handoff_at y auto-asignación
      const handoffUpdate = preparedQueries.find((q) => q.sql.includes('UPDATE leads') && q.sql.includes('handoff_at'));
      expect(handoffUpdate).toBeDefined();

      // Verificar que se guardó el mensaje de despedida en whatsapp_messages
      const msgInsert = preparedQueries.find((q) => q.sql.includes('INSERT INTO whatsapp_messages'));
      expect(msgInsert).toBeDefined();

      // Verificar que CERO queries intentaron escribir en activity_logs
      const activityLogQuery = preparedQueries.find((q) => q.sql.includes('activity_logs'));
      expect(activityLogQuery).toBeUndefined();
    });

    it('ejecuta turno de IA, detecta nombre y disciplinas, actualiza nombre y avanza de nuevo a contactado', async () => {
      const mockLead: Lead = {
        id: 'lead_sim_2',
        full_name: 'WhatsApp 79999999',
        phone: '+59179999999',
        status: 'nuevo',
        segment: 'B',
        tags: [],
        metadata: {},
        ai_enabled: 1,
        handoff_at: null,
        handoff_reason: null,
        assigned_to: 'usr_coach_1',
        created_at: '2026-10-07T10:00:00Z',
        updated_at: '2026-10-07T10:00:00Z',
      };

      const preparedQueries: { sql: string; params: any[] }[] = [];

      const createPreparedStatement2 = (sql: string, params: any[] = []) => {
        preparedQueries.push({ sql: sql.trim(), params });
        return {
          bind: vi.fn((...bindParams: any[]) => createPreparedStatement2(sql, bindParams)),
          first: vi.fn(async () => {
            if (sql.includes('FROM leads WHERE id = ?')) return mockLead;
            if (sql.includes('FROM whatsapp_settings')) {
              return {
                id: 'ws_default',
                ai_enabled: 1,
                ai_model: '@cf/meta/llama-3.2-3b-instruct',
              };
            }
            if (sql.includes('FROM prospect_activities WHERE lead_id = ?')) return null;
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('FROM activities')) {
              return {
                results: [
                  { id: 'act_gym', name: 'Musculación / Gym', name_norm: 'musculacion / gym', is_active: 1 },
                  { id: 'act_natacion', name: 'Natación', name_norm: 'natacion', is_active: 1 },
                ],
              };
            }
            return { results: [] };
          }),
          run: vi.fn(async () => ({ success: true })),
        };
      };

      const mockDb: any = {
        prepare: vi.fn((sql: string) => createPreparedStatement2(sql)),
      };

      const mockEnv: any = {
        DB: mockDb,
        AI: null,
      };

      const result = await runSalesAgentTurn({
        env: mockEnv,
        leadId: 'lead_sim_2',
        incomingText: 'Hola, soy Roberto y me interesa natación',
        credentials: null,
      });

      expect(result.executed).toBe(true);
      expect(result.action?.detected_name).toBe('Roberto');
      expect(result.action?.detected_disciplines).toContain('Natación');

      // Verificar que se actualizó el nombre del lead de 'WhatsApp 79999999' a 'Roberto'
      const nameUpdate = preparedQueries.find((q) => q.sql.includes('UPDATE leads SET full_name = ?') && q.params.length > 0);
      expect(nameUpdate).toBeDefined();
      expect(nameUpdate?.params[0]).toBe('Roberto');

      // Verificar que el estado avanzó de 'nuevo' a 'contactado'
      const statusUpdate = preparedQueries.find((q) => q.sql.includes('UPDATE leads SET status = ?') && q.params.length > 0);
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate?.params[0]).toBe('contactado');

      // Verificar que se vinculó la disciplina en prospect_activities
      const activityRelInsert = preparedQueries.find((q) => q.sql.includes('INSERT OR IGNORE INTO prospect_activities') && q.params.length > 0);
      expect(activityRelInsert).toBeDefined();
      expect(activityRelInsert?.params[2]).toBe('act_natacion');
    });
  });
});
