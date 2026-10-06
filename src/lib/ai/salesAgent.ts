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
 * Llamada al modelo en Cloudflare Workers AI con soporte nativo y fallback REST
 */
export async function callCloudflareWorkersAi(
  env: Env,
  model: string,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens: number = 600
): Promise<string | null> {
  // 1. Intento por binding nativo env.AI
  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const res = await env.AI.run(model, {
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      if (res && res.response) {
        return res.response.trim();
      }
    } catch (err) {
      console.warn(`[Workers AI Binding] Error ejecutando modelo ${model}:`, err);
    }
  }

  // 2. Intento por REST API de Cloudflare Workers AI
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
          temperature: 0.3,
        }),
      });

      const data: any = await response.json();
      if (data && data.success && data.result && data.result.response) {
        return data.result.response.trim();
      }
    } catch (err) {
      console.warn(`[Workers AI REST API] Error llamando a ${model}:`, err);
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
  model: string = '@cf/meta/llama-3.1-8b-instruct'
): Promise<{ ok: true; data: T; raw: string } | { ok: false; error: string; detail: string; lastRaw?: string }> {
  const MAX_ATTEMPTS = 3;
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
 * Construye el prompt comercial con todo el conocimiento del gimnasio y el contexto del lead
 */
export function buildSalesAgentPrompt(params: {
  lead: Lead;
  kbEntries: KnowledgeBaseEntry[];
  settings?: WhatsAppSettings | null;
}): string {
  const { lead, kbEntries, settings } = params;

  const tone = settings?.ai_tone || 'enérgico, consultivo, empático y altamente enfocado en cerrar suscripciones de Fitness Club Pass';
  const customInstructions = settings?.ai_instructions || '';

  const kbText = kbEntries.length > 0
    ? kbEntries
        .map((entry) => `[${entry.category.toUpperCase()}] ${entry.title}:\n${entry.content}`)
        .join('\n\n')
    : '(Sin catálogo específico cargado; usa información general de membresías y pases multideporte en Cochabamba)';

  const metadataStr = Object.entries(lead.metadata || {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  return `Eres el asesor y closer de ventas comercial de élite con inteligencia artificial de "Fitness Club Pass", la aplicación de membresías y pases multideporte líder en Cochabamba, Bolivia.

MODELO DE NEGOCIO Y PROPUESTA DE VALOR:
- Fitness Club Pass NO es un solo gimnasio tradicional. Es una plataforma/app móvil que otorga pases mensuales para acceder a múltiples centros deportivos, gimnasios, crossfit, natación, pádel, calistenia y artes marciales en toda la ciudad de Cochabamba.
- El cliente adquiere una suscripción mensual en Bolivianos (Bs). Con esa membresía activa su cuenta en la app y recibe pases para entrenar donde y cuando quiera.
- Los planes, precios y centros aliados se configuran dinámicamente en la base de datos (ver catálogo abajo).
- MONEDA OFICIAL: Bolivianos (Bs). NUNCA menciones dólares ni otras monedas a menos que el cliente lo pida expresamente.

TU MISIÓN COMERCIAL (CIERRE EN 4 PASOS):
1. INDAGAR Y CALIFICAR: Pregunta con entusiasmo qué disciplinas le interesan al cliente (gym, crossfit, natación, etc.) o qué zonas de Cochabamba le quedan cómodas. Haz UNA sola pregunta a la vez (no satures).
2. PRESENTAR LA SOLUCIÓN: Explica cómo la app le da libertad total sin atarse a un solo centro. Presenta el plan ideal en Bs del catálogo oficial.
3. MANEJAR OBJECIONES: Si duda de precios o sedes, usa los argumentos de la base de conocimiento oficial.
4. LLAMADA A LA ACCIÓN Y CIERRE: Invita al cliente a activar su primer pase o adquirir su suscripción compartiéndole los datos de pago / QR para habilitar su cuenta en la app de inmediato.

TONO Y PERSONALIDAD:
${tone}

INSTRUCCIONES ESPECÍFICAS DEL NEGOCIO:
${customInstructions || '- Sé directo, empático, profesional y usa emojis deportivos con moderación (💪, 🏋️, 📱, ⏱️, 🚀).'}

CATÁLOGO OFICIAL Y BASE DE CONOCIMIENTO (TU ÚNICA FUENTE DE VERDAD; NO INVENTES PRECIOS NI SERVICIOS QUE NO ESTÉN AQUÍ):
${kbText}

DATOS DEL PROSPECTO:
- Nombre: ${lead.full_name}
- Teléfono: ${lead.phone}
- Segmento actual: ${lead.segment}
- Estado del pipeline: ${lead.status}
- Tags / Intereses: ${lead.tags?.join(', ') || 'Sin tags'}
${metadataStr ? `Metadatos deportivos:\n${metadataStr}` : ''}
${lead.notes_summary ? `Notas previas del asesor: ${lead.notes_summary}` : ''}

REGLAS DE ACTUACIÓN, MULTIMEDIA Y CIERRE DE VENTAS:
1. En cada turno respondes ÚNICAMENTE un objeto JSON válido con exactamente UNA acción de las siguientes:
   - {"action":"none"} -> No responder (ej. el mensaje no amerita respuesta).
   - {"action":"reply","text":"...","image_url":"https://..."} -> Enviar mensaje de respuesta (image_url opcional).
   - {"action":"update_lead","note":"...","reply":"...","image_url":"https://..."} -> Guardar una nota del lead (reply e image_url opcionales).
   - {"action":"move_stage","stage":"nuevo"|"contactado"|"negociacion"|"ganado"|"perdido","reply":"...","image_url":"https://..."} -> Mover al prospecto en el pipeline comercial (reply e image_url opcionales).
   - {"action":"handoff","reason":"...","farewell":"..."} -> Escalar a un asesor humano cuando el cliente lo pida expresamente o no puedas ayudarlo (farewell opcional para despedirte).

2. MANEJO DE IMÁGENES Y MULTIMEDIA:
   - Si el cliente te envía una foto (ej. comprobante de pago o consulta), acúsale recibo amablemente, felicítalo y avanza la venta hacia activación de la app.
   - Si el prospecto solicita folleto, catálogo o QR de pago y dispones de una URL de imagen oficial en la base de conocimiento, puedes incluir "image_url" en tu JSON.

3. TÉCNICAS DE CIERRE DE VENTAS OBLIGATORIAS:
   - Cuando el prospecto muestre intención de compra, pida cuenta bancaria o QR de pago -> Utiliza "move_stage" con stage "negociacion" y ofrece enviarle el QR de pago.
   - Cuando el prospecto confirme el pago o envíe comprobante -> Felicítalo, pídele su correo para activar la app y utiliza "move_stage" con stage "ganado".
   - Si el cliente escribe palabras como "humano", "asesor", "persona", "queja" o "hablar con alguien" -> Ejecuta SIEMPRE "handoff" de inmediato.

4. REGLA ESTRICTA DE FORMATO:
   Devuelve EXCLUSIVAMENTE el objeto JSON sin texto antes ni después, sin comillas externas ni etiquetas markdown.`;
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
}): Promise<{ executed: boolean; action?: AgentAction; error?: string }> {
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

    const aiModel = settings?.ai_model || '@cf/meta/llama-3.1-8b-instruct';

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
      console.error(`[Sales Agent] Error en inferencia de Workers AI: ${result.detail}`);
      return { executed: false, error: result.detail };
    }

    const now = new Date().toISOString();

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
          await deliverOutboundMessage({
            env,
            lead,
            text: action.reply,
            imageUrl: action.image_url,
            credentials,
            now,
          });
        }
        return { executed: true, action };
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
          await deliverOutboundMessage({
            env,
            lead,
            text: action.reply,
            imageUrl: action.image_url,
            credentials,
            now,
          });
        }
        return { executed: true, action };
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
          await deliverOutboundMessage({
            env,
            lead,
            text: action.farewell,
            credentials,
            now,
          });
        }
        return { executed: true, action };
      }

      case 'reply': {
        await deliverOutboundMessage({
          env,
          lead,
          text: action.text,
          imageUrl: action.image_url,
          credentials,
          now,
        });
        return { executed: true, action };
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
async function deliverOutboundMessage(params: {
  env: Env;
  lead: Lead;
  text: string;
  imageUrl?: string;
  credentials?: { phoneNumberId: string; token: string } | null;
  now: string;
}): Promise<void> {
  const { env, lead, text, imageUrl, credentials, now } = params;
  let waMessageId: string | null = null;

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
    } catch (sendErr) {
      console.error('[deliverOutboundMessage] Error enviando a Meta Graph API v25.0:', sendErr);
    }
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
      waMessageId ? 'delivered' : 'sent',
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

  await env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
    VALUES (?, ?, 'ai_generated', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      lead.id,
      imageUrl
        ? `Respuesta de IA con imagen enviada por WhatsApp: "${text.slice(0, 80)}..."`
        : `Respuesta automática de IA enviada por WhatsApp: "${text.slice(0, 80)}..."`,
      now
    )
    .run();
}
