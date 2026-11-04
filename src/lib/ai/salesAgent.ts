import { z } from 'zod';
import { Env, Lead, WhatsAppMessage, LeadStatus } from '../types';
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
 * Extracción robusta de JSON a partir de respuestas
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
    try {
      return JSON.parse(c);
    } catch {
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
 * Historial en activity_logs retirado (no-op seguro)
 */
async function safeLogActivity(
  _env: Env,
  _id: string,
  _leadId: string,
  _actionType: string,
  _details: string,
  _now: string
): Promise<void> {
  return;
}

/**
 * Despachador limpio que delega el turno de conversación al microservicio de IA (ai-micro)
 * y persiste el estado, nombre, disciplinas y mensaje en D1 y Meta WhatsApp.
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

    // 2. Verificar toggle global de WhatsApp si existe configuración
    try {
      const settings = await env.DB.prepare(
        'SELECT ai_enabled FROM whatsapp_settings ORDER BY created_at DESC LIMIT 1'
      ).first<{ ai_enabled: number }>();

      if (settings && settings.ai_enabled === 0) {
        console.log('[Sales Agent] Toggle global de IA está apagado');
        return { executed: false, error: 'IA global apagada' };
      }
    } catch {
      // Ignorar si no existe tabla
    }

    // 3. Obtener historial reciente de mensajes
    const messagesRows = await env.DB.prepare(`
      SELECT sender, content, message_type, created_at 
      FROM whatsapp_messages 
      WHERE lead_id = ? 
      ORDER BY created_at DESC 
      LIMIT 12
    `)
      .bind(leadId)
      .all<WhatsAppMessage>();

    const rawHistory = (messagesRows.results || []).reverse();
    const history = rawHistory
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => ({
        role: m.sender === 'lead' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    const microserviceUrl = (
      env.AI_MICROSERVICE_URL ||
      (typeof process !== 'undefined' ? process.env?.AI_MICROSERVICE_URL : undefined)
    )?.trim()?.replace(/\/+$/, '');

    let action: AgentAction | undefined;

    // 4. Delegar al microservicio autónomo de IA (POST /chat)
    if (microserviceUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${microserviceUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lead: {
              id: lead.id,
              name: lead.full_name,
              phone: lead.phone,
              status: lead.status,
            },
            history,
            message: incomingText,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = (await response.json()) as any;
          if (data && (data.reply || data.reply_text)) {
            action = {
              action: data.action === 'handoff' ? 'handoff' : 'reply',
              reply_text: data.reply || data.reply_text,
              detected_name: data.detectedName || data.detected_name || undefined,
              detected_disciplines: data.detectedDisciplines || data.detected_disciplines || [],
              handoff_reason: data.action === 'handoff' ? 'Solicitud detectada por microservicio de IA' : undefined,
              suggested_status: lead.status === 'nuevo' ? 'contactado' : lead.status,
            };
            console.log(`[Sales Agent] Respuesta procesada con éxito por microservicio externo de IA (${microserviceUrl})`);
          } else {
            console.warn('[Sales Agent] Microservicio de IA respondió sin texto de respuesta válido');
          }
        } else {
          console.warn(`[Sales Agent] Microservicio de IA respondió con estado HTTP ${response.status}`);
        }
      } catch (microErr: any) {
        console.warn(`[Sales Agent] Fallo al consultar microservicio de IA (${microserviceUrl}):`, microErr?.message || microErr);
      }
    }

    // 5. Respuesta directa simple de contingencia si el microservicio falla o no está configurado
    if (!action) {
      console.warn('[Sales Agent] Microservicio no disponible o no configurado. Usando respuesta directa de contingencia.');
      const lower = incomingText.toLowerCase();
      const wantsHuman = /humano|asesor|agente|persona|reclamo|queja|supervisor/i.test(lower);
      if (wantsHuman) {
        action = {
          action: 'handoff',
          reply_text: 'Te comunico enseguida con uno de nuestros asesores para atenderte personalmente por aquí.',
          handoff_reason: 'Solicitud de atención humana',
          suggested_status: lead.status === 'nuevo' ? 'contactado' : lead.status,
        };
      } else {
        const nameMatch = incomingText.match(/(?:me llamo|mi nombre es|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
        const detectedName = nameMatch ? nameMatch[1].trim() : undefined;

        const detectedDisciplines: string[] = [];
        if (/gym|pesas|musculaci[oó]n/i.test(lower)) detectedDisciplines.push('Gym');
        if (/nataci[oó]n|pileta|piscina/i.test(lower)) detectedDisciplines.push('Natación');
        if (/crossfit|box/i.test(lower)) detectedDisciplines.push('CrossFit');
        if (/p[aá]del|paddle/i.test(lower)) detectedDisciplines.push('Pádel');
        if (/pilates/i.test(lower)) detectedDisciplines.push('Pilates');
        if (/yoga/i.test(lower)) detectedDisciplines.push('Yoga');

        action = {
          action: 'reply',
          reply_text: 'Hola, en este momento un asesor atenderá tu consulta personalmente.',
          detected_name: detectedName,
          detected_disciplines: detectedDisciplines.length > 0 ? detectedDisciplines : undefined,
          suggested_status: lead.status === 'nuevo' ? 'contactado' : lead.status,
        };
      }
    }

    const now = new Date().toISOString();

    // 6. PERSISTENCIA EN D1 DE ENTIDADES DETECTADAS

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
          }
        }
      } catch (actErr) {
        console.warn('[Sales Agent] Error registrando disciplinas del lead:', actErr);
      }
    }

    // D) Actualización de Etiquetas (suggested_tags) si fueron proporcionadas
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

    // E) Guardado de Notas Comerciales si fueron proporcionadas
    const noteContent = getActionNote(action);
    if (noteContent) {
      const existingSummary = lead.notes_summary ? `${lead.notes_summary}\n` : '';
      const updatedSummary = `${existingSummary}[IA ${now.slice(0, 10)}]: ${noteContent}`;

      await env.DB.prepare('UPDATE leads SET notes_summary = ?, updated_at = ? WHERE id = ?')
        .bind(updatedSummary, now, leadId)
        .run();
      lead.notes_summary = updatedSummary;
    }

    // 7. GESTIÓN DE ACCIÓN FINAL (HANDOFF / REPLY / NONE)
    const isHandoff = action.action === 'handoff' || Boolean(action.handoff_reason);

    if (isHandoff) {
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

  return {
    sentToMeta: Boolean(waMessageId),
    waMessageId: waMessageId || undefined,
    error: metaError || undefined,
  };
}

// =========================================================================
// Compatibilidad retroactiva para tests legacy (deprecado)
// Toda la inferencia activa y generación de prompt vive en ai-micro
// =========================================================================
export { DEFAULT_BUSINESS_CONTEXT, buildSalesAgentPrompt } from './salesAgentPrompt';
export { generateSmartSalesFallback } from './salesAgentFallback';
export const DEFAULT_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
export const SUPPORTED_AI_MODELS = [
  '@cf/zai-org/glm-4.7-flash',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.2-1b-instruct',
] as const;

export function normalizeAiModel(model?: string | null): string {
  if (!model || typeof model !== 'string') return DEFAULT_AI_MODEL;
  const trimmed = model.trim();
  if (!trimmed || trimmed.includes('llama-3.1-8b')) return DEFAULT_AI_MODEL;

  if (trimmed.startsWith('@cf/')) {
    if (trimmed === '@cf/meta/llama-3.3-70b-instruct') {
      return '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    }
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('glm-4.7') || lower.includes('glm') || lower.includes('flash')) {
    return '@cf/zai-org/glm-4.7-flash';
  }
  if (lower.includes('mistral-small') || lower.includes('mistral-3.1') || lower.includes('mistral')) {
    return '@cf/mistralai/mistral-small-3.1-24b-instruct';
  }
  if (lower.includes('llama-3.3') || lower.includes('70b')) {
    return '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  }
  if (lower.includes('llama-3.2-1b') || lower.includes('1b')) {
    return '@cf/meta/llama-3.2-1b-instruct';
  }
  if (lower.includes('llama-3.2-3b') || lower.includes('3b')) {
    return '@cf/meta/llama-3.2-3b-instruct';
  }

  return trimmed.startsWith('@') ? trimmed : `@cf/${trimmed}`;
}

export async function callCloudflareWorkersAi(
  _env?: any,
  _model?: string,
  _messages?: any[],
  _maxTokens?: number,
  _temperature?: number
): Promise<string | null> {
  return null;
}

export async function chatJson<T>(
  _schema?: z.ZodType<T>,
  _messages?: any[],
  _env?: any,
  _model?: string
): Promise<{ ok: true; data: T; raw: string } | { ok: false; error: string; detail: string; lastRaw?: string }> {
  return { ok: false, error: 'deprecated', detail: 'Inferencia local migrada al microservicio ai-micro' };
}

