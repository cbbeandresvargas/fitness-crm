import { z } from 'zod';
import { Env, Lead, WhatsAppMessage, KnowledgeBaseEntry, WhatsAppSettings, LeadStatus } from '../types';
import { sendMetaTextMessage, sendMetaImageMessage } from '../meta/client';
import { autoAssignAgent } from '../rules';
import { normalizeActivityName } from '../activities';

export const LeadStatusSchema = z.enum([
  'nuevo',
  'contactado',
  'negociacion',
  'ganado',
  'perdido',
]);

const stringArrayPreprocess = z.preprocess((val) => {
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return undefined;
}, z.array(z.string()).optional());

const optionalUrlPreprocess = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim().startsWith('http')) {
    return val.trim();
  }
  return undefined;
}, z.string().url().optional());

export const AgentActionSchema = z.object({
  action: z
    .enum(['reply', 'update_and_reply', 'update_lead', 'move_stage', 'handoff', 'none'])
    .default('reply'),
  reply_text: z.string().optional(),
  reply: z.string().optional(),
  text: z.string().optional(),
  detected_name: z.string().nullable().optional(),
  detected_disciplines: stringArrayPreprocess,
  suggested_status: LeadStatusSchema.nullable().optional(),
  stage: LeadStatusSchema.nullable().optional(),
  suggested_tags: stringArrayPreprocess,
  note: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  image_url: optionalUrlPreprocess,
  handoff_reason: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  farewell: z.string().nullable().optional(),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

export function getActionReplyText(action: AgentAction): string {
  const text = action.reply_text || action.reply || action.text || action.farewell || '';
  return text.trim();
}

export function getActionStatus(action: AgentAction): LeadStatus | undefined {
  return (action.suggested_status as LeadStatus) || (action.stage as LeadStatus) || undefined;
}

export function getActionNote(action: AgentAction): string | undefined {
  const n = action.notes || action.note;
  return n && n.trim() ? n.trim() : undefined;
}

export function getActionHandoffReason(action: AgentAction): string | undefined {
  const r = action.handoff_reason || action.reason;
  return r && r.trim() ? r.trim() : undefined;
}

/**
 * Extracción robusta de JSON a partir de la salida del modelo
 */
export function extractJson(raw: string): unknown | null {
  if (!raw || typeof raw !== 'string') return null;

  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  candidates.push(raw.trim());
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }

  for (const c of candidates) {
    // 1. Intento de parseo directo
    try {
      return JSON.parse(c);
    } catch {
      // 2. Limpieza de trailing commas comunes generadas por LLMs en listas/objetos
      try {
        const sanitized = c.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized);
      } catch {
        // Continuar con el siguiente candidato
      }
    }
  }
  return null;
}

/**
 * Llamada al modelo en Cloudflare Workers AI con soporte nativo, cadena de fallbacks y REST
 */
export async function callCloudflareWorkersAi(
  env: Env,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens: number = 400
): Promise<string | null> {
  const modelsToTry = [
    model,
    '@cf/meta/llama-3.2-3b-instruct',
    '@cf/meta/llama-3.2-1b-instruct',
    '@cf/meta/llama-2-7b-chat-int8',
  ].filter((m, idx, arr) => Boolean(m) && !m.includes('llama-3.1-8b') && arr.indexOf(m) === idx);

  // 1. Intento por binding nativo env.AI con reintento sobre modelo rápido si el principal falla
  if (env.AI && typeof env.AI.run === 'function') {
    for (const m of modelsToTry) {
      try {
        const res = await env.AI.run(m, {
          messages,
          max_tokens: maxTokens,
          temperature: 0.3,
        });
        if (res && res.response && res.response.trim().length > 0) {
          return res.response.trim();
        }
      } catch (err) {
        console.warn(`[Workers AI Binding] Error ejecutando modelo ${m}:`, err);
      }
    }
  }

  // 2. Intento por REST API de Cloudflare Workers AI si existen credenciales
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (token && accountId) {
    for (const m of modelsToTry) {
      try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${m}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages,
            max_tokens: maxTokens,
            temperature: 0.3,
          }),
        });

        const data: any = await response.json();
        if (data && data.success && data.result && data.result.response) {
          return data.result.response.trim();
        }
      } catch (err) {
        console.warn(`[Workers AI REST API] Error llamando a ${m}:`, err);
      }
    }
  }

  return null;
}

/**
 * Ejecutor con reintentos para garantizar formato JSON estructurado
 */
export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  env: Env,
  model: string = '@cf/meta/llama-3.2-3b-instruct'
): Promise<{ ok: true; data: T; raw: string } | { ok: false; error: string; detail: string; lastRaw?: string }> {
  const MAX_ATTEMPTS = 2;
  let lastDetail = '';
  let lastRaw = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptMessages =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: 'system' as const,
              content:
                'STRICT: Tu respuesta anterior no fue JSON válido según el esquema. Responde ÚNICAMENTE el objeto JSON sin explicaciones adicionales ni bloques markdown.',
            },
          ];

    const raw = await callCloudflareWorkersAi(env, model, attemptMessages, 600);
    if (!raw) {
      lastDetail = 'El proveedor de Workers AI no devolvió respuesta';
      continue;
    }
    lastRaw = raw;

    const extracted = extractJson(raw);
    if (!extracted) {
      lastDetail = `No se pudo extraer JSON de: ${raw.slice(0, 150)}`;
      continue;
    }

    const parsed = schema.safeParse(extracted);
    if (!parsed.success) {
      lastDetail = `Error de validación de esquema: ${parsed.error.issues.map((i) => i.message).join(', ')}`;
      continue;
    }

    return { ok: true, data: parsed.data, raw };
  }

  return { ok: false, error: 'invalid_output', detail: lastDetail, lastRaw };
}

