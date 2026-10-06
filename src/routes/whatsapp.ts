import { Hono } from 'hono';
import { Env, SessionData, Lead, WhatsAppSettings, KnowledgeBaseEntry, ConversationSummary } from '../lib/types';
import { encryptSecret, decryptSecret, verifyMetaSignature, tokenLast4 } from '../lib/crypto';
import { requireAuth, requireAdmin } from '../lib/auth';
import {
  sendMetaTextMessage,
  sendMetaImageMessage,
  getMetaPhoneNumberDetails,
  MetaApiError,
  normalizeRecipient,
  graphRequest,
} from '../lib/meta/client';
import { runSalesAgentTurn } from '../lib/ai/salesAgent';

export const whatsappRoutes = new Hono<{ Bindings: Env; Variables: { user?: SessionData } }>();

// Excluir webhook público de Meta y proxy de media, proteger todas las demás rutas de WhatsApp
whatsappRoutes.use('/api/whatsapp/*', async (c, next) => {
  if (c.req.path === '/api/whatsapp/webhook' || c.req.path.startsWith('/api/whatsapp/media/')) {
    return next();
  }
  return requireAuth(c, next);
});

// Configuración y pruebas de conectividad de WhatsApp requieren rol Administrador
whatsappRoutes.use('/api/whatsapp/config', requireAdmin);
whatsappRoutes.use('/api/whatsapp/test-connection', requireAdmin);

// Base de conocimiento: lectura autenticada, creación y borrado sólo administradores
whatsappRoutes.use('/api/knowledge-base', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireAdmin(c, next);
  }
  return requireAuth(c, next);
});
whatsappRoutes.use('/api/knowledge-base/*', requireAdmin);


/**
 * Obtiene las credenciales activas de WhatsApp directamente desde variables de entorno
 * para máxima seguridad (un solo número de negocio, sin almacenar tokens en BD)
 */
async function getActiveMetaCredentials(env: Env): Promise<{
  phoneNumberId: string;
  token: string;
  verifyToken: string;
  appSecret?: string;
  wabaId?: string;
} | null> {
  let token = env.META_WA_ACCESS_TOKEN?.trim() || '';
  let phoneNumberId = env.META_WA_PHONE_NUMBER_ID?.trim() || '';
  let verifyToken = env.META_WA_VERIFY_TOKEN?.trim() || 'fitnessclub_secure_verify_token_2026';
  let appSecret = env.META_APP_SECRET?.trim() || undefined;
  let wabaId = env.META_WA_WABA_ID?.trim() || undefined;

  // Respaldo desde base de datos si faltan en variables de entorno
  if (!phoneNumberId || !token) {
    try {
      const settings = await env.DB.prepare(
        'SELECT phone_number_id, waba_id, verify_token FROM whatsapp_settings WHERE id = "ws_default"'
      ).first<any>();
      if (!phoneNumberId && settings?.phone_number_id) {
        phoneNumberId = settings.phone_number_id;
      }
      if (!wabaId && settings?.waba_id) {
        wabaId = settings.waba_id;
      }
    } catch {
      // ignore
    }
  }

  if (!phoneNumberId || !token) {
    return null;
  }

  return {
    phoneNumberId,
    token,
    verifyToken,
    appSecret,
    wabaId,
  };
}

/**
 * 1. WEBHOOK HANDSHAKE (GET): Meta valida la URL del webhook
 */
whatsappRoutes.get('/api/whatsapp/webhook', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  console.log(`[Meta Webhook GET] mode: ${mode}, token: ${token}`);

  const creds = await getActiveMetaCredentials(c.env);
  const expectedToken = creds?.verifyToken || c.env.META_WA_VERIFY_TOKEN || 'fitnessclub_secure_verify_token_2026';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[Meta Webhook GET] Verificación de webhook exitosa.');
    return c.text(challenge || '', 200);
  }

  console.warn('[Meta Webhook GET] Token de verificación inválido.');
  return c.text('Forbidden', 403);
});

/**
 * 2. WEBHOOK EVENT INGESTION (POST): Recepción de mensajes y cambios de estado de Meta
 */
