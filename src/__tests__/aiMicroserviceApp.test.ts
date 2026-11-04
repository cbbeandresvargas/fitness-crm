import { describe, it, expect, vi } from 'vitest';
import app from '../../ai-micro/src/index';

describe('Microservicio de IA (fitness-ai-micro)', () => {
  it('GET /health devuelve estado ok, modelos configurados y planes oficiales', async () => {
    const res = await app.request('/health', { method: 'GET' }, {
      AI: { run: vi.fn() },
      PRIMARY_MODEL: '@cf/zai-org/glm-4.7-flash',
      FALLBACK_MODEL: '@cf/meta/llama-3.2-3b-instruct',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
    expect(data.service).toBe('fitness-ai-micro');
    expect(data.aiBindingAvailable).toBe(true);
    expect(data.models.primary).toBe('@cf/zai-org/glm-4.7-flash');
    expect(data.models.fallback).toBe('@cf/meta/llama-3.2-3b-instruct');
  });

  describe('Extracción universal de respuestas Workers AI en POST /chat', () => {
    it('extrae respuesta cuando Workers AI devuelve objeto estándar { response: "..." }', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        response: JSON.stringify({
          reply: 'El plan Pro cuesta Bs 420 al mes con 25 accesos.',
          action: 'reply',
          detectedName: 'Carlos',
          detectedDisciplines: ['gimnasio'],
        }),
      });

      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hola, soy Carlos, ¿cuánto cuesta el plan Pro?',
        }),
      }, {
        AI: { run: mockRun },
        PRIMARY_MODEL: '@cf/zai-org/glm-4.7-flash',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe('El plan Pro cuesta Bs 420 al mes con 25 accesos.');
      expect(data.detectedName).toBe('Carlos');
      expect(data.modelUsed).toBe('@cf/zai-org/glm-4.7-flash');
    });

    it('extrae respuesta cuando Workers AI devuelve objeto anidado { result: { response: "..." } }', async () => {
      const mockRun = vi.fn().mockResolvedValue({
        result: {
          response: JSON.stringify({
            reply: '¡Claro! Tenemos piscina en Zona Norte y Cala Cala.',
            action: 'reply',
          }),
        },
      });

      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '¿Tienen natación?',
        }),
      }, {
        AI: { run: mockRun },
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe('¡Claro! Tenemos piscina en Zona Norte y Cala Cala.');
    });

    it('extrae respuesta cuando Workers AI devuelve texto string directo', async () => {
      const mockRun = vi.fn().mockResolvedValue(
        JSON.stringify({
          reply: 'El pase Élite cuesta Bs 560 por mes.',
          action: 'reply',
        })
      );

      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Precio del pase élite',
        }),
      }, {
        AI: { run: mockRun },
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe('El pase Élite cuesta Bs 560 por mes.');
    });
  });

  describe('Cascada de modelos ante fallas de Workers AI', () => {
    it('intenta con el modelo secundario si el modelo primario lanza un error', async () => {
      const mockRun = vi.fn().mockImplementation(async (model: string) => {
        if (model === '@cf/zai-org/glm-4.7-flash') {
          throw new Error('500 Internal Model Error');
        }
        return {
          response: JSON.stringify({
            reply: 'Respuesta generada por LLaMA 3.2',
            action: 'reply',
          }),
        };
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hola, información por favor',
        }),
      }, {
        AI: { run: mockRun },
        PRIMARY_MODEL: '@cf/zai-org/glm-4.7-flash',
        FALLBACK_MODEL: '@cf/meta/llama-3.2-3b-instruct',
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe('Respuesta generada por LLaMA 3.2');
      expect(data.modelUsed).toBe('@cf/meta/llama-3.2-3b-instruct');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ai-micro] Error AI con modelo @cf/zai-org/glm-4.7-flash:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Fallback determinista inteligente cuando Workers AI no está disponible', () => {
    it('responde saludo comercial alegre cuando el mensaje es "Hola"', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hola',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe(
        '¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?'
      );
      expect(data.action).toBe('reply');
      expect(data.modelUsed).toBe('rule-based-fallback');
    });

    it('responde saludo comercial alegre cuando el mensaje es "[Sticker]"', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '[Sticker]',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toBe(
        '¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?'
      );
      expect(data.action).toBe('reply');
    });

    it('responde con los precios oficiales exactos en Bolivianos', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '¿Cuánto cuesta el plan mensual y qué planes tienen?',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toContain('Básica Bs 290');
      expect(data.reply).toContain('Pro Bs 420');
      expect(data.reply).toContain('Élite Bs 560');
      expect(data.action).toBe('reply');
    });

    it('responde con las sedes y zonas disponibles en Cochabamba', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '¿Dónde quedan ubicados sus gimnasios?',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.reply).toContain('Zona Norte');
      expect(data.reply).toContain('Cala Cala');
      expect(data.reply).toContain('Avenida América');
      expect(data.action).toBe('reply');
    });

    it('responde con disciplinas específicas detectadas', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Me interesa hacer natación y pádel',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.detectedDisciplines).toContain('natacion');
      expect(data.detectedDisciplines).toContain('padel');
      expect(data.reply).toContain('Bs 290 al mes');
      expect(data.action).toBe('reply');
    });

    it('activa handoff humano únicamente cuando el prospecto lo solicita expresamente o hay reclamo', async () => {
      const res = await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Necesito hablar con un asesor o una persona humana, tengo un reclamo',
        }),
      }, {
        AI: null,
      });

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.action).toBe('handoff');
      expect(data.reply).toContain('asesores para que te atienda personalmente');
    });
  });
});