/**
 * Contexto comercial por defecto de Fitness Club Pass Cochabamba
 */
export const DEFAULT_BUSINESS_CONTEXT = `Fitness Club Pass es la plataforma y app móvil de pases multideporte líder en Cochabamba, Bolivia. Con una sola membresía en la app, el cliente accede a múltiples centros deportivos, gimnasios, natación, crossfit, pádel y clases de toda la ciudad (Zona Norte, Cala Cala, América, Zona Central, Recoleta y Sarco). Todos los precios oficiales son exclusivamente en Bolivianos (Bs). El flujo comercial consiste en: 1) indagar amablemente y de forma discreta el nombre del cliente y sus disciplinas de interés; 2) explicar la cobertura de sedes aliadas en Cochabamba; 3) presentar los planes en Bs (Fit Básico Bs 180, Fit Pro Bs 280, Black VIP Bs 380); 4) resolver dudas u objeciones comerciales; 5) facilitar el pago simple por código QR o transferencia bancaria en Bs; 6) una vez confirmado el pago, felicitar al cliente y facilitarle el acceso a la app móvil.`;

/**
 * Generador de respuesta comercial inteligente de contingencia (Zero-failure fallback)
 * Garantiza que el prospecto NUNCA se quede sin respuesta aunque Workers AI tenga latencia o caída temporal.
 */