whatsappRoutes.post('/api/whatsapp/webhook', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');

  const creds = await getActiveMetaCredentials(c.env);
  const appSecret = creds?.appSecret || c.env.META_APP_SECRET;

  // Validación estricta de firma HMAC de Meta (fail-closed)
  const isValid = verifyMetaSignature(rawBody, signature, appSecret);
  if (!isValid) {
    console.warn('[Meta Webhook POST] Firma x-hub-signature-256 inválida o appSecret ausente.');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  try {
    const now = new Date().toISOString();

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // A) Procesar actualizaciones de estado de mensajes enviados (sent, delivered, read)
        if (Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            const waId = st.id;
            const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
            if (waId && ['sent', 'delivered', 'read', 'failed'].includes(status)) {
              await c.env.DB.prepare(`
                UPDATE whatsapp_messages 
                SET status = ? 
                WHERE whatsapp_message_id = ?
              `)
                .bind(status, waId)
                .run();
            }
          }
        }

        // B) Procesar mensajes entrantes (Inbound Messages)
        if (Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            const waMessageId = msg.id;
            const senderPhone = `+${msg.from}`;
            const contactProfile = value.contacts?.find((ct: any) => ct.wa_id === msg.from);
            const profileName = contactProfile?.profile?.name || null;
            const msgType = msg.type || 'text';
            const content = msg.text?.body || (msgType === 'image' ? (msg.image?.caption ? `[Foto: ${msg.image.caption}]` : '[Foto recibida]') : 'Archivo multimedia');
            const mediaUrl = msgType === 'image' && msg.image?.id ? `/api/whatsapp/media/${msg.image.id}` : null;

            // 1. Idempotencia: Verificar si el mensaje ya fue procesado
            const existing = await c.env.DB.prepare(
              'SELECT id FROM whatsapp_messages WHERE whatsapp_message_id = ?'
            )
              .bind(waMessageId)
              .first();

            if (existing) {
              console.log(`[Meta Webhook] Mensaje ${waMessageId} ya procesado previamente. Ignorando.`);
              continue;
            }

            // 2. Buscar o auto-crear prospecto (Lead)
            let lead = await c.env.DB.prepare('SELECT * FROM leads WHERE phone = ?')
              .bind(senderPhone)
              .first<Lead>();

            if (!lead) {
              // También probar con normalización alternativa sin '+'
              const clean = normalizeRecipient(senderPhone);
              lead = await c.env.DB.prepare(
                'SELECT * FROM leads WHERE phone LIKE ? OR phone LIKE ?'
              )
                .bind(`%${clean.slice(-10)}`, `%${clean}%`)
                .first<Lead>();
            }

            if (!lead) {
              // Auto-creación de prospecto nuevo desde WhatsApp
              const newLeadId = `lead_${crypto.randomUUID().slice(0, 8)}`;
              const leadName = profileName ? profileName.trim() : `WhatsApp ${senderPhone.slice(-4)}`;

              await c.env.DB.prepare(`
                INSERT INTO leads (
                  id, full_name, phone, status, segment, tags, metadata, last_contacted_at, last_inbound_at, ai_enabled, created_at, updated_at
                ) VALUES (?, ?, ?, 'nuevo', 'B', '["WhatsApp Inbound"]', '{}', ?, ?, 1, ?, ?)
              `)
                .bind(newLeadId, leadName, senderPhone, now, now, now, now)
                .run();

              await c.env.DB.prepare(`
                INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
                VALUES (?, ?, 'creation', 'Prospecto creado automáticamente desde mensaje entrante de WhatsApp.', ?)
              `)
                .bind(`act_${crypto.randomUUID().slice(0, 8)}`, newLeadId, now)
                .run();

              lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?')
                .bind(newLeadId)
                .first<Lead>();
            } else {
              // Actualizar timestamp de último mensaje entrante
              await c.env.DB.prepare(`
                UPDATE leads 
                SET last_inbound_at = ?, last_contacted_at = ?, updated_at = ? 
                WHERE id = ?
              `)
                .bind(now, now, now, lead.id)
                .run();
            }

            if (!lead) continue;

            // 3. Insertar mensaje en whatsapp_messages
            const msgDbId = `msg_${crypto.randomUUID().slice(0, 8)}`;
            await c.env.DB.prepare(`
              INSERT INTO whatsapp_messages (
                id, lead_id, user_id, sender, message_type, content, media_url, status, whatsapp_message_id, ai_generated, raw_payload, created_at
              ) VALUES (?, ?, NULL, 'lead', ?, ?, ?, 'delivered', ?, 0, ?, ?)
            `)
              .bind(
                msgDbId,
                lead.id,
                msgType,
                content,
                mediaUrl,
                waMessageId,
                JSON.stringify(msg),
                now
              )
              .run();

            await c.env.DB.prepare(`
              INSERT INTO activity_logs (id, lead_id, action_type, details, created_at)
              VALUES (?, ?, 'whatsapp_sent', ?, ?)
            `)
              .bind(
                `act_${crypto.randomUUID().slice(0, 8)}`,
                lead.id,
                `WhatsApp recibido de ${lead.full_name}: "${content.slice(0, 80)}"`,
                now
              )
              .run();

            // 4. Disparar turno del Agente de Ventas con Cloudflare Workers AI
            if (lead.ai_enabled === 1 && !lead.handoff_at) {
              console.log(`[Sales Agent] Disparando turno de IA para lead ${lead.id} (${lead.full_name})...`);
              const aiIncomingText = msgType === 'image'
                ? (msg.image?.caption
                    ? `[El prospecto envió una foto con el texto: "${msg.image.caption}"]`
                    : `[El prospecto envió una foto]`)
                : content;

              const aiPromise = runSalesAgentTurn({
                env: c.env,
                leadId: lead.id,
                incomingText: aiIncomingText,
                credentials: creds,
              })
                .then((aiRes) => {
                  if (aiRes.executed) {
                    console.log(`[Sales Agent] Turno de IA finalizado con éxito para ${lead.id}. Acción: ${aiRes.action?.action}`);
                  } else {
                    console.warn(`[Sales Agent] Turno de IA no ejecutado para ${lead.id}: ${aiRes.error}`);
                  }
                })
                .catch((aiErr) => {
                  console.error('[Sales Agent] Error ejecutando turno de IA:', aiErr);
                });

              if (c.executionCtx && typeof c.executionCtx.waitUntil === 'function') {
                c.executionCtx.waitUntil(aiPromise);
              } else {
                await aiPromise;
              }
            }
          }
        }
      }
    }
  } catch (procErr) {
    console.error('[Meta Webhook POST] Error procesando evento de webhook:', procErr);
  }

  // Responde 200 inmediatamente a Meta tras persistir en DB
  return c.json({ success: true }, 200);
});

