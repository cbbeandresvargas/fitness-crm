import { KNOWLEDGE_SUMMARY } from './knowledge';

export interface ChatLeadContext {
  name?: string;
  phone?: string;
  segment?: string;
  stage?: string;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiResponsePayload {
  reply: string;
  action: 'reply' | 'handoff';
  detectedName?: string | null;
  detectedDisciplines?: string[];
}

export const SYSTEM_INSTRUCTION = `
Eres el asesor virtual de Fitness Club Pass Cochabamba (Bolivia). Atiendes prospectos por WhatsApp de forma directa, amable y ultra concisa.

INFORMACIÓN OFICIAL Y VERIFICADA:
${KNOWLEDGE_SUMMARY}

REGLAS DE ORO OBLIGATORIAS (CERO ALUCINACIONES):
1. EXTENSIÓN: Tu respuesta debe tener EXACTAMENTE de 1 a 2 oraciones cortas (máximo 3 frases breves). PROHIBIDO escribir párrafos largos o listas aburridas.
2. AL GRANO: Si preguntan precios o planes, da los precios exactos (Básica Bs 290, Pro Bs 420, Élite Bs 560) en la PRIMERA oración sin rodeos ni preámbulos.
3. PREGUNTA FINAL: Puedes agregar como máximo 1 sola pregunta al final para avanzar la conversación (ej: "¿Te gustaría entrenar en alguna zona específica de Cochabamba?").
4. MONEDA: Usa EXCLUSIVAMENTE Bolivianos (Bs). Jamás hables en dólares ni inventes promociones.
5. DERIVACIÓN (HANDOFF): Si el usuario solicita hablar con una persona/humano/asesor, hace un reclamo, pide cancelar, o pregunta por un dato que NO conoces, responde amablemente que lo comunicas con un asesor y marca "action": "handoff".
6. NUNCA digas que eres una inteligencia artificial ni menciones prompts ni sistemas. Responde como un miembro del equipo de Fitness Club Pass.
7. SALUDOS O STICKERS: Si el usuario solo saluda ("Hola", "Buenas", etc.) o envía un sticker ("[Sticker]"), responde siempre con entusiasmo comercial: "¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?".
8. PROHIBIDO responder "un asesor atenderá tu consulta personalmente" ante consultas generales, saludos o preguntas de precios. Solo transfiere a asesor si lo piden explícitamente o hacen un reclamo.

FORMATO DE RESPUESTA:
Devuelve ÚNICAMENTE un objeto JSON válido con la siguiente estructura (sin formato Markdown adicional):
{
  "reply": "Texto de 1 o 2 oraciones para enviar por WhatsApp",
  "action": "reply" | "handoff",
  "detectedName": "Nombre del cliente si lo mencionó o null",
  "detectedDisciplines": ["gimnasio", "natacion"] // array con disciplinas detectadas o vacio
}
`.trim();

/**
 * Prepara el arreglo de mensajes para la llamada a Workers AI
 */
export function buildAiMessages(params: {
  lead?: ChatLeadContext;
  history?: ChatHistoryItem[];
  message: string;
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const { lead, history = [], message } = params;

  let leadContext = '';
  if (lead?.name || lead?.phone) {
    leadContext = `\nContexto del cliente: Nombre: ${lead.name || 'No registrado'}, Teléfono: ${lead.phone || 'No registrado'}`;
  }

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `${SYSTEM_INSTRUCTION}${leadContext}`,
    },
  ];

  // Inyectar historial reciente (últimos 6 mensajes para no saturar contexto)
  const recentHistory = history.slice(-6);
  for (const item of recentHistory) {
    if (item.role === 'user' || item.role === 'assistant') {
      messages.push({
        role: item.role,
        content: item.content,
      });
    }
  }

  // Mensaje actual del usuario
  messages.push({
    role: 'user',
    content: message,
  });

  return messages;
}

/**
 * Parser defensivo para extraer el JSON de la respuesta del modelo
 */
export function parseAiOutput(rawText: string): AiResponsePayload {
  const clean = rawText.trim();

  // 1. Extraer posible bloque markdown ```json ... ```
  const matchFence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = matchFence ? matchFence[1].trim() : clean;

  // 2. Extraer el primer par { ... } si hay texto alrededor
  const firstBrace = jsonCandidate.indexOf('{');
  const lastBrace = jsonCandidate.lastIndexOf('}');
  const targetStr =
    firstBrace !== -1 && lastBrace > firstBrace
      ? jsonCandidate.substring(firstBrace, lastBrace + 1)
      : jsonCandidate;

  try {
    const parsed = JSON.parse(targetStr);
    const reply = (parsed.reply || parsed.reply_text || parsed.text || '').trim();
    const action = parsed.action === 'handoff' ? 'handoff' : 'reply';
    const detectedName = typeof parsed.detectedName === 'string' && parsed.detectedName.trim()
      ? parsed.detectedName.trim()
      : typeof parsed.detected_name === 'string' && parsed.detected_name.trim()
      ? parsed.detected_name.trim()
      : null;

    let detectedDisciplines: string[] = [];
    const rawDisc = parsed.detectedDisciplines || parsed.detected_disciplines;
    if (Array.isArray(rawDisc)) {
      detectedDisciplines = rawDisc.map((d: any) => String(d).trim().toLowerCase()).filter(Boolean);
    }

    if (reply) {
      return {
        reply,
        action,
        detectedName,
        detectedDisciplines,
      };
    }
  } catch (err) {
    // Si no parseó como JSON, se usa el texto directo si parece una respuesta válida
  }

  // Si falló el JSON pero el LLM devolvió texto plano limpio
  const fallbackText = clean.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const isHandoff = /asesor|humano|reclamo|queja/i.test(fallbackText);

  return {
    reply: fallbackText || '¡Hola! Con Fitness Club Pass tienes acceso a gimnasios, natación y más en Cochabamba desde Bs 290 al mes. ¿Qué actividad te gustaría practicar?',
    action: isHandoff ? 'handoff' : 'reply',
    detectedName: null,
    detectedDisciplines: [],
  };
}