export function generateSmartSalesFallback(params: {
  lead: Lead;
  incomingText: string;
  kbEntries: KnowledgeBaseEntry[];
}): AgentAction {
  const { lead, incomingText } = params;
  const lower = incomingText.toLowerCase().trim();
  const firstName = lead.full_name?.split(' ')[0] || '';
  const greeting =
    firstName &&
    !firstName.toLowerCase().startsWith('whatsapp') &&
    !firstName.toLowerCase().startsWith('lead') &&
    !firstName.toLowerCase().startsWith('prospecto')
      ? `Hola ${firstName}`
      : 'Hola';

  // 1. Detección de solicitud de asesor humano
  if (
    lower.includes('humano') ||
    lower.includes('asesor') ||
    lower.includes('persona') ||
    lower.includes('alguien') ||
    lower.includes('queja') ||
    lower.includes('reclamo') ||
    lower.includes('llamame') ||
    lower.includes('llámame') ||
    lower.includes('telefono') ||
    lower.includes('teléfono') ||
    lower.includes('encargado')
  ) {
    return {
      action: 'handoff',
      handoff_reason: 'El prospecto solicitó atención humana directa.',
      farewell: `${greeting}, te comunico enseguida con un asesor para atenderte personalmente por aquí.`,
      suggested_status: lead.status === 'nuevo' ? 'contactado' : lead.status,
    };
  }

  // 2. Detección discreta de nombre del prospecto
  let detectedName: string | undefined = undefined;
  const nameMatch = lower.match(/(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ]+)/i);
  if (nameMatch && nameMatch[1]) {
    const raw = nameMatch[1].trim();
    if (!['un', 'una', 'el', 'la', 'nuevo', 'interesado', 'cliente', 'de'].includes(raw.toLowerCase())) {
      detectedName = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }

  // 3. Detección de disciplinas
  const detectedDisciplines: string[] = [];
  if (
    lower.includes('gym') ||
    lower.includes('pesa') ||
    lower.includes('musculacion') ||
    lower.includes('musculación')
  ) {
    detectedDisciplines.push('Musculación / Gym');
  }
  if (
    lower.includes('natacion') ||
    lower.includes('natación') ||
    lower.includes('pileta') ||
    lower.includes('piscina')
  ) {
    detectedDisciplines.push('Natación');
  }
  if (lower.includes('crossfit')) {
    detectedDisciplines.push('CrossFit');
  }
  if (lower.includes('padel') || lower.includes('pádel') || lower.includes('paddle')) {
    detectedDisciplines.push('Pádel');
  }
  if (lower.includes('pilates') || lower.includes('yoga')) {
    detectedDisciplines.push('Pilates / Yoga');
  }
  if (lower.includes('boxeo') || lower.includes('box') || lower.includes('marcial')) {
    detectedDisciplines.push('Boxeo / Artes Marciales');
  }
  if (lower.includes('funcional') || lower.includes('calistenia')) {
    detectedDisciplines.push('Funcional / Calistenia');
  }

  // 4. Detección de comprobante o confirmación de pago
  if (
    lower.includes('comprobante') ||
    lower.includes('transferi') ||
    lower.includes('transferí') ||
    lower.includes('ya pague') ||
    lower.includes('ya pagué') ||
    lower.includes('listo el pago') ||
    lower.includes('pago realizado') ||
    lower.includes('envió una foto') ||
    lower.includes('envio una foto')
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'ganado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['pago_confirmado', 'cliente_activo'],
      reply_text: `¡Excelente noticia! Bienvenido a Fitness Club Pass. Por favor pásame tu correo electrónico para dar de alta tu cuenta y enviarte los enlaces de descarga de la app móvil.`,
    };
  }

  // 5. Detección de interés de pago, QR o cuenta
  if (
    lower.includes('pago') ||
    lower.includes('pagar') ||
    lower.includes('qr') ||
    lower.includes('transferencia') ||
    lower.includes('cuenta') ||
    lower.includes('inscribir') ||
    lower.includes('comprar') ||
    lower.includes('adquirir') ||
    lower.includes('banco')
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'negociacion',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['interes_pago', 'solicito_qr'],
      reply_text: `¡Buenísimo! Te facilito el código QR simple para activar tu pase hoy mismo. ¿Prefieres pago por QR o transferencia bancaria en Bolivianos?`,
    };
  }

  const clientGreeting = detectedName ? `Hola ${detectedName}` : greeting;

  // 6. Consulta de planes y precios
  if (
    lower.includes('plan') ||
    lower.includes('precio') ||
    lower.includes('costo') ||
    lower.includes('cuanto') ||
    lower.includes('cuánto') ||
    lower.includes('vale') ||
    lower.includes('membresia') ||
    lower.includes('membresía') ||
    lower.includes('tarifa') ||
    lower.includes('promo')
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'negociacion',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['consulta_precios'],
      reply_text: `${clientGreeting}. En Fitness Club Pass tenemos planes mensuales en Bs:\n\n- Fit Básico: Bs 180 (8 pases para salas de pesas y cardio)\n- Fit Pro: Bs 280 (16 pases, incluye crossfit y funcional)\n- Black VIP: Bs 380 (pases ilimitados con natación y pádel)\n\n¿Qué disciplina te gustaría entrenar primero para coordinar tu pase?`,
    };
  }

  // 7. Consulta explícita de sedes / zonas en Cochabamba
  if (
    lower.includes('sede') ||
    lower.includes('centro') ||
    lower.includes('zona') ||
    lower.includes('donde') ||
    lower.includes('dónde') ||
    lower.includes('ubicacion') ||
    lower.includes('ubicación') ||
    (lower.includes('cochabamba') && !detectedName)
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'contactado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['consulta_sedes'],
      reply_text: `${clientGreeting}. Nuestra red multideporte cubre las mejores zonas de Cochabamba: Zona Norte, Cala Cala, América, Zona Central, Recoleta y Sarco. Con una sola membresía en la app puedes entrenar en cualquiera. ¿En qué zona te queda más cómodo entrenar?`,
    };
  }

  // 8. Saludo inicial o registro de disciplinas (Paso 1 del embudo)
  if (detectedDisciplines.length > 0) {
    const discStr = detectedDisciplines.join(' y ');
    return {
      action: 'update_and_reply',
      suggested_status: 'contactado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: detectedDisciplines.map((d) => `interes_${normalizeActivityName(d).replace(/[\s/]+/g, '_')}`),
      reply_text: `¡${clientGreeting}! Excelente opción con ${discStr}. Con Fitness Club Pass tienes acceso en toda Cochabamba con una sola membresía en Bs. ¿En qué zona o barrio te queda más cómodo entrenar?`,
    };
  }

  return {
    action: 'update_and_reply',
    suggested_status: 'contactado',
    detected_name: detectedName,
    detected_disciplines: detectedDisciplines,
    reply_text: `¡${clientGreeting}! Te saluda el equipo de Fitness Club Pass Cochabamba. Con una sola membresía en Bs tienes acceso a múltiples gimnasios y disciplinas en la ciudad. ¿Cuál es tu nombre y qué deporte te gustaría practicar?`,
  };
}

/**
 * Construye el prompt comercial con todo el conocimiento del gimnasio y el contexto del lead
 */