/**
 * 2.1 PROXY Y CACHÉ DE MEDIA ENTRANTE DE WHATSAPP (R2 + META GRAPH API v25.0)
 * Descarga el binario de Meta usando el token del servidor y lo almacena permanentemente en Cloudflare R2
 */
whatsappRoutes.get('/api/whatsapp/media/:mediaId', async (c) => {
  const mediaId = c.req.param('mediaId');
  if (!mediaId || !/^[\w.-]{1,64}$/.test(mediaId)) {
    return c.text('Media ID inválido', 400);
  }

  const r2Key = `wa-inbound-media/${mediaId}`;

  // 1. Intentar servir desde la caché durable de Cloudflare R2
  if (c.env.STORAGE && typeof c.env.STORAGE.get === 'function') {
    try {
      const cached = await c.env.STORAGE.get(r2Key);
      if (cached) {
        const headers = new Headers();
        headers.set('Content-Type', cached.httpMetadata?.contentType || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=604800, immutable');
        return new Response(cached.body, { headers });
      }
    } catch (cacheErr) {
      console.warn('[Media Proxy] Error leyendo de R2:', cacheErr);
    }
  }

  // 2. Obtener credenciales activas de Meta
  const creds = await getActiveMetaCredentials(c.env);
  if (!creds?.token) {
    return c.text('Credenciales de Meta no configuradas', 503);
  }

  try {
    // 3. Consultar metadata del media a Meta Graph API v25.0
    const metaRes = await graphRequest<{ url?: string; mime_type?: string }>(
      mediaId,
      { method: 'GET', token: creds.token },
      c.env
    );

    if (!metaRes?.url) {
      return c.text('Meta no devolvió la URL de descarga del adjunto', 404);
    }

    // 4. Descargar el binario desde Meta Lookaside con Bearer token
    const dlRes = await fetch(metaRes.url, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });

    if (!dlRes.ok) {
      return c.text(`Fallo al descargar adjunto desde Meta (${dlRes.status})`, 502);
    }

    const mimeType = metaRes.mime_type || dlRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await dlRes.arrayBuffer();

    // 5. Guardar en R2 para que quede permanente (Meta expira los enlaces tras ~30 días)
    if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
      try {
        await c.env.STORAGE.put(r2Key, arrayBuffer, {
          httpMetadata: { contentType: mimeType },
        });
      } catch (putErr) {
        console.warn('[Media Proxy] Error guardando en R2:', putErr);
      }
    }

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Cache-Control', 'public, max-age=604800, immutable');
    return new Response(arrayBuffer, { headers });
  } catch (err: any) {
    console.error('[Media Proxy] Error procesando descarga de media:', err);
    return c.text(err.message || 'Error descargando archivo de Meta', 500);
  }
});

