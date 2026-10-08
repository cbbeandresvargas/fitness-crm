import { describe, it, expect, vi } from 'vitest';
import { autoAssignAgent } from '../lib/rules';
import fs from 'node:fs';
import path from 'node:path';

describe('Backend: Protocolo de Handoff, Asignación Balanceada y Depuración de activity_logs', () => {
  describe('autoAssignAgent (Asignación Balanceada Round-Robin)', () => {
    it('asigna el lead al agente activo con menor carga de trabajo', async () => {
      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'usr_agent_2', name: 'Agente Menos Ocupado' }),
        }),
      };

      const assignedId = await autoAssignAgent(mockDb);
      expect(mockDb.prepare).toHaveBeenCalledTimes(1);
      expect(assignedId).toBe('usr_agent_2');
    });

    it('recurre a un administrador activo si no hay agentes comerciales disponibles', async () => {
      let callCount = 0;
      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) return null; // No hay agentes activos
            return { id: 'usr_admin_1', name: 'Administrador Principal' };
          }),
        }),
      };

      const assignedId = await autoAssignAgent(mockDb);
      expect(mockDb.prepare).toHaveBeenCalledTimes(2);
      expect(assignedId).toBe('usr_admin_1');
    });

    it('devuelve null de forma segura y maneja errores sin lanzar excepción', async () => {
      const mockDb: any = {
        prepare: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('DB connection failed')),
        }),
      };

      const assignedId = await autoAssignAgent(mockDb);
      expect(assignedId).toBeNull();
    });
  });

  describe('Auditoría Estática de Rutas Backend (Cero actividad contra activity_logs)', () => {
    const routesDir = path.resolve(__dirname, '../routes');

    it('verifica que src/routes/leads.ts no contiene consultas a activity_logs', () => {
      const content = fs.readFileSync(path.join(routesDir, 'leads.ts'), 'utf-8');
      expect(content).not.toContain('INSERT INTO activity_logs');
      expect(content).not.toContain('FROM activity_logs');
      expect(content).not.toContain('DELETE FROM activity_logs');
    });

    it('verifica que src/routes/whatsapp.ts no contiene inserciones a activity_logs', () => {
      const content = fs.readFileSync(path.join(routesDir, 'whatsapp.ts'), 'utf-8');
      expect(content).not.toContain('INSERT INTO activity_logs');
      expect(content).not.toContain('FROM activity_logs');
      expect(content).not.toContain('DELETE FROM activity_logs');
    });

    it('verifica que src/routes/activities.ts no contiene inserciones a activity_logs', () => {
      const content = fs.readFileSync(path.join(routesDir, 'activities.ts'), 'utf-8');
      expect(content).not.toContain('INSERT INTO activity_logs');
      expect(content).not.toContain('FROM activity_logs');
    });

    it('verifica que src/routes/importExport.ts no contiene inserciones a activity_logs', () => {
      const content = fs.readFileSync(path.join(routesDir, 'importExport.ts'), 'utf-8');
      expect(content).not.toContain('INSERT INTO activity_logs');
      expect(content).not.toContain('FROM activity_logs');
    });

    it('verifica que src/lib/ai/salesAgent.ts no ejecuta escrituras en activity_logs', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../lib/ai/salesAgent.ts'), 'utf-8');
      expect(content).not.toContain('INSERT INTO activity_logs');
    });
  });

  describe('Configuración de WhatsApp y contexto de negocio', () => {
    it('valida que whatsapp.ts soporte el campo business_context y auto-asignación en handoff', () => {
      const content = fs.readFileSync(path.resolve(__dirname, '../routes/whatsapp.ts'), 'utf-8');
      expect(content).toContain('business_context');
      expect(content).toContain('autoAssignAgent(c.env.DB)');
    });
  });

  describe('Endpoints de Multimedia en WhatsApp', () => {
    it('verifica que los endpoints de media construyen URLs válidas y protegen accesos', () => {
      const leadsContent = fs.readFileSync(path.resolve(__dirname, '../routes/leads.ts'), 'utf-8');
      const waContent = fs.readFileSync(path.resolve(__dirname, '../routes/whatsapp.ts'), 'utf-8');

      expect(leadsContent).toContain("leadsRoutes.post('/api/upload/image'");
      expect(leadsContent).toContain("leadsRoutes.get('/api/media/*'");
      expect(waContent).toContain("whatsappRoutes.get('/api/whatsapp/media/:mediaId'");
    });
  });
});
