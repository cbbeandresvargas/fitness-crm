import { z } from 'zod';
import { Env, Lead, WhatsAppMessage, KnowledgeBaseEntry, WhatsAppSettings, LeadStatus } from '../types';
import { sendMetaTextMessage, sendMetaImageMessage } from '../meta/client';
import { autoAssignAgent } from '../rules';
import { normalizeActivityName } from '../activities';
import { generateSmartSalesFallback } from './salesAgentFallback';
import { buildSalesAgentPrompt, DEFAULT_BUSINESS_CONTEXT } from './salesAgentPrompt';

// El motor de contingencia comercial vive en ./salesAgentFallback (extraído para
// separar responsabilidades). Se re-exporta para conservar la API pública del módulo.
export { generateSmartSalesFallback };

// El constructor del prompt comercial y su contexto por defecto viven en
// ./salesAgentPrompt (extraídos para separar responsabilidades). Se re-exportan
// para conservar la API pública del módulo.
export { buildSalesAgentPrompt, DEFAULT_BUSINESS_CONTEXT };

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
  maxTokens: number = 300
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
          temperature: 0.2,
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
            temperature: 0.2,
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

    const raw = await callCloudflareWorkersAi(env, model, attemptMessages, 300);
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
      action = generateSmartSalesFallback({ lead, incomingText, kbEntries, settings });
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