/**
 * 3. OBTENER CONFIGURACIÓN DE WHATSAPP Y ESTADO (VÍA VARIABLES DE ENTORNO)
 */
whatsappRoutes.get('/api/whatsapp/config', async (c) => {
  const settings = await c.env.DB.prepare(
    'SELECT * FROM whatsapp_settings ORDER BY created_at DESC LIMIT 1'
  ).first<WhatsAppSettings>();

  const host = c.req.header('host') || 'fitness-crm.workers.dev';
  const proto = c.req.header('x-forwarded-proto') || 'https';
  const webhookUrl = `${proto}://${host}/api/whatsapp/webhook`;

  const envToken = c.env.META_WA_ACCESS_TOKEN?.trim() || '';
  const envPhoneId = c.env.META_WA_PHONE_NUMBER_ID?.trim() || '';
  const isEnvConfigured = Boolean(envToken && envPhoneId);

  return c.json({
    settings: {
      waba_id: c.env.META_WA_WABA_ID || '',
      phone_number_id: envPhoneId,
      display_phone_number: settings?.display_phone_number || '',
      verified_name: settings?.verified_name || '',
      tokenLast4: tokenLast4(envToken),
      status: isEnvConfigured ? 'connected' : 'disconnected',
      verify_token: c.env.META_WA_VERIFY_TOKEN || 'fitnessclub_secure_verify_token_2026',
      ai_enabled: settings?.ai_enabled ?? 1,
      ai_model: settings?.ai_model || '@cf/meta/llama-3.2-3b-instruct',
      ai_tone: settings?.ai_tone || 'enérgico, motivador, empático y altamente enfocado en cerrar ventas',
      ai_instructions: settings?.ai_instructions || '',
      env_configured: isEnvConfigured,
    },
    webhook: {
      url: webhookUrl,
      verify_token: c.env.META_WA_VERIFY_TOKEN || 'fitnessclub_secure_verify_token_2026',
      graph_version: c.env.META_GRAPH_API_VERSION || 'v25.0',
    },
  });
});

/**
 * 4. ACTUALIZAR AJUSTES DE IA Y PERSONALIDAD COMERCIAL
 * (Las credenciales de WhatsApp se mantienen seguras en variables de entorno)
 */
