import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  buildAiMessages,
  parseAiOutput,
  ChatLeadContext,
  ChatHistoryItem,
  AiResponsePayload,
} from './prompt';
import { OFFICIAL_PLANS, KNOWLEDGE_SUMMARY } from './knowledge';

export interface Env {
  AI: any;
  PRIMARY_MODEL?: string;
  FALLBACK_MODEL?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS habilitado para comunicación entre microservicios y frontends
app.use('*', cors());

// Endpoint de bienvenida e información del servicio
app.get('/', (c) => {
  return c.json({
    service: 'fitness-ai-micro',
    status: 'online',
    description: 'Microservicio de IA para atención al cliente y ventas por WhatsApp en Fitness Club Pass Cochabamba',
    endpoints: {
      health: 'GET /health',
      chat: 'POST /chat',
    },
  });
});

// Endpoint de monitoreo y verificación de salud
app.get('/health', (c) => {
  const primaryModel = c.env.PRIMARY_MODEL || '@cf/zai-org/glm-4.7-flash';
  const fallbackModel = c.env.FALLBACK_MODEL || '@cf/meta/llama-3.2-3b-instruct';
  const hasAiBinding = Boolean(c.env.AI && typeof c.env.AI.run === 'function');

  return c.json({
    status: 'ok',
    service: 'fitness-ai-micro',
    timestamp: new Date().toISOString(),
    aiBindingAvailable: hasAiBinding,
    models: {
      primary: primaryModel,
      fallback: fallbackModel,
    },
    plans: OFFICIAL_PLANS,
  });
});

interface ChatRequestBody {
  lead?: ChatLeadContext;
  history?: ChatHistoryItem[];
  message: string;
}

// Endpoint principal de chat
app.post('/chat', async (c) => {
  let body: ChatRequestBody;
  try {
    body = await c.req.json();
  } catch (err) {
    return c.json({ error: 'JSON inválido en el cuerpo de la solicitud' }, 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return c.json({ error: 'El campo "message" es obligatorio y no puede estar vacío' }, 400);
  }

  const primaryModel = c.env.PRIMARY_MODEL || '@cf/zai-org/glm-4.7-flash';
  const fallbackModel = c.env.FALLBACK_MODEL || '@cf/meta/llama-3.2-3b-instruct';

  const messages = buildAiMessages({
    lead: body.lead,
    history: body.history,
    message,
  });

  let rawOutput = '';
  let modelUsed = '';

  // 1. Intento con el modelo primario usando Workers AI
  if (c.env.AI && typeof c.env.AI.run === 'function') {
    try {
      const res = await c.env.AI.run(primaryModel, {
        messages,
        temperature: 0.1,
        max_tokens: 300,
      });

      if (res && res.response) {
        rawOutput = res.response;
        modelUsed = primaryModel;
      }
    } catch (primaryErr) {
      console.warn(`[ai-micro] Error en modelo primario (${primaryModel}):`, primaryErr);

      // 2. Intento con el modelo secundario de respaldo
      try {
        const fallbackRes = await c.env.AI.run(fallbackModel, {
          messages,
          temperature: 0.1,
          max_tokens: 300,
        });

        if (fallbackRes && fallbackRes.response) {
          rawOutput = fallbackRes.response;
          modelUsed = fallbackModel;
        }
      } catch (fallbackErr) {
        console.error(`[ai-micro] Error en modelo fallback (${fallbackModel}):`, fallbackErr);
      }
    }
  }

  // 3. Procesamiento y respuesta
  let result: AiResponsePayload;

  if (rawOutput) {
    result = parseAiOutput(rawOutput);
  } else {
    // 4. Contingencia determinista de alta seguridad si Workers AI no respondió
    modelUsed = 'rule-based-fallback';
    const lower = message.toLowerCase();

    if (lower.includes('asesor') || lower.includes('humano') || lower.includes('persona') || lower.includes('queja') || lower.includes('reclamo')) {
      result = {
        reply: 'Con gusto te comunico ahora mismo con uno de nuestros asesores para que te atienda personalmente.',
        action: 'handoff',
        detectedName: body.lead?.name || null,
        detectedDisciplines: [],
      };
    } else if (lower.includes('precio') || lower.includes('cuanto') || lower.includes('costo') || lower.includes('plan')) {
      result = {
        reply: 'Nuestros planes mensuales en Cochabamba son: Básica Bs 290 (20 accesos), Pro Bs 420 (25 accesos) y Élite Bs 560 (30 accesos). ¿Qué disciplina o zona te gustaría probar primero?',
        action: 'reply',
        detectedName: body.lead?.name || null,
        detectedDisciplines: [],
      };
    } else if (lower.includes('donde') || lower.includes('sede') || lower.includes('ubicacion') || lower.includes('zona')) {
      result = {
        reply: 'Tenemos centros afiliados en Zona Norte, Cala Cala, Avenida América, Zona Central, La Recoleta y Sarco. ¿En cuál de estas zonas te queda más cómodo?',
        action: 'reply',
        detectedName: body.lead?.name || null,
        detectedDisciplines: [],
      };
    } else {
      result = {
        reply: '¡Hola! Con Fitness Club Pass tienes acceso a múltiples gimnasios y disciplinas en Cochabamba desde Bs 290 al mes. ¿Qué deporte o actividad te gustaría realizar?',
        action: 'reply',
        detectedName: body.lead?.name || null,
        detectedDisciplines: [],
      };
    }
  }

  return c.json({
    ...result,
    modelUsed,
  });
});

export default app;