export function buildSalesAgentPrompt(params: {
  lead: Lead;
  kbEntries: KnowledgeBaseEntry[];
  settings?: WhatsAppSettings | null;
  registeredDisciplines?: string[];
}): string {
  const { lead, kbEntries, settings, registeredDisciplines = [] } = params;

  const tone =
    settings?.ai_tone?.trim() ||
    'directo, conciso, conversacional, empático y enfocado en cierre comercial ágil para WhatsApp en Cochabamba';
  const customInstructions = settings?.ai_instructions?.trim() || '';
  const businessContext =
    settings?.business_context?.trim() || DEFAULT_BUSINESS_CONTEXT;

  const kbText =
    kbEntries.length > 0
      ? kbEntries
          .map((entry) => `[${entry.category.toUpperCase()}] ${entry.title}:\n${entry.content}`)
          .join('\n\n')
      : `[PLANES BASE EN BS]
- Fit Básico: Bs 180 / mes (8 pases para salas de pesas y cardio)
- Fit Pro: Bs 280 / mes (16 pases, incluye crossfit, pilates y clases funcionales)
- Black VIP: Bs 380 / mes (pases ilimitados con piscinas de natación, crossfit, pádel y gimnasios premium)
[SEDES EN COCHABAMBA]
Zona Norte, Cala Cala, América, Zona Central, Recoleta y Sarco.`;

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
    safeTags = rawTags.map(String);
  } else if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) safeTags = parsed.map(String);
      else if (parsed) safeTags = [String(parsed)];
    } catch {
      if (rawTags.trim()) safeTags = [rawTags.trim()];
    }
  }
  const tagsStr = safeTags.length > 0 ? safeTags.join(', ') : 'Sin etiquetas';
  const disciplinesStr =
    registeredDisciplines.length > 0
      ? registeredDisciplines.join(', ')
      : 'Ninguna registrada aún';

  return `Eres el ASESOR COMERCIAL OFICIAL de WhatsApp de "Fitness Club Pass" en Cochabamba, Bolivia.
Tu misión es guiar al prospecto a través del embudo de ventas, responder con precisión comercial, indagar discretamente sus datos y llevarlo al cierre con pago por QR o transferencia bancaria en Bolivianos (Bs).

═══════════════════════════════════════════════════
DIRECTIVAS SUPREMAS Y REGLAS DE ORO (ESTRICTO):
═══════════════════════════════════════════════════
1. NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas frases de evasión como:
   - "No tengo acceso a información privada..."
   - "Soy una inteligencia artificial / modelo de lenguaje..."
   - "No puedo ayudarte con eso..."
   - "No tengo acceso a datos del sistema..."
   Eres un asesor humano experto de Fitness Club Pass. Responde siempre con seguridad, amabilidad y total enfoque en el servicio.
2. ENFOQUE 100% EN EL NEGOCIO:
   Todas tus respuestas giran en torno a Fitness Club Pass, la variedad de gimnasios aliados en Cochabamba, los planes en Bs y cómo la app le facilita entrenar.
3. ESTILO DE MENSAJES (WHATSAPP COMERCIAL REAL):
   - Mensajes CORTOS y CONVERSACIONALES: típicamente de 1 a 3 frases breves (máximo 60 palabras).
   - Sin rodeos, sin discursos corporativos ni introducciones aburridas ("¡Qué gran día!", "Es un honor saludarte").
   - NO uses emojis. Mantén un tono natural, cercano, profesional y boliviano sin modismos exagerados.
   - Siempre haz UN solo llamado a la acción (CTA) claro y natural por turno.
   - Moneda EXCLUSIVA: Bolivianos (Bs). NUNCA menciones dólares ni otra divisa.

═══════════════════════════════════════════════════
EMBUDO COMERCIAL GUIADO (6 ETAPAS):
═══════════════════════════════════════════════════
Sigue esta secuencia comercial de manera natural según el avance de la conversación:

ETAPA 1: INDAGACIÓN DISCRETA DE DATOS (Nombre y Disciplinas)
- Si no sabes el nombre real del cliente (o aparece como "WhatsApp ..."), pregúntaselo de forma cálida y discreta: "¡Hola! ¿Con quién tengo el gusto?" o "¡Hola! Con gusto te paso toda la info, ¿cuál es tu nombre para registrarte?".
- Pregunta qué disciplina le gusta entrenar (gym, musculación, natación, crossfit, pádel, pilates, etc.) o qué objetivo tiene.
- Estado sugerido: 'contactado'. Extrae detected_name y detected_disciplines.

ETAPA 2: CENTROS ALIADOS Y ZONAS DE COCHABAMBA
- Explica que con una sola membresía en la app tiene pases para múltiples centros y gimnasios en Cochabamba: Zona Norte, Cala Cala, América, Zona Central, Recoleta, Sarco, etc.
- Pregunta en qué zona o barrio le queda más cómodo entrenar.
- Estado sugerido: 'contactado'.

ETAPA 3: PLANES Y PRECIOS EN BOLIVIANOS (Bs)
- Presenta las opciones oficiales en Bolivianos (Bs):
  • Fit Básico: Bs 180 / mes (8 pases para salas de pesas y cardio)
  • Fit Pro: Bs 280 / mes (16 pases, incluye gimnasios, box de crossfit y funcional)
  • Black VIP: Bs 380 / mes (pases ilimitados con piscinas de natación, crossfit, pádel y gimnasios premium)
- Recomienda el plan ideal según la disciplina que le interesa.
- Estado sugerido: 'negociacion'.

ETAPA 4: RESOLUCIÓN DE DUDAS Y OBJECIONES
- Aclara cómo funciona la app móvil: no paga nada extra en recepción del gimnasio, solo muestra su código desde la app.
- Si pide probar: ofrece coordinar su primer pase para que descargue la app y pruebe el centro que prefiera.
- Si objeta precio: recuerda que pagar 2 gimnasios por separado cuesta más de Bs 400, mientras que con el pase tiene libertad total desde Bs 180.
- Estado sugerido: 'negociacion'.

ETAPA 5: MÉTODO DE PAGO RÁPIDO (QR Simple / Transferencia)
- Cuando el prospecto muestre interés de compra o pregunte cómo pagar, facilita el cierre inmediato:
  "Te genero el QR de pago simple para habilitar tus pases hoy mismo. ¿Prefieres pago por QR o transferencia bancaria?"
- Estado sugerido: 'negociacion'.

ETAPA 6: CONFIRMACIÓN Y DESCARGA DE LA APP
- Cuando el cliente confirme el pago o envíe el comprobante:
  Felicítalo por unirse a Fitness Club Pass, pide su correo electrónico para dar de alta la cuenta e indícale los enlaces para descargar la app.
- Estado sugerido: 'ganado'.

═══════════════════════════════════════════════════
DELEGACIÓN / HANDOFF A ASESOR HUMANO:
═══════════════════════════════════════════════════
Debes ejecutar la acción "handoff" de forma inmediata cuando:
1. El usuario solicita explícitamente hablar con una persona ("quiero hablar con un asesor", "pásame con un humano", "número del encargado", "llámame por teléfono").
2. El usuario reporta un problema técnico grave, una queja o un inconveniente que requiere gestión manual.
3. Consultas muy complejas o fuera del catálogo de Fitness Club Pass.
En caso de handoff:
- Genera action: "handoff".
- handoff_reason: Razón clara (ej: "Usuario solicitó asesor humano").
- farewell: Mensaje cordial y tranquilizador indicando que un asesor humano lo atenderá de inmediato por este mismo chat.

═══════════════════════════════════════════════════
CONTEXTO DEL NEGOCIO Y CONFIGURACIÓN:
═══════════════════════════════════════════════════
${businessContext}

TONO Y PERSONALIDAD:
${tone}

${customInstructions ? `INSTRUCCIONES ESPECÍFICAS ADICIONALES:\n${customInstructions}\n` : ''}
CATÁLOGO OFICIAL Y BASE DE CONOCIMIENTO (NO inventes precios ni sedes):
${kbText}

DATOS ACTUALES DEL CLIENTE EN EL CRM:
- Nombre: ${lead.full_name}
- Teléfono: ${lead.phone}
- Estado del pipeline: ${lead.status}
- Etiquetas: ${tagsStr}
- Disciplinas ya registradas: ${disciplinesStr}
${metadataStr ? `Metadatos:\n${metadataStr}` : ''}
${lead.notes_summary ? `Notas previas del expediente:\n${lead.notes_summary}` : ''}

═══════════════════════════════════════════════════
FORMATO DE SALIDA (ESTRICTO JSON):
═══════════════════════════════════════════════════
Responde EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura:
{
  "action": "reply" | "update_and_reply" | "handoff" | "none",
  "reply_text": "Texto breve de respuesta para WhatsApp (1 a 3 frases)...",
  "detected_name": "Nombre extraído del usuario si lo dijo (o null si no lo mencionó)",
  "detected_disciplines": ["gym", "natacion"], // disciplinas mencionadas por el cliente
  "suggested_status": "nuevo" | "contactado" | "negociacion" | "ganado" | "perdido",
  "suggested_tags": ["interes_natacion", "zona_norte"], // etiquetas relevantes
  "notes": "Nota comercial breve si hay algo relevante (o null)",
  "handoff_reason": "Razón si se delega a humano (o null)",
  "farewell": "Mensaje si es handoff (o null)"
}
NO incluyas bloques markdown (sin \`\`\`json), responde ÚNICAMENTE el objeto JSON crudo.`;
}