whatsappRoutes.post('/api/whatsapp/config', async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Solo administradores pueden configurar WhatsApp' }, 403);
  }

  const body = await c.req.json();
  const { ai_enabled, ai_model, ai_tone, ai_instructions } = body;

  const id = 'ws_default';
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO whatsapp_settings (
      id, ai_enabled, ai_model, ai_tone, ai_instructions, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ai_enabled = excluded.ai_enabled,
      ai_model = excluded.ai_model,
      ai_tone = excluded.ai_tone,
      ai_instructions = excluded.ai_instructions,
      updated_at = excluded.updated_at
  `)
    .bind(
      id,
      ai_enabled !== undefined ? (ai_enabled ? 1 : 0) : 1,
      ai_model || '@cf/meta/llama-3.2-3b-instruct',
      ai_tone || 'enérgico, motivador, empático y altamente enfocado en cerrar ventas',
      ai_instructions || null,
      now,
      now
    )
    .run();

  return c.json({ success: true });
});

/**
 * 5. TEST DE CONEXIÓN CON META GRAPH API v25.0 USANDO VARIABLES DE ENTORNO
 */
whatsappRoutes.post('/api/whatsapp/test-connection', async (c) => {
  const creds = await getActiveMetaCredentials(c.env);

  if (!creds?.token || !creds?.phoneNumberId) {
    return c.json({
      success: false,
      error: 'Variables META_WA_PHONE_NUMBER_ID y META_WA_ACCESS_TOKEN no configuradas en el entorno',
    }, 400);
  }

  try {
    const details = await getMetaPhoneNumberDetails({
      phoneNumberId: creds.phoneNumberId,
      token: creds.token,
      env: c.env,
    });

    // Guardar nombre y teléfono verificado para visualización en el CRM
    if (details.display_phone_number || details.verified_name) {
      await c.env.DB.prepare(`
        UPDATE whatsapp_settings 
        SET display_phone_number = ?, verified_name = ?, status = 'connected', updated_at = ?
        WHERE id = 'ws_default'
      `)
        .bind(details.display_phone_number || null, details.verified_name || null, new Date().toISOString())
        .run();
    }

    return c.json({
      success: true,
      details,
      version: c.env.META_GRAPH_API_VERSION || 'v25.0',
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: err.message || 'Fallo de autenticación con Meta Graph API v25.0',
      status: err instanceof MetaApiError ? err.status : 500,
    }, 400);
  }
});

/**
 * 5.1 DIAGNÓSTICO EN TIEMPO REAL DEL SISTEMA (META WHATSAPP + WORKERS AI + D1)
 */
whatsappRoutes.get('/api/whatsapp/diagnostics', async (c) => {
  const creds = await getActiveMetaCredentials(c.env);

  // A) Test Meta Graph API
  let metaStatus: {
    status: 'ok' | 'error';
    phone_number_id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    error?: string;
  } = { status: 'error', error: 'Credenciales no configuradas' };

  if (creds?.phoneNumberId && creds?.token) {
    try {
      const details = await getMetaPhoneNumberDetails({
        phoneNumberId: creds.phoneNumberId,
        token: creds.token,
        env: c.env,
      });
      metaStatus = {
        status: 'ok',
        phone_number_id: details.id,
        display_phone_number: details.display_phone_number,
        verified_name: details.verified_name,
        quality_rating: details.quality_rating,
      };
    } catch (err: any) {
      metaStatus = {
        status: 'error',
        phone_number_id: creds.phoneNumberId,
        error: err.message || 'Error conectando con Meta Graph API',
      };
    }
  }

  // B) Test Cloudflare Workers AI
  let aiStatus: {
    status: 'ok' | 'error';
    model: string;
    latencyMs: number;
    response?: string;
    error?: string;
  } = { status: 'error', model: '@cf/meta/llama-3.2-3b-instruct', latencyMs: 0 };

  const startAi = Date.now();
  const testModels = ['@cf/meta/llama-3.2-3b-instruct', '@cf/meta/llama-3.2-1b-instruct', '@cf/meta/llama-2-7b-chat-int8'];

  if (c.env.AI && typeof c.env.AI.run === 'function') {
    for (const testModel of testModels) {
      try {
        const testRes = await c.env.AI.run(testModel, {
          messages: [{ role: 'user', content: 'Di "OK" únicamente' }],
          max_tokens: 10,
        });
        aiStatus = {
          status: 'ok',
          model: testModel,
          latencyMs: Date.now() - startAi,
          response: testRes?.response?.trim() || 'OK',
        };
        break;
      } catch (aiErr: any) {
        aiStatus = {
          status: 'error',
          model: testModel,
          latencyMs: Date.now() - startAi,
          error: aiErr.message || 'Fallo al ejecutar modelo Workers AI',
        };
      }
    }
  } else {
    aiStatus = {
      status: 'error',
      model: '@cf/meta/llama-3.2-3b-instruct',
      latencyMs: Date.now() - startAi,
      error: 'El binding env.AI no está disponible en este entorno',
    };
  }

  // C) Estado de Base de Datos y Pipeline
  const [leadsCountRes, msgsCountRes, kbCountRes, settingsRes] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM leads').first<any>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM whatsapp_messages').first<any>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM knowledge_base WHERE is_active = 1').first<any>(),
    c.env.DB.prepare('SELECT ai_enabled, ai_model FROM whatsapp_settings WHERE id = "ws_default"').first<any>(),
  ]);

  const host = c.req.header('host') || 'fitness-crm.workers.dev';
  const proto = c.req.header('x-forwarded-proto') || 'https';

  return c.json({
    metaApi: metaStatus,
    workersAi: aiStatus,
    database: {
      leadsCount: leadsCountRes?.count || 0,
      messagesCount: msgsCountRes?.count || 0,
      kbEntriesCount: kbCountRes?.count || 0,
      aiEnabledGlobal: settingsRes?.ai_enabled === 1,
      aiModel: settingsRes?.ai_model || '@cf/meta/llama-3.2-3b-instruct',
    },
    webhook: {
      url: `${proto}://${host}/api/whatsapp/webhook`,
      verify_token: c.env.META_WA_VERIFY_TOKEN || 'fitnessclub_secure_verify_token_2026',
    },
  });
});

