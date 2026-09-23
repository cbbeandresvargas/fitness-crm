import { Lead, ActivityLog, Env } from './types';
import { normalizePhone } from './rules';

/**
 * Reemplaza variables / placeholders como {nombre}, {producto}, {ciudad}, {agente} en una plantilla
 */
export function renderTemplate(
  templateContent: string,
  variables: Record<string, string>
): string {
  let result = templateContent;
  for (const [key, val] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, val || '');
  }
  return result;
}

/**
 * Genera el enlace directo (deep link) para WhatsApp Web / Móvil
 */
export function createWhatsAppDeepLink(phone: string, text: string): string {
  const normalized = normalizePhone(phone);
  const cleanNumber = normalized.replace(/^\+/, '');
  const encodedText = encodeURIComponent(text.trim());
  return `https://wa.me/${cleanNumber}?text=${encodedText}`;
}

/**
 * Ejecutor universal de Cloudflare Workers AI
 * Soporta binding nativo env.AI.run() y llamada directa a Cloudflare Workers AI REST API
 */
async function callCloudflareWorkersAi(
  env: Env,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens: number = 400
): Promise<string | null> {
  // 1. Intento vía binding nativo env.AI de Cloudflare Workers
  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const res = await env.AI.run(model, {
        messages,
        max_tokens: maxTokens,
      });
      if (res && res.response) {
        return res.response.trim();
      }
    } catch (err) {
      console.warn(`[Cloudflare Workers AI Binding] Error ejecutando ${model}:`, err);
    }
  }

  // 2. Intento vía Cloudflare Workers AI REST API si se configuraron credenciales
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (token && accountId) {
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          max_tokens: maxTokens,
        }),
      });

      const data: any = await response.json();
      if (data && data.success && data.result && data.result.response) {
        return data.result.response.trim();
      }
    } catch (err) {
      console.warn(`[Cloudflare Workers AI REST API] Error llamando a ${model}:`, err);
    }
  }

  return null;
}

/**
 * Construye el prompt con contexto enriquecido del lead para el modelo de IA
 */