/**
 * Historial en activity_logs retirado: tabla eliminada del esquema D1
 */
async function safeLogActivity(
  _env: Env,
  _id: string,
  _leadId: string,
  _actionType: string,
  _details: string,
  _now: string
): Promise<void> {
  // activity_logs ha sido eliminada del esquema D1 para optimizar escrituras y lecturas
  return;
}

/**
 * Ejecuta un turno del agente de ventas con Cloudflare Workers AI y despacha la respuesta
 */
export async function runSalesAgentTurn(params: {
  env: Env;
  leadId: string;
  incomingText: string;
  credentials?: {
    phoneNumberId: string;
    token: string;
  } | null;
}): Promise<{
  executed: boolean;
  action?: AgentAction;
  deliveryResult?: { sentToMeta: boolean; waMessageId?: string; error?: string };
  error?: string;
}> {
  const { env, leadId, incomingText, credentials } = params;

  try {
    // 1. Obtener lead
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(leadId)
      .first<Lead>();
    if (!lead) return { executed: false, error: 'Lead no encontrado' };

    // Verificar si la IA está activa para este prospecto
    if (lead.ai_enabled === 0 || lead.handoff_at) {
      console.log(`[Sales Agent] Lead ${leadId} tiene IA desactivada o handoff activo`);
      return { executed: false, error: 'IA desactivada o handoff activo' };
    }

    // 2. Obtener configuración de WhatsApp
    const settings = await env.DB.prepare(
      'SELECT * FROM whatsapp_settings ORDER BY created_at DESC LIMIT 1'
    ).first<WhatsAppSettings>();

    if (settings && settings.ai_enabled === 0) {
      console.log('[Sales Agent] Toggle global de IA está apagado');
      return { executed: false, error: 'IA global apagada' };
    }

    const aiModel =
      settings?.ai_model && !settings.ai_model.includes('llama-3.1-8b')
        ? settings.ai_model
        : '@cf/meta/llama-3.2-3b-instruct';

    // 3. Obtener catálogo y base de conocimiento
    const kbRows = await env.DB.prepare(
      'SELECT * FROM knowledge_base WHERE is_active = 1 ORDER BY category ASC'
    ).all<KnowledgeBaseEntry>();
    const kbEntries = kbRows.results || [];

    // 4. Obtener disciplinas registradas en prospect_activities
    let registeredDisciplines: string[] = [];
    try {
      const regDiscRes = await env.DB.prepare(`
        SELECT a.name 
        FROM prospect_activities pa 
        JOIN activities a ON a.id = pa.activity_id 
        WHERE pa.lead_id = ?
      `).bind(leadId).all<{ name: string }>();
      registeredDisciplines = (regDiscRes.results || []).map((r) => r.name);
    } catch {
      // Ignorar si la tabla no está disponible temporalmente
    }

    // 5. Obtener historial reciente de mensajes
    const messagesRows = await env.DB.prepare(`
      SELECT sender, content, message_type, created_at 
      FROM whatsapp_messages 
      WHERE lead_id = ? 
      ORDER BY created_at DESC 
      LIMIT 12
    `)
      .bind(leadId)
      .all<WhatsAppMessage>();

    const history = (messagesRows.results || []).reverse();

    // 6. Construir prompts
    const systemPrompt = buildSalesAgentPrompt({
      lead,
      kbEntries,
      settings,
      registeredDisciplines,
    });

    const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.sender === 'lead' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        })),
    ];

    // Asegurar que el mensaje entrante actual esté al final si no estaba registrado aún
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== incomingText) {
      chatMessages.push({ role: 'user', content: incomingText });
    }

    // 7. Ejecutar inferencia en Cloudflare Workers AI
    const result = await chatJson(AgentActionSchema, chatMessages, env, aiModel);

    let action: AgentAction;
    let usedFallback = false;
    if (result.ok) {
      action = result.data;
    } else if (result.lastRaw && result.lastRaw.trim().length > 0) {
      // Si el modelo respondió en texto plano en vez de JSON, rescatar el texto como respuesta directa
      const fallbackText = result.lastRaw
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();
      console.warn('[Sales Agent] Recuperado de fallo de formato JSON; despachando texto directo de IA:', fallbackText.slice(0, 100));
      action = { action: 'reply', reply_text: fallbackText };
    } else {
      console.warn(`[Sales Agent] Workers AI no devolvió respuesta (${result.detail}). Activando motor de contingencia comercial...`);
      usedFallback = true;
      action = generateSmartSalesFallback({ lead, incomingText, kbEntries });
    }

    const now = new Date().toISOString();

    if (usedFallback) {
      await safeLogActivity(
        env,
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        'ai_generated',
        `IA ejecutó respuesta comercial de contingencia por indisponibilidad de modelo Cloudflare Workers AI.`,
        now
      );
    }

    // 8. PERSISTENCIA AUTOMÁTICA DE DATOS EXTRAÍDOS POR LA IA

    // A) Actualización de Nombre (si detectó nombre real y el prospecto tenía nombre temporal)
    if (action.detected_name && typeof action.detected_name === 'string') {
      const cleanName = action.detected_name.trim();
      const currentName = (lead.full_name || '').trim();
      const isTemporary =
        !currentName ||
        /^whatsapp/i.test(currentName) ||
        /^lead/i.test(currentName) ||
        /^prospecto/i.test(currentName) ||
        /^\+?\d+$/.test(currentName.replace(/\s+/g, ''));

      if (cleanName.length >= 2 && (isTemporary || cleanName.toLowerCase() !== currentName.toLowerCase())) {
        await env.DB.prepare('UPDATE leads SET full_name = ?, updated_at = ? WHERE id = ?')
          .bind(cleanName, now, leadId)
          .run();
        lead.full_name = cleanName;

        await safeLogActivity(
          env,
          `act_${crypto.randomUUID().slice(0, 8)}`,
          leadId,
          'update',
          `IA identificó y actualizó el nombre del cliente: "${cleanName}"`,
          now
        );
      }
    }

    // B) Actualización de Estado (suggested_status o avance de 'nuevo' a 'contactado')
    const suggestedStatus = getActionStatus(action);
    let targetStatus: LeadStatus | undefined = undefined;

    if (suggestedStatus && ['nuevo', 'contactado', 'negociacion', 'ganado', 'perdido'].includes(suggestedStatus)) {
      targetStatus = suggestedStatus;
    } else if (lead.status === 'nuevo') {
      targetStatus = 'contactado';
    }

    if (targetStatus && targetStatus !== lead.status) {
      await env.DB.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?')
        .bind(targetStatus, now, leadId)
        .run();

      await safeLogActivity(
        env,
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        'status_change',
        `IA Comercial avanzó al prospecto a la etapa: ${targetStatus.toUpperCase()}`,
        now
      );
      lead.status = targetStatus;
    }

    // C) Registro y Asociación de Disciplinas de Interés en prospect_activities
    if (Array.isArray(action.detected_disciplines) && action.detected_disciplines.length > 0) {
      try {
        const allActivitiesRes = await env.DB.prepare(
          'SELECT id, name, name_norm, is_active FROM activities'
        ).all<{
          id: string;
          name: string;
          name_norm: string;
          is_active: number;
        }>();
        const allActivities = allActivitiesRes.results || [];

        for (const rawDiscipline of action.detected_disciplines) {
          if (!rawDiscipline || typeof rawDiscipline !== 'string') continue;
          const cleanDisc = rawDiscipline.trim();
          if (cleanDisc.length < 2) continue;
          const norm = normalizeActivityName(cleanDisc);

          // Buscar coincidencia en catálogo existente
          let matchedActivity = allActivities.find((a) => a.name_norm === norm);

          if (!matchedActivity) {
            if (norm.includes('gym') || norm.includes('pesa') || norm.includes('musculacion')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_gym' || a.name_norm.includes('gym'));
            } else if (norm.includes('natacion') || norm.includes('pileta') || norm.includes('piscina')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_natacion' || a.name_norm.includes('natacion'));
            } else if (norm.includes('crossfit') || norm.includes('box')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_crossfit' || a.name_norm.includes('crossfit'));
            } else if (norm.includes('padel') || norm.includes('paddle')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_padel' || a.name_norm.includes('padel'));
            } else if (norm.includes('pilates') || norm.includes('yoga')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_pilates' || a.name_norm.includes('pilates'));
            } else if (norm.includes('boxeo') || norm.includes('artes marciales') || norm.includes('box')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_artes_marciales' || a.name_norm.includes('boxeo'));
            } else if (norm.includes('funcional') || norm.includes('calistenia')) {
              matchedActivity = allActivities.find((a) => a.id === 'act_funcional' || a.name_norm.includes('funcional'));
            }
          }

          let activityId: string;
          if (matchedActivity) {
            activityId = matchedActivity.id;
          } else {
            // Si no existe, crear la actividad en el catálogo
            activityId = `act_${crypto.randomUUID().slice(0, 8)}`;
            const displayName = cleanDisc.charAt(0).toUpperCase() + cleanDisc.slice(1);
            await env.DB.prepare(`
              INSERT OR IGNORE INTO activities (id, name, name_norm, is_active, created_by, created_at)
              VALUES (?, ?, ?, 1, 'system_ai', ?)
            `).bind(activityId, displayName, norm, now).run();

            allActivities.push({
              id: activityId,
              name: displayName,
              name_norm: norm,
              is_active: 1,
            });
          }

          // Asociar en prospect_activities si no existe la relación
          const existingRel = await env.DB.prepare(
            'SELECT id FROM prospect_activities WHERE lead_id = ? AND activity_id = ?'
          ).bind(leadId, activityId).first();

          if (!existingRel) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO prospect_activities (id, lead_id, activity_id, created_by, created_at)
              VALUES (?, ?, ?, 'system_ai', ?)
            `).bind(`pa_${crypto.randomUUID().slice(0, 8)}`, leadId, activityId, now).run();

            await safeLogActivity(
              env,
              `act_${crypto.randomUUID().slice(0, 8)}`,
              leadId,
              'update',
              `IA vinculó actividad de interés: "${cleanDisc}"`,
              now
            );
          }
        }
      } catch (actErr) {
        console.warn('[Sales Agent] Error registrando disciplinas del lead:', actErr);
      }
    }

    // D) Actualización de Etiquetas (suggested_tags)
    if (Array.isArray(action.suggested_tags) && action.suggested_tags.length > 0) {
      try {
        let currentTags: string[] = [];
        const rawTags: unknown = (lead as any).tags;
        if (Array.isArray(rawTags)) {
          currentTags = rawTags.map(String);
        } else if (typeof rawTags === 'string') {
          try {
            const parsed = JSON.parse(rawTags);
            if (Array.isArray(parsed)) currentTags = parsed.map(String);
            else if (parsed) currentTags = [String(parsed)];
          } catch {
            if (rawTags.trim()) currentTags = [rawTags.trim()];
          }
        }

        const tagSet = new Set(currentTags.map((t) => t.trim().toLowerCase()).filter(Boolean));
        let tagsChanged = false;

        for (const rawTag of action.suggested_tags) {
          if (!rawTag || typeof rawTag !== 'string') continue;
          const normalizedTag = rawTag
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_')
            .replace(/[^\w_]/g, '');

          if (normalizedTag && !tagSet.has(normalizedTag)) {
            tagSet.add(normalizedTag);
            currentTags.push(normalizedTag);
            tagsChanged = true;
          }
        }

        if (tagsChanged) {
          const updatedTagsJson = JSON.stringify(currentTags);
          await env.DB.prepare('UPDATE leads SET tags = ?, updated_at = ? WHERE id = ?')
            .bind(updatedTagsJson, now, leadId)
            .run();
          (lead as any).tags = currentTags;
        }
      } catch (tagErr) {
        console.warn('[Sales Agent] Error actualizando tags del lead:', tagErr);
      }
    }

    // E) Guardado de Notas Comerciales
    const noteContent = getActionNote(action);
    if (noteContent) {
      const existingSummary = lead.notes_summary ? `${lead.notes_summary}\n` : '';
      const updatedSummary = `${existingSummary}[IA ${now.slice(0, 10)}]: ${noteContent}`;

      await env.DB.prepare('UPDATE leads SET notes_summary = ?, updated_at = ? WHERE id = ?')
        .bind(updatedSummary, now, leadId)
        .run();
      lead.notes_summary = updatedSummary;

      await safeLogActivity(
        env,
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        'note',
        `Nota de IA Comercial: ${noteContent}`,
        now
      );
    }

    // 9. GESTIÓN DE ACCIÓN FINAL (HANDOFF / REPLY / NONE)
    const isHandoff = action.action === 'handoff' || Boolean(action.handoff_reason);

    if (isHandoff) {
      const reason = getActionHandoffReason(action) || 'Solicitud de intervención humana';
      let assignedAgentId = lead.assigned_to;

      // Si no tenía asesor asignado, auto-asignar con round-robin balanceado
      if (!assignedAgentId) {
        try {
          assignedAgentId = await autoAssignAgent(env.DB);
        } catch (assignErr) {
          console.warn('[Sales Agent] Error ejecutando autoAssignAgent en handoff:', assignErr);
        }
      }

      await env.DB.prepare(`
        UPDATE leads 
        SET handoff_at = ?, handoff_reason = 'modelo', assigned_to = COALESCE(?, assigned_to), updated_at = ? 
        WHERE id = ?
      `)
        .bind(now, assignedAgentId || null, now, leadId)
        .run();

      await safeLogActivity(
        env,
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        'ai_generated',
        `IA transfirió la conversación a un asesor humano. Razón: ${reason}`,
        now
      );

      const farewellText =
        action.farewell ||
        action.reply_text ||
        action.reply ||
        action.text ||
        'Te comunico enseguida con uno de nuestros asesores para atenderte personalmente por aquí.';

      const deliveryResult = await deliverOutboundMessage({
        env,
        lead,
        text: farewellText,
        imageUrl: action.image_url || undefined,
        credentials,
        now,
      });

      return { executed: true, action, deliveryResult };
    }

    if (action.action === 'none') {
      return { executed: true, action };
    }

    // Despacho de respuesta comercial (reply, update_and_reply, move_stage, update_lead)
    const replyText = getActionReplyText(action);
    if (replyText) {
      const deliveryResult = await deliverOutboundMessage({
        env,
        lead,
        text: replyText,
        imageUrl: action.image_url || undefined,
        credentials,
        now,
      });
      return { executed: true, action, deliveryResult };
    }

    return { executed: true, action };
  } catch (err: any) {
    console.error('[Sales Agent] Error ejecutando turno del agente:', err);
    return { executed: false, error: err?.message || 'Error general en turno de IA' };
  }
}

/**
 * Despacha el mensaje de salida: envía vía Meta WhatsApp Cloud API v25.0 y guarda en D1
 */
export async function deliverOutboundMessage(params: {
  env: Env;
  lead: Lead;
  text: string;
  imageUrl?: string;
  credentials?: { phoneNumberId: string; token: string } | null;
  now: string;
}): Promise<{ sentToMeta: boolean; waMessageId?: string; error?: string }> {
  const { env, lead, text, imageUrl, credentials, now } = params;
  let waMessageId: string | null = null;
  let metaError: string | null = null;

  // Si hay credenciales activas, enviar a través de Meta Graph API v25.0
  if (credentials && credentials.phoneNumberId && credentials.token) {
    try {
      if (imageUrl) {
        const res = await sendMetaImageMessage({
          phoneNumberId: credentials.phoneNumberId,
          token: credentials.token,
          to: lead.phone,
          imageUrl,
          caption: text,
          env,
        });
        waMessageId = res.messageId;
      } else {
        const res = await sendMetaTextMessage({
          phoneNumberId: credentials.phoneNumberId,
          token: credentials.token,
          to: lead.phone,
          text,
          env,
        });
        waMessageId = res.messageId;
      }
    } catch (sendErr: any) {
      metaError = sendErr?.message || String(sendErr);
      console.error('[deliverOutboundMessage] Error enviando a Meta Graph API v25.0:', sendErr);
    }
  } else {
    metaError = 'Credenciales de Meta WhatsApp no encontradas (falta META_WA_PHONE_NUMBER_ID o META_WA_ACCESS_TOKEN)';
    console.warn('[deliverOutboundMessage] Credenciales de Meta no configuradas al despachar');
  }

  const msgId = `msg_${crypto.randomUUID().slice(0, 8)}`;

  // Guardar en la base de datos D1
  await env.DB.prepare(`
    INSERT INTO whatsapp_messages (
      id, lead_id, user_id, sender, message_type, content, media_url, status, whatsapp_message_id, ai_generated, created_at
    ) VALUES (?, ?, NULL, 'agent', ?, ?, ?, ?, ?, 1, ?)
  `)
    .bind(
      msgId,
      lead.id,
      imageUrl ? 'image' : 'text',
      text,
      imageUrl || null,
      waMessageId ? 'delivered' : (metaError ? 'failed' : 'sent'),
      waMessageId,
      now
    )
    .run();

  await env.DB.prepare(`
    UPDATE leads 
    SET last_contacted_at = ?, updated_at = ? 
    WHERE id = ?
  `)
    .bind(now, now, lead.id)
    .run();

  if (waMessageId) {
    await safeLogActivity(
      env,
      `act_${crypto.randomUUID().slice(0, 8)}`,
      lead.id,
      'whatsapp_sent',
      imageUrl
        ? `Respuesta de IA con imagen enviada por WhatsApp (ID: ${waMessageId}): "${text.slice(0, 80)}..."`
        : `Respuesta de IA enviada por WhatsApp (ID: ${waMessageId}): "${text.slice(0, 80)}..."`,
      now
    );
  } else if (metaError && credentials) {
    await safeLogActivity(
      env,
      `act_${crypto.randomUUID().slice(0, 8)}`,
      lead.id,
      'note',
      `[Alerta Meta WhatsApp] Falló la entrega del mensaje al número ${lead.phone}: ${metaError}`,
      now
    );
  }

  return {
    sentToMeta: Boolean(waMessageId),
    waMessageId: waMessageId || undefined,
    error: metaError || undefined,
  };
}