/**
 * 5.2 SIMULADOR Y TEST EN VIVO DEL AGENTE DE IA PARA UN LEAD
 */
whatsappRoutes.post('/api/whatsapp/leads/:id/test-ai', async (c) => {
  const leadId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const incomingText = (body.incomingText as string)?.trim() || 'Hola, quisiera saber sobre sus planes';
  const sendToWhatsApp = body.sendToWhatsApp === true;

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const creds = await getActiveMetaCredentials(c.env);
  const start = Date.now();

  const result = await runSalesAgentTurn({
    env: c.env,
    leadId: lead.id,
    incomingText,
    credentials: sendToWhatsApp ? creds : null,
  });

  return c.json({
    success: result.executed,
    leadId: lead.id,
    incomingText,
    action: result.action,
    error: result.error,
    deliveryResult: (result as any).deliveryResult,
    sendToWhatsApp,
    durationMs: Date.now() - start,
  });
});

/**
 * 6. BANDEJA DE ENTRADA UNIFICADA (INBOX CONVERSATIONS LIST)
 */
whatsappRoutes.get('/api/whatsapp/inbox', async (c) => {
  const user = c.get('user');

  const params: any[] = [];
  let whereClause = '';

  if (user?.role === 'agent') {
    whereClause = 'WHERE (l.assigned_to = ? OR l.assigned_to IS NULL)';
    params.push(user.userId);
  }

  // Optimización de alto rendimiento para Cloudflare Workers Free (límite de 50ms CPU):
  // Sustitución de 5 subconsultas correlacionadas por CTE con Window Function ROW_NUMBER()
  const query = `
    WITH ranked_messages AS (
      SELECT 
        lead_id,
        content,
        created_at,
        sender,
        status,
        ROW_NUMBER() OVER (PARTITION BY lead_id ORDER BY created_at DESC) as rn
      FROM whatsapp_messages
    ),
    unread_counts AS (
      SELECT 
        lead_id,
        COUNT(*) as unread_count
      FROM whatsapp_messages
      WHERE sender = 'lead' AND status != 'read'
      GROUP BY lead_id
    )
    SELECT 
      l.id as leadId,
      l.full_name as leadName,
      l.phone as leadPhone,
      l.status as leadStatus,
      l.segment as leadSegment,
      l.assigned_to as assignedTo,
      u.name as assignedName,
      l.ai_enabled as aiEnabled,
      l.handoff_at as handoffAt,
      l.handoff_reason as handoffReason,
      rm.content as lastMessageText,
      rm.created_at as lastMessageTime,
      rm.sender as lastMessageSender,
      rm.status as lastMessageStatus,
      COALESCE(uc.unread_count, 0) as unreadCount
    FROM leads l
    JOIN ranked_messages rm ON rm.lead_id = l.id AND rm.rn = 1
    LEFT JOIN unread_counts uc ON uc.lead_id = l.id
    LEFT JOIN users u ON u.id = l.assigned_to
    ${whereClause}
    ORDER BY COALESCE(rm.created_at, l.created_at) DESC 
    LIMIT 50
  `;

  const rows = await c.env.DB.prepare(query).bind(...params).all<any>();
  const conversations: ConversationSummary[] = (rows.results || []).map((r) => ({
    leadId: r.leadId,
    leadName: r.leadName,
    leadPhone: r.leadPhone,
    leadStatus: r.leadStatus,
    leadSegment: r.leadSegment,
    assignedTo: r.assignedTo,
    assignedName: r.assignedName,
    lastMessageText: r.lastMessageText || 'Sin mensajes aún',
    lastMessageTime: r.lastMessageTime || '',
    lastMessageSender: r.lastMessageSender || 'system',
    lastMessageStatus: r.lastMessageStatus || 'sent',
    unreadCount: r.unreadCount || 0,
    aiEnabled: r.aiEnabled === 1,
    isHandoff: Boolean(r.handoffAt),
    handoffReason: r.handoffReason,
  }));

  return c.json({ conversations });
});

