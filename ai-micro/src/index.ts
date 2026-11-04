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

/**
 * Extracción universal y robusta de la respuesta devuelta por Cloudflare Workers AI.
 * Soporta formatos de texto directo, { response: string }, { result: { response: string } },
 * o formato compatible con chat completions { choices: [{ message: { content: string } }] }.
 */
function extractAiResponse(res: any): string {
  if (!res) return '';
  if (typeof res === 'string') return res.trim();
  if (typeof res.response === 'string') return res.response.trim();
  if (res.result && typeof res.result.response === 'string') return res.result.response.trim();
  if (typeof res.text === 'string') return res.text.trim();
  if (res.choices && Array.isArray(res.choices) && res.choices[0]?.message?.content) {
    return String(res.choices[0].message.content).trim();
  }
  return '';
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

  // Modelos a intentar en orden de prioridad y resiliencia en Workers AI
  const modelsToTry = Array.from(
    new Set([
      primaryModel,
      fallbackModel,
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/mistralai/mistral-small-3.1-24b-instruct',
    ])
  );

  // 1. Ejecución con Workers AI recorriendo modelos candidatos si hay fallo
  if (c.env.AI && typeof c.env.AI.run === 'function') {
    for (const model of modelsToTry) {
      try {
        const res = await c.env.AI.run(model, {
          messages,
          temperature: 0.1,
          max_tokens: 300,
        });

        const extracted = extractAiResponse(res);
        if (extracted) {
          rawOutput = extracted;
          modelUsed = model;
          break;
        } else {
          console.warn(`[ai-micro] Respuesta vacía de Workers AI con modelo ${model}:`, res);
        }
      } catch (primaryErr) {
        console.error(`[ai-micro] Error AI con modelo ${model}:`, primaryErr);
      }
    }
  }

  // 2. Procesamiento y respuesta
  let result: AiResponsePayload;

  if (rawOutput) {
    result = parseAiOutput(rawOutput);
  } else {
    // 3. Contingencia determinista de alta seguridad si Workers AI no respondió
    modelUsed = 'rule-based-fallback';
    const lower = message.toLowerCase().trim();
    const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Detección de disciplinas
    const detectedDisciplines: string[] = [];
    if (/gym|pesas|musculacion|fuerza|gimnasio/i.test(normalized)) detectedDisciplines.push('gimnasio');
    if (/natacion|pileta|piscina|nadar/i.test(normalized)) detectedDisciplines.push('natacion');
    if (/crossfit|box|funcional/i.test(normalized)) detectedDisciplines.push('crossfit');
    if (/padel|paddle/i.test(normalized)) detectedDisciplines.push('padel');
    if (/pilates/i.test(normalized)) detectedDisciplines.push('pilates');
    if (/yoga/i.test(normalized)) detectedDisciplines.push('yoga');

    // Detección de nombre del prospecto
    const nameMatch = message.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
    const detectedName = nameMatch ? nameMatch[1].trim() : (body.lead?.name || null);

    const isSticker = normalized === '[sticker]' || normalized.includes('[sticker]') || normalized === 'sticker';
    const isGreeting = /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal|saludos)[\s!.]*$/i.test(normalized);
    const wantsHuman = /asesor|humano|persona|agente|supervisor|queja|reclamo|denuncia|cancelar/i.test(normalized);
    const asksPrice = /precio|cuanto|costo|plan|tarifa|mensualidad|pagar|valor|promo/i.test(normalized);
    const asksLocation = /donde|sede|ubicacion|direccion|zona|cala cala|america|recoleta|sarco|centro/i.test(normalized);

    if (wantsHuman) {
      result = {
        reply: 'Con gusto te comunico ahora mismo con uno de nuestros asesores para que te atienda personalmente.',
        action: 'handoff',
        detectedName,
        detectedDisciplines,
      };
    } else if (isSticker || isGreeting) {
      result = {
        reply: '¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?',
        action: 'reply',
        detectedName,
        detectedDisciplines,
      };
    } else if (asksPrice) {
      result = {
        reply: 'Nuestros planes mensuales en Cochabamba son: Básica Bs 290 (20 accesos), Pro Bs 420 (25 accesos) y Élite Bs 560 (30 accesos). ¿Qué disciplina o zona te gustaría probar primero?',
        action: 'reply',
        detectedName,
        detectedDisciplines,
      };
    } else if (asksLocation) {
      result = {
        reply: 'Tenemos centros afiliados en Zona Norte, Cala Cala, Avenida América, Zona Central, La Recoleta y Sarco. ¿En cuál de estas zonas te queda más cómodo?',
        action: 'reply',
        detectedName,
        detectedDisciplines,
      };
    } else if (detectedDisciplines.length > 0) {
      result = {
        reply: `¡Excelente! Con Fitness Club Pass tienes acceso a ${detectedDisciplines.join(' y ')} en Cochabamba desde Bs 290 al mes. ¿En qué zona de la ciudad te gustaría entrenar?`,
        action: 'reply',
        detectedName,
        detectedDisciplines,
      };
    } else {
      result = {
        reply: '¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?',
        action: 'reply',
        detectedName,
        detectedDisciplines,
      };
    }
  }

  return c.json({
    ...result,
    modelUsed,
  });
});

export default app;