export function buildLeadContextPrompt(options: {
  lead: Lead;
  agentName: string;
  recentActivities: ActivityLog[];
  tone?: string;
  goal?: string;
}): { systemPrompt: string; userPrompt: string } {
  const { lead, agentName, recentActivities, tone = 'motivador y persuasivo', goal = 'agendar cita o cerrar membresía' } = options;

  const notes = recentActivities
    .slice(0, 5)
    .map((act) => `- [${act.action_type}] ${act.details}`)
    .join('\n');

  const metadataStr = Object.entries(lead.metadata || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const systemPrompt = `Eres el asistente de ventas de élite con inteligencia artificial de "IronPeak Fitness", un centro de entrenamiento de alto rendimiento.
Tu función es generar mensajes de WhatsApp personalizados, altamente persuasivos y empáticos para prospectos deportivos.
Reglas:
1. Sé conciso y directo (máximo 4 párrafos cortos).
2. Usa emojis fitness con balance (💪, 🏋️, 🚀, ⏱️).
3. Incluye siempre una llamada a la acción (CTA) fácil de responder.
4. Habla con cercanía y calidez humana.
5. Inyecta con precisión el objetivo deportivo, sede y notas del prospecto.`;

  const userPrompt = `Prospecto:
- Nombre: ${lead.full_name}
- Segmento: ${lead.segment}
- Estado del Pipeline: ${lead.status}
- Tags / Intereses: ${lead.tags?.join(', ') || 'Ninguno'}
- Agente comercial: ${agentName}

Metadatos fitness:
${metadataStr || '- Sin metadatos registrados'}

Bitácora de interacciones previas:
${notes || '- Sin interacciones registradas'}

Instrucción comercial:
- Tono: ${tone}
- Objetivo: ${goal}

Devuelve exclusivamente el texto final para WhatsApp listo para enviar, sin comillas externas ni etiquetas.`;

  return { systemPrompt, userPrompt };
}

/**
 * Generador de Mensajes de WhatsApp usando Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
 */
export async function generateAiWhatsAppMessage(
  env: Env,
  promptData: { systemPrompt: string; userPrompt: string },
  lead: Lead,
  agentName: string
): Promise<string> {
  const { systemPrompt, userPrompt } = promptData;

  // Ejecución en Cloudflare Workers AI
  const aiOutput = await callCloudflareWorkersAi(
    env,
    '@cf/meta/llama-3.1-8b-instruct',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    350
  );

  if (aiOutput) {
    return aiOutput;
  }

  // Fallback enriquecido cuando no hay GPU o conexión activa
  const meta = lead.metadata || {};
  const objetivo = meta.objetivo || 'alcanzar tu mejor nivel físico';
  const producto = meta.producto || 'nuestros programas de acondicionamiento';
  const ciudad = meta.ciudad || meta.sede || 'nuestro gimnasio';
  const nombre = lead.full_name.split(' ')[0];

  if (lead.segment === 'A') {
    return `¡Hola ${nombre}! 💪 Te escribe ${agentName} de IronPeak Fitness. Estuve revisando tu perfil enfocado en ${objetivo} y aparté una sesión de valoración personalizada con nuestro head coach en ${ciudad}. ¿Te queda bien pasar hoy por la tarde o prefieres agendar para mañana temprano? 🚀`;
  } else if (lead.segment === 'C') {
    return `Hola ${nombre}, ¿cómo estás? Te saluda ${agentName} de IronPeak. Sé que los horarios a veces se complican, pero no quería que te quedaras sin conocer nuestras opciones para ${objetivo}. Esta semana tenemos un pase de cortesía en ${ciudad}. ¿Aún estás interesado en retomar tu meta este mes? 🏋️`;
  } else {
    return `¡Hola ${nombre}! Te saluda ${agentName} de IronPeak Fitness. Vi que tienes interés en ${producto}. Me encantaría mostrarte las instalaciones en ${ciudad} y armarte un plan a tu medida para ${objetivo}. ¿Qué horario te queda más cómodo para platicar un par de minutos?`;
  }
}

/**
 * Resumen Ejecutivo y Diagnóstico del Prospecto con Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
 */
export async function generateAiLeadBriefing(
  env: Env,
  lead: Lead,
  activities: ActivityLog[]
): Promise<string> {
  const metaStr = JSON.stringify(lead.metadata || {});
  const notesStr = activities.slice(0, 6).map((a) => a.details).join(' | ');

  const systemPrompt = `Eres un estratega comercial senior de IronPeak Fitness. Resume el perfil del prospecto en exactamente 2 oraciones concisas para el asesor de ventas: 1) Quién es y qué busca, 2) Siguiente paso sugerido y nivel de urgencia.`;
  const userPrompt = `Prospecto: ${lead.full_name}, Estado: ${lead.status}, Segmento: ${lead.segment}. Metadatos: ${metaStr}. Historial notas: ${notesStr || 'Sin historial'}.`;

  const aiOutput = await callCloudflareWorkersAi(
    env,
    '@cf/meta/llama-3.1-8b-instruct',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    180
  );

  if (aiOutput) {
    return aiOutput;
  }

  // Fallback
  const meta = lead.metadata || {};
  return `${lead.full_name} se encuentra en etapa ${lead.status.toUpperCase()} buscando ${meta.objetivo || 'entrenamiento'} con presupuesto aproximado de $${meta.presupuesto || '100'} USD. Se recomienda coordinar visita presencial o clase de prueba inmediata en sede ${meta.sede || 'principal'}.`;
}

/**
 * Sugerencia Inteligente de Tags con Cloudflare Workers AI
 */
export async function suggestAiTags(env: Env, lead: Lead): Promise<string[]> {
  const metaStr = JSON.stringify(lead.metadata || {});
  const systemPrompt = `Eres un clasificador de prospectos fitness. Responde ÚNICAMENTE con una lista separada por comas de 3 a 5 tags cortos representativos (ej: CrossFit, VIP, Nutrición, Cierre Rápido, Hipertrofia, Rehabilitación).`;
  const userPrompt = `Nombre: ${lead.full_name}, Objetivo: ${metaStr}, Segmento: ${lead.segment}, Status: ${lead.status}`;

  const aiOutput = await callCloudflareWorkersAi(
    env,
    '@cf/meta/llama-3.1-8b-instruct',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    80
  );

  if (aiOutput) {
    return aiOutput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0 && t.length < 25);
  }

  // Fallback defaults based on metadata
  const meta = lead.metadata || {};
  const defaults = ['Fitness'];
  if (meta.producto) defaults.push(meta.producto.split(' ')[0]);
  if (lead.segment === 'A') defaults.push('VIP');
  if (meta.objetivo?.toLowerCase().includes('grasa') || meta.objetivo?.toLowerCase().includes('peso')) defaults.push('Pérdida de Peso');
  if (meta.objetivo?.toLowerCase().includes('musculo') || meta.objetivo?.toLowerCase().includes('fuerza')) defaults.push('Hipertrofia');
  return defaults;
}