/**
 * 7. CHAT EN VIVO DE UN LEAD ESPECÍFICO (CON POLL / SINCRONIZACIÓN)
 */
whatsappRoutes.get('/api/whatsapp/leads/:id/chat', async (c) => {
  const leadId = c.req.param('id');
  const since = c.req.query('since');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  let query = `
    SELECT m.*, u.name as user_name 
    FROM whatsapp_messages m 
    LEFT JOIN users u ON u.id = m.user_id 
    WHERE m.lead_id = ?
  `;
  const params: any[] = [leadId];

  if (since) {
    query += ' AND m.created_at > ?';
    params.push(since);
  }

  query += ' ORDER BY m.created_at ASC';

  const res = await c.env.DB.prepare(query).bind(...params).all();

  // Marcar como leídos los mensajes del lead si los ve el asesor
  if (!since) {
    await c.env.DB.prepare(`
      UPDATE whatsapp_messages 
      SET status = 'read' 
      WHERE lead_id = ? AND sender = 'lead' AND status != 'read'
    `)
      .bind(leadId)
      .run();
  }

  return c.json({
    lead: {
      id: lead.id,
      full_name: lead.full_name,
      phone: lead.phone,
      status: lead.status,
      segment: lead.segment,
      ai_enabled: lead.ai_enabled === 1,
      is_handoff: Boolean(lead.handoff_at),
      handoff_reason: lead.handoff_reason,
    },
    messages: res.results || [],
  });
});

/**
 * 8. ENVIAR MENSAJE MANUAL DESDE EL CRM VÍA META GRAPH API v25.0
 */
whatsappRoutes.post('/api/whatsapp/leads/:id/send', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.json();

  const text = (body.text as string)?.trim() || '';
  const imageUrl = (body.image_url as string)?.trim() || null;

  if (!text && !imageUrl) {
    return c.json({ error: 'Contenido o imagen requerida' }, 400);
  }

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const creds = await getActiveMetaCredentials(c.env);
  let waMessageId: string | null = null;
  let sendError: string | null = null;

  if (creds) {
    try {
      if (imageUrl) {
        const res = await sendMetaImageMessage({
          phoneNumberId: creds.phoneNumberId,
          token: creds.token,
          to: lead.phone,
          imageUrl,
          caption: text || undefined,
          env: c.env,
        });
        waMessageId = res.messageId;
      } else {
        const res = await sendMetaTextMessage({
          phoneNumberId: creds.phoneNumberId,
          token: creds.token,
          to: lead.phone,
          text,
          env: c.env,
        });
        waMessageId = res.messageId;
      }
    } catch (metaErr: any) {
      console.error('[Manual Send] Error enviando con Meta Graph API v25.0:', metaErr);
      sendError = metaErr.message;
    }
  }

  const msgId = `msg_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO whatsapp_messages (
      id, lead_id, user_id, sender, message_type, content, media_url, status, whatsapp_message_id, ai_generated, created_at
    ) VALUES (?, ?, ?, 'agent', ?, ?, ?, ?, ?, 0, ?)
  `)
    .bind(
      msgId,
      leadId,
      user?.userId || null,
      imageUrl ? 'image' : 'text',
      text || 'Imagen enviada',
      imageUrl,
      waMessageId ? 'delivered' : 'sent',
      waMessageId,
      now
    )
    .run();

  await c.env.DB.prepare(`
    UPDATE leads 
    SET last_contacted_at = ?, updated_by = ?, updated_at = ? 
    WHERE id = ?
  `)
    .bind(now, user?.userId || null, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'whatsapp_sent', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user?.userId || null,
      `WhatsApp enviado por ${user?.name || 'Asesor'}: "${(text || 'Imagen').slice(0, 80)}"`,
      now
    )
    .run();

  return c.json({
    success: true,
    messageId: msgId,
    waMessageId,
    metaSendError: sendError,
  });
});

