import { z } from 'zod';
import { Env, Lead, WhatsAppMessage, KnowledgeBaseEntry, WhatsAppSettings } from '../types';
import { sendMetaTextMessage, sendMetaImageMessage } from '../meta/client';

export const AgentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('none'),
  }),
  z.object({
    action: z.literal('reply'),
    text: z.string().min(1),
    image_url: z.string().url().optional(),
  }),
  z.object({
    action: z.literal('update_lead'),
    note: z.string().min(1),
    reply: z.string().optional(),
    image_url: z.string().url().optional(),
  }),
  z.object({
    action: z.literal('move_stage'),
    stage: z.enum(['nuevo', 'contactado', 'negociacion', 'ganado', 'perdido']),
    reply: z.string().optional(),
    image_url: z.string().url().optional(),
  }),
  z.object({
    action: z.literal('handoff'),
    reason: z.string().optional(),
    farewell: z.string().optional(),
  }),
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;

/**
 * Extracción robusta de JSON a partir de la salida del modelo
 */
export function extractJson(raw: string): unknown | null {
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
    try {
      return JSON.parse(c);
    } catch {
      // Intentar con el siguiente candidato
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
 * Generador de respuesta comercial inteligente de contingencia (Zero-failure fallback)
 * Garantiza que el prospecto NUNCA se quede sin respuesta aunque Workers AI tenga latencia o caída temporal.
 */
export function generateSmartSalesFallback(params: {
  lead: Lead;
  incomingText: string;
  kbEntries: KnowledgeBaseEntry[];
}): AgentAction {
  const { lead, incomingText, kbEntries } = params;
  const lower = incomingText.toLowerCase();
  const firstName = lead.full_name?.split(' ')[0] || '';
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';

  // 1. Detección de solicitud de asesor humano
  if (
    lower.includes('humano') ||
    lower.includes('asesor') ||
    lower.includes('persona') ||
    lower.includes('alguien') ||
    lower.includes('queja') ||
    lower.includes('reclamo')
  ) {
    return {
      action: 'handoff',
      reason: 'El prospecto solicitó atención humana directa.',
      farewell: `${greeting}, te comunico enseguida con un asesor para atenderte personalmente por aquí.`,
    };
  }

  // 2. Detección de intención de compra, QR o pago
  if (
    lower.includes('pago') ||
    lower.includes('pagar') ||
    lower.includes('qr') ||
    lower.includes('transferencia') ||
    lower.includes('cuenta') ||
    lower.includes('inscribir') ||
    lower.includes('comprar') ||
    lower.includes('adquirir')
  ) {
    return {
      action: 'move_stage',
      stage: 'negociacion',
      reply: `¡Excelente ${firstName || ''}! Te paso el QR simple para activar tu pase hoy mismo. ¿Prefieres pago por QR o transferencia bancaria?`,
    };
  }

  // 3. Consulta de planes, precios y opciones
  if (
    lower.includes('plan') ||
    lower.includes('precio') ||
    lower.includes('costo') ||
    lower.includes('cuanto') ||
    lower.includes('vale') ||
    lower.includes('membresia') ||
    lower.includes('tarifa') ||
    lower.includes('promo')
  ) {
    return {
      action: 'reply',
      text: `${greeting}. En Fitness Club Pass tenemos planes mensuales en Bs:\n\n- Fit Básico: Bs 180 (8 pases)\n- Fit Pro: Bs 280 (16 pases, incluye crossfit y funcional)\n- Black VIP: Bs 380 (ilimitado con natación y pádel)\n\n¿Qué disciplina te gustaría entrenar primero para coordinar tu pase?`,
    };
  }

  // 4. Saludo inicial o consulta general
  return {
    action: 'reply',
    text: `¡${greeting}! Te saluda el equipo de Fitness Club Pass Cochabamba. Con una sola membresía en Bs tienes acceso a múltiples gimnasios y disciplinas en la ciudad. ¿Qué zona o deporte te interesa probar?`,
  };
}

/**
 * Construye el prompt comercial con todo el conocimiento del gimnasio y el contexto del lead
 */
export function buildSalesAgentPrompt(params: {
  lead: Lead;
  kbEntries: KnowledgeBaseEntry[];
  settings?: WhatsAppSettings | null;
}): string {
  const { lead, kbEntries, settings } = params;

  const tone = settings?.ai_tone || 'directo, conciso, conversacional y enfocado en cierre ágil';
  const customInstructions = settings?.ai_instructions || '';

  const kbText = kbEntries.length > 0
    ? kbEntries
        .map((entry) => `[${entry.category.toUpperCase()}] ${entry.title}:\n${entry.content}`)
        .join('\n\n')
    : '(Catálogo base: Fit Básico Bs 180, Fit Pro Bs 280, Black VIP Bs 380)';

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
  const tagsStr = safeTags.length > 0 ? safeTags.join(', ') : 'Sin tags';

  return `Eres el asesor comercial por WhatsApp de "Fitness Club Pass" en Cochabamba, Bolivia.

DIRECTIVA PRINCIPAL DE COMUNICACIÓN (ESTRICTA):
- Respuestas CORTAS, DIRECTAS Y CONVERSACIONALES: típicamente de 1 a 3 frases breves.
- Cero rodeos, sin introducciones aburridas ("¡Qué gran día!", "Es un placer saludarte") ni repeticiones corporativas.
- Responde breve y al punto: si te saludan o hacen una pregunta simple, responde en 1 o 2 oraciones. Si preguntan precios o sedes, resume solo lo indispensable en líneas cortas.
- Haz siempre una sola pregunta o llamado a la acción (CTA) natural y claro para Bolivia (ej. agendar visita al gimnasio, coordinar clase de prueba o activar su pase libre en la app).
- NO uses emojis. Lenguaje natural, cercano y profesional.
- MONEDA: Exclusivamente Bolivianos (Bs).

PROPUESTA DE VALOR:
- Fitness Club Pass es la app que te da pases para entrenar en múltiples gimnasios, crossfit, piscinas y centros de Cochabamba con una sola membresía en Bs.

TONO Y PERSONALIDAD:
${tone}

INSTRUCCIONES ESPECÍFICAS DEL NEGOCIO:
${customInstructions || '- Sé directo, conciso y enfocado en resolver.'}

CATÁLOGO OFICIAL Y BASE DE CONOCIMIENTO (NO inventes precios ni sedes):
${kbText}

DATOS DEL PROSPECTO:
- Nombre: ${lead.full_name}
- Teléfono: ${lead.phone}
- Segmento: ${lead.segment}
- Estado del pipeline: ${lead.status}
- Tags / Intereses: ${tagsStr}
${metadataStr ? `Metadatos:\n${metadataStr}` : ''}
${lead.notes_summary ? `Notas previas: ${lead.notes_summary}` : ''}

REGLAS DE ACTUACIÓN:
1. Responde ÚNICAMENTE un objeto JSON válido con exactamente UNA acción:
   - {"action":"none"} -> No responder.
   - {"action":"reply","text":"...","image_url":"https://..."} -> Enviar respuesta corta y directa.
   - {"action":"update_lead","note":"...","reply":"...","image_url":"https://..."} -> Guardar nota y responder.
   - {"action":"move_stage","stage":"nuevo"|"contactado"|"negociacion"|"ganado"|"perdido","reply":"...","image_url":"https://..."} -> Mover etapa comercial.
   - {"action":"handoff","reason":"...","farewell":"..."} -> Transferir a asesor humano si pide hablar con persona o asesor.

2. CIERRES Y COMPORTAMIENTO:
   - Si pide pagar, QR o inscribirse -> "move_stage" a "negociacion" y ofrece el QR de pago simple.
   - Si envía comprobante -> "move_stage" a "ganado" y pide su correo para habilitar la app.
   - Si pide humano/asesor -> "handoff" inmediato con mensaje breve.

3. REGLA ESTRICTA DE LONGITUD Y FORMATO:
   - Saludos o preguntas sencillas: máximo 2 frases cortas.
   - Precios o dudas: resumen directo y conciso (máximo 50-70 palabras), sin párrafos densos.
   - Devuelve EXCLUSIVAMENTE el JSON sin formato markdown ni texto alrededor.`;
}

/**
 * Ejecuta un turno del agente de ventas con Cloudflare Workers AI y despacha la respuesta
 */
export async function runSalesAgentTurn(params: {
  env: Env,
  leadId: string,
  incomingText: string,
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

    const aiModel = (settings?.ai_model && !settings.ai_model.includes('llama-3.1-8b'))
      ? settings.ai_model
      : '@cf/meta/llama-3.2-3b-instruct';

    // 3. Obtener catálogo y base de conocimiento
    const kbRows = await env.DB.prepare(
      'SELECT * FROM knowledge_base WHERE is_active = 1 ORDER BY category ASC'
    ).all<KnowledgeBaseEntry>();
    const kbEntries = kbRows.results || [];

    // 4. Obtener historial reciente de mensajes
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

    // 5. Construir prompts
    const systemPrompt = buildSalesAgentPrompt({ lead, kbEntries, settings });

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

    // 6. Ejecutar inferencia en Cloudflare Workers AI
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
      action = { action: 'reply', text: fallbackText };
    } else {
      console.warn(`[Sales Agent] Workers AI no devolvió respuesta (${result.detail}). Activando motor de contingencia comercial...`);
      usedFallback = true;
      action = generateSmartSalesFallback({ lead, incomingText, kbEntries });
    }

    const now = new Date().toISOString();

    if (usedFallback) {
      await env.DB.prepare(`
        INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
        VALUES (?, ?, 'ai_generated', ?, ?)
      `)
        .bind(
          `act_${crypto.randomUUID().slice(0, 8)}`,
          leadId,
          `IA ejecutó respuesta comercial de contingencia por indisponibilidad de modelo Cloudflare Workers AI.`,
          now
        )
        .run();
    }

    let deliveryResult: { sentToMeta: boolean; waMessageId?: string; error?: string } | undefined;

    // 7. Ejecutar acción resultante
    switch (action.action) {
      case 'none':
        return { executed: true, action };

      case 'move_stage': {
        await env.DB.prepare(`
          UPDATE leads 
          SET status = ?, last_contacted_at = ?, updated_at = ? 
          WHERE id = ?
        `)
          .bind(action.stage, now, now, leadId)
          .run();

        await env.DB.prepare(`
          INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
          VALUES (?, ?, 'status_change', ?, ?)
        `)
          .bind(
            `act_${crypto.randomUUID().slice(0, 8)}`,
            leadId,
            `IA Comercial avanzó al prospecto a la etapa: ${action.stage.toUpperCase()}`,
            now
          )
          .run();

        if (action.reply) {
          deliveryResult = await deliverOutboundMessage({
            env,
            lead,
            text: action.reply,
            imageUrl: action.image_url,
            credentials,
            now,
          });
        }
        return { executed: true, action, deliveryResult };
      }

      case 'update_lead': {
        const existingSummary = lead.notes_summary ? `${lead.notes_summary}\n` : '';
        const updatedSummary = `${existingSummary}[IA ${now.slice(0, 10)}]: ${action.note}`;

        await env.DB.prepare(`
          UPDATE leads 
          SET notes_summary = ?, updated_at = ? 
          WHERE id = ?
        `)
          .bind(updatedSummary, now, leadId)
          .run();

        await env.DB.prepare(`
          INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
          VALUES (?, ?, 'note', ?, ?)
        `)
          .bind(
            `act_${crypto.randomUUID().slice(0, 8)}`,
            leadId,
            `Nota de IA Comercial: ${action.note}`,
            now
          )
          .run();

        if (action.reply) {
          deliveryResult = await deliverOutboundMessage({
            env,
            lead,
            text: action.reply,
            imageUrl: action.image_url,
            credentials,
            now,
          });
        }
        return { executed: true, action, deliveryResult };
      }

      case 'handoff': {
        await env.DB.prepare(`
          UPDATE leads 
          SET handoff_at = ?, handoff_reason = 'modelo', updated_at = ? 
          WHERE id = ?
        `)
          .bind(now, now, leadId)
          .run();

        await env.DB.prepare(`
          INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
          VALUES (?, ?, 'ai_generated', ?, ?)
        `)
          .bind(
            `act_${crypto.randomUUID().slice(0, 8)}`,
            leadId,
            `IA transfirió la conversación a un asesor humano. Razón: ${action.reason || 'Solicitud de intervención humana'}`,
            now
          )
          .run();

        if (action.farewell) {
          deliveryResult = await deliverOutboundMessage({
            env,
            lead,
            text: action.farewell,
            credentials,
            now,
          });
        }
        return { executed: true, action, deliveryResult };
      }

      case 'reply': {
        deliveryResult = await deliverOutboundMessage({
          env,
          lead,
          text: action.text,
          imageUrl: action.image_url,
          credentials,
          now,
        });
        return { executed: true, action, deliveryResult };
      }
    }
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
    await env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
      VALUES (?, ?, 'whatsapp_sent', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        lead.id,
        imageUrl
          ? `Respuesta de IA con imagen enviada por WhatsApp (ID: ${waMessageId}): "${text.slice(0, 80)}..."`
          : `Respuesta de IA enviada por WhatsApp (ID: ${waMessageId}): "${text.slice(0, 80)}..."`,
        now
      )
      .run();
  } else if (metaError && credentials) {
    await env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
      VALUES (?, ?, 'note', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        lead.id,
        `[Alerta Meta WhatsApp] Falló la entrega del mensaje al número ${lead.phone}: ${metaError}`,
        now
      )
      .run();
  }

  return {
    sentToMeta: Boolean(waMessageId),
    waMessageId: waMessageId || undefined,
    error: metaError || undefined,
  };
}
