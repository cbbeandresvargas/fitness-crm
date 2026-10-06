import { Lead, ActivityLog, Env } from './types';
import { normalizePhone } from './rules';
import { cityFromMetadata } from './locations';

/**
 * Reemplaza variables / placeholders como {nombre}, {producto}, {ciudad}, {agente} en una plantilla
 */
/**
 * Reemplaza variables / placeholders como {nombre}, {producto}, {ciudad}, {agente} en una plantilla
 * con valores por defecto seguros para Fitness Club Pass Cochabamba
 */
export function renderTemplate(
  templateContent: string,
  variables: Record<string, string>
): string {
  const merged: Record<string, string> = {
    producto: 'Fitness Club Pass',
    ciudad: 'Cochabamba',
    agente: 'tu Asesor',
    nombre: '',
    ...variables,
  };

  let result = templateContent;
  for (const [key, val] of Object.entries(merged)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, val?.trim() || (key === 'nombre' ? '' : 'Fitness Club Pass'));
  }
  // Limpieza de espacios dobles si el nombre estaba vacío
  return result.replace(/\s{2,}/g, ' ').trim();
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
  const { lead, agentName, recentActivities, tone = 'motivador, consultivo y enfocado en cierre', goal = 'presentar planes en Bs o activar suscripción' } = options;

  const notes = recentActivities
    .slice(0, 5)
    .map((act) => `- [${act.action_type}] ${act.details}`)
    .join('\n');

  let safeMetadata: Record<string, any> = {};
  if (typeof lead.metadata === 'object' && lead.metadata !== null) {
    safeMetadata = lead.metadata;
  } else if (typeof lead.metadata === 'string') {
    try {
      safeMetadata = JSON.parse(lead.metadata);
    } catch {
      safeMetadata = {};
    }
  }

  const metadataStr = Object.entries(safeMetadata)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  let safeTags: string[] = [];
  const rawTags: unknown = (lead as any).tags;
  if (Array.isArray(rawTags)) {
    safeTags = rawTags.map((t) => String(t));
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) safeTags = parsed.map((t) => String(t));
      else if (parsed) safeTags = [String(parsed)];
    } catch {
      if (rawTags.trim()) safeTags = [rawTags.trim()];
    }
  }
  const tagsStr = safeTags.length > 0 ? safeTags.join(', ') : 'Multideporte';

  const systemPrompt = `Eres el asesor comercial por WhatsApp de "Fitness Club Pass" en Cochabamba, Bolivia.
Con una sola membresía en la app, los clientes acceden a gimnasios, crossfit, natación y pádel en toda la ciudad. Todos los precios están en Bolivianos (Bs).

DIRECTIVAS ESTRICTAS DE RESPUESTA:
1. Respuestas DIRECTAS, CONCISAS Y CONVERSACIONALES: típicamente de 1 a 3 frases breves.
2. Cero rodeos, sin intros aburridas ni repeticiones corporativas.
3. Si es un saludo o pregunta simple, responde en 1 o 2 oraciones breves. Si preguntan planes o precios, resume solo lo indispensable en líneas cortas.
4. Incluye siempre un llamado a la acción (CTA) natural y claro para Bolivia (ej. agendar visita al gimnasio, coordinar clase de prueba o activar su pase).
5. NO uses emojis. Lenguaje cercano, natural y profesional.`;

  const userPrompt = `Prospecto:
- Nombre: ${lead.full_name}
- Segmento: ${lead.segment}
- Estado del Pipeline: ${lead.status}
- Tags / Intereses: ${tagsStr}
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
 * Generador de Mensajes de WhatsApp usando Cloudflare Workers AI (@cf/meta/llama-3.2-3b-instruct)
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
    '@cf/meta/llama-3.2-3b-instruct',
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    200
  );

  if (aiOutput) {
    return aiOutput;
  }

  // Fallback directo y conversacional
  const meta = lead.metadata || {};
  const nombre = lead.full_name.split(' ')[0] || '';

  if (lead.segment === 'A') {
    return `¡Hola ${nombre}! Te escribe ${agentName} de Fitness Club Pass. Tenemos tu pase listo para ingresar a la red de gimnasios en Cochabamba. ¿Te gustaría coordinar la activación de tu suscripción hoy?`;
  } else if (lead.segment === 'C') {
    return `Hola ${nombre}, te saluda ${agentName} de Fitness Club Pass. Tienes pases multideporte en Cochabamba desde Bs 180 al mes. ¿Qué zona te queda más cómoda para entrenar?`;
  } else {
    return `¡Hola ${nombre}! Te escribe ${agentName} de Fitness Club Pass Cochabamba. Con una sola membresía en Bs tienes acceso a múltiples gimnasios y disciplinas. ¿Qué deporte te interesa probar primero?`;
  }
}

/**
 * Resumen Ejecutivo y Diagnóstico del Prospecto con Cloudflare Workers AI (@cf/meta/llama-3.2-3b-instruct)
 */
export async function generateAiLeadBriefing(
  env: Env,
  lead: Lead,
  activities: ActivityLog[]
): Promise<string> {
  const metaStr = JSON.stringify(lead.metadata || {});
  const notesStr = activities.slice(0, 6).map((a) => a.details).join(' | ');

  const systemPrompt = `Eres un estratega comercial senior de Fitness Club Pass Cochabamba. Resume el perfil del prospecto en exactamente 2 oraciones concisas para el asesor de ventas: 1) Quién es y qué busca, 2) Siguiente paso sugerido y nivel de urgencia.`;
  const userPrompt = `Prospecto: ${lead.full_name}, Estado: ${lead.status}, Segmento: ${lead.segment}. Metadatos: ${metaStr}. Historial notas: ${notesStr || 'Sin historial'}.`;

  const aiOutput = await callCloudflareWorkersAi(
    env,
    '@cf/meta/llama-3.2-3b-instruct',
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
  return `${lead.full_name} se encuentra en etapa ${lead.status.toUpperCase()} buscando ${meta.objetivo || 'entrenamiento'} con interés en suscripciones de pase multideporte en Cochabamba. Se recomienda coordinar activación de su primer pase en la app.`;
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
    '@cf/meta/llama-3.2-3b-instruct',
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
  if (lead.segment === 'A') defaults.push('AntiguoPagador');
  if (meta.objetivo?.toLowerCase().includes('grasa') || meta.objetivo?.toLowerCase().includes('peso')) defaults.push('Pérdida de Peso');
  if (meta.objetivo?.toLowerCase().includes('musculo') || meta.objetivo?.toLowerCase().includes('fuerza')) defaults.push('Hipertrofia');
  return defaults;
}