/**
 * 9. TOGGLE DE IA O TOMA DE CONTROL MANUAL (HANDOFF)
 */
whatsappRoutes.post('/api/whatsapp/leads/:id/toggle-ai', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.json();
  const { enabled, resumeHandoff } = body;

  const lead = await c.env.DB.prepare('SELECT id, full_name, ai_enabled, handoff_at FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const now = new Date().toISOString();

  if (resumeHandoff) {
    // Asesor devuelve el control a la IA
    await c.env.DB.prepare(`
      UPDATE leads 
      SET handoff_at = NULL, handoff_reason = NULL, ai_enabled = 1, updated_at = ? 
      WHERE id = ?
    `)
      .bind(now, leadId)
      .run();

    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
      VALUES (?, ?, ?, 'ai_generated', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        user?.userId || null,
        `${user?.name || 'Asesor'} reactivó la atención automática de IA para este prospecto.`,
        now
      )
      .run();

    return c.json({ success: true, ai_enabled: true, is_handoff: false });
  }

  // Pausar o activar IA
  const newAiState = enabled !== undefined ? (enabled ? 1 : 0) : (lead.ai_enabled ? 0 : 1);
  const handoffAt = newAiState === 0 ? now : null;
  const handoffReason = newAiState === 0 ? 'manual' : null;

  await c.env.DB.prepare(`
    UPDATE leads 
    SET ai_enabled = ?, handoff_at = ?, handoff_reason = ?, updated_at = ? 
    WHERE id = ?
  `)
    .bind(newAiState, handoffAt, handoffReason, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'ai_generated', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user?.userId || null,
      newAiState === 1
        ? `${user?.name || 'Asesor'} activó la IA de ventas para este chat.`
        : `${user?.name || 'Asesor'} tomó control manual del chat (IA en pausa).`,
      now
    )
    .run();

  return c.json({
    success: true,
    ai_enabled: newAiState === 1,
    is_handoff: newAiState === 0,
  });
});

/**
 * 10. GESTIÓN DE BASE DE CONOCIMIENTO (KNOWLEDGE BASE)
 */
whatsappRoutes.get('/api/knowledge-base', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM knowledge_base ORDER BY category ASC, created_at DESC'
  ).all<KnowledgeBaseEntry>();

  return c.json({ entries: rows.results || [] });
});

whatsappRoutes.post('/api/knowledge-base', async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Solo administradores pueden editar la base de conocimiento' }, 403);
  }

  const body = await c.req.json();
  const { id, category, title, content, is_active } = body;

  if (!category || !title || !content) {
    return c.json({ error: 'Categoría, título y contenido son requeridos' }, 400);
  }

  const entryId = id || `kb_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO knowledge_base (id, category, title, content, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      title = excluded.title,
      content = excluded.content,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `)
    .bind(entryId, category, title.trim(), content.trim(), is_active !== undefined ? (is_active ? 1 : 0) : 1, now, now)
    .run();

  return c.json({ success: true, id: entryId });
});

whatsappRoutes.delete('/api/knowledge-base/:id', async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Solo administradores pueden eliminar entradas' }, 403);
  }

  const entryId = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM knowledge_base WHERE id = ?').bind(entryId).run();
  return c.json({ success: true, deletedId: entryId });
});
