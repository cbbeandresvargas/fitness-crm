import { Hono } from 'hono';
import { Env, Lead, User, ActivityLog, MessageTemplate, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizePhone, checkDuplicatePhone, calculateDynamicSegment, autoAssignAgent } from '../lib/rules';
import {
  buildLeadContextPrompt,
  generateAiWhatsAppMessage,
  generateAiLeadBriefing,
  suggestAiTags,
  createWhatsAppDeepLink,
} from '../lib/ai';
import { Layout } from '../views/Layout';
import { DashboardView } from '../views/DashboardView';
import { LeadsView } from '../views/LeadsView';
import { LeadDetailView } from '../views/LeadDetailView';
import { LeadFormView } from '../views/LeadFormView';

export const leadsRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

leadsRoutes.use('*', requireAuth);

/**
 * Dashboard principal
 */
leadsRoutes.get('/', async (c) => {
  const user = c.get('user');

  // RBAC condition for leads
  const isAgent = user.role === 'agent';
  const leadWhere = isAgent ? 'WHERE assigned_to = ?' : '';
  const leadParams = isAgent ? [user.userId] : [];

  // Query counts
  const totalLeadsRes = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM leads ${leadWhere}`)
    .bind(...leadParams)
    .first<{ count: number }>();
  const totalLeads = totalLeadsRes?.count || 0;

  // Segment counts
  const segmentsRes = await c.env.DB.prepare(
    `SELECT segment, COUNT(*) as count FROM leads ${leadWhere} GROUP BY segment`
  )
    .bind(...leadParams)
    .all<{ segment: string; count: number }>();

  const segmentsCount = { A: 0, B: 0, C: 0, D: 0 };
  for (const row of segmentsRes.results || []) {
    if (row.segment in segmentsCount) {
      segmentsCount[row.segment as keyof typeof segmentsCount] = row.count;
    }
  }

  // Status counts
  const statusRes = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM leads ${leadWhere} GROUP BY status`
  )
    .bind(...leadParams)
    .all<{ status: string; count: number }>();

  const statusCount: Record<string, number> = {};
  for (const row of statusRes.results || []) {
    statusCount[row.status] = row.count;
  }

  // Recent activities with lead name
  const activitiesQuery = isAgent
    ? `SELECT a.*, l.full_name as lead_name, u.name as user_name 
       FROM activity_logs a 
       JOIN leads l ON l.id = a.lead_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE l.assigned_to = ?
       ORDER BY a.created_at DESC LIMIT 8`
    : `SELECT a.*, l.full_name as lead_name, u.name as user_name 
       FROM activity_logs a 
       JOIN leads l ON l.id = a.lead_id
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 8`;

  const recentActivitiesRes = await c.env.DB.prepare(activitiesQuery)
    .bind(...leadParams)
    .all<ActivityLog & { lead_name: string }>();

  // Leads needing attention (Segment C or no contact > 10 days)
  const attentionQuery = isAgent
    ? `SELECT * FROM leads WHERE assigned_to = ? AND (segment = 'C' OR status = 'nuevo') ORDER BY created_at DESC LIMIT 5`
    : `SELECT * FROM leads WHERE segment = 'C' OR status = 'nuevo' ORDER BY created_at DESC LIMIT 5`;

  const attentionLeadsRes = await c.env.DB.prepare(attentionQuery)
    .bind(...leadParams)
    .all<Lead>();

  return c.html(
    Layout({
      title: 'Dashboard Fitness CRM',
      user,
      currentPath: '/',
      children: DashboardView({
        user,
        totalLeads,
        segmentsCount,
        statusCount,
        recentActivities: recentActivitiesRes.results || [],
        leadsNeedingAttention: (attentionLeadsRes.results || []).map((l) => ({
          ...l,
          tags: typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags,
          metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata,
        })),
      }),
    })
  );
});

/**
 * Listado y Pipeline de Leads
 */
leadsRoutes.get('/leads', async (c) => {
  const user = c.get('user');
  const search = c.req.query('search')?.trim();
  const segment = c.req.query('segment')?.trim();
  const status = c.req.query('status')?.trim();
  const agentId = c.req.query('agentId')?.trim();
  const tag = c.req.query('tag')?.trim();
  const view = c.req.query('view') || 'table';

  let whereClauses: string[] = [];
  let params: any[] = [];

  // RBAC: Si es agente, solo sus leads
  if (user.role === 'agent') {
    whereClauses.push('l.assigned_to = ?');
    params.push(user.userId);
  } else if (agentId) {
    whereClauses.push('l.assigned_to = ?');
    params.push(agentId);
  }

  if (segment) {
    whereClauses.push('l.segment = ?');
    params.push(segment);
  }

  if (status) {
    whereClauses.push('l.status = ?');
    params.push(status);
  }

  if (tag) {
    whereClauses.push('l.tags LIKE ?');
    params.push(`%"${tag}"%`);
  }

  if (search) {
    whereClauses.push('(l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `
    SELECT l.*, u.name as assigned_name 
    FROM leads l 
    LEFT JOIN users u ON u.id = l.assigned_to 
    ${whereSql} 
    ORDER BY l.created_at DESC
  `;

  const leadsRes = await c.env.DB.prepare(query).bind(...params).all<Lead>();

  // Fetch all agents for filter dropdown
  const agentsRes = await c.env.DB.prepare("SELECT * FROM users WHERE role = 'agent' AND is_active = 1").all<User>();

  // Extract all distinct tags for quick filter chips
  const allLeadsTagsRes = await c.env.DB.prepare('SELECT tags FROM leads').all<{ tags: string }>();
  const tagSet = new Set<string>();
  for (const row of allLeadsTagsRes.results || []) {
    try {
      const parsed = JSON.parse(row.tags || '[]');
      if (Array.isArray(parsed)) {
        parsed.forEach((t) => tagSet.add(t));
      }
    } catch {}
  }

  const parsedLeads: Lead[] = (leadsRes.results || []).map((l) => ({
    ...l,
    tags: typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags,
    metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata,
  }));

  return c.html(
    Layout({
      title: 'Leads & Pipeline',
      user,
      currentPath: '/leads',
      children: LeadsView({
        user,
        leads: parsedLeads,
        agents: agentsRes.results || [],
        filters: { search, segment, status, agentId, tag, view },
        allTags: Array.from(tagSet),
      }),
    })
  );
});

/**
 * Formulario para crear nuevo lead
 */
leadsRoutes.get('/leads/new', async (c) => {
  const user = c.get('user');
  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();

  return c.html(
    Layout({
      title: 'Nuevo Prospecto Fitness',
      user,
      currentPath: '/leads',
      children: LeadFormView({
        user,
        agents: agentsRes.results || [],
      }),
    })
  );
});

/**
 * Registrar nuevo prospecto con validación de duplicados y segmentación
 */
leadsRoutes.post('/leads', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();

  const fullName = (body['full_name'] as string)?.trim();
  const rawPhone = (body['phone'] as string)?.trim();
  const email = (body['email'] as string)?.trim() || null;
  const status = (body['status'] as string) || 'nuevo';
  let assignedTo = body['assigned_to'] as string;
  const tagsStr = (body['tags'] as string) || '';
  const note = (body['initial_note'] as string) || 'Registro inicial';

  // Flexible Metadata fields
  const metadata: Record<string, any> = {
    presupuesto: Number(body['presupuesto']) || 0,
    producto: body['producto'] || 'Membresía General',
    objetivo: body['objetivo'] || 'Acondicionamiento físico',
    ciudad: body['ciudad'] || 'Ciudad de México',
    sede: body['sede'] || 'Principal',
    horario_preferido: body['horario_preferido'] || 'Flexible',
  };

  const normalizedPhone = normalizePhone(rawPhone);

  // 1. Detección estricta de duplicados por teléfono
  const dupCheck = await checkDuplicatePhone(c.env.DB, normalizedPhone);
  if (dupCheck.exists) {
    const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();
    return c.html(
      Layout({
        title: 'Nuevo Prospecto',
        user,
        currentPath: '/leads',
        flash: { type: 'error', message: '¡Número telefónico duplicado detectado!' },
        children: LeadFormView({
          user,
          agents: agentsRes.results || [],
          duplicateWarning: dupCheck.existingLead,
          formData: {
            full_name: fullName,
            phone: rawPhone,
            email: email || '',
            status,
            tags: tagsStr,
            ...metadata,
          },
        }),
      })
    );
  }

  // 2. Asignación automática Round-Robin si se seleccionó 'auto'
  if (assignedTo === 'auto' || !assignedTo) {
    assignedTo = (await autoAssignAgent(c.env.DB)) || user.userId;
  }

  // 3. Segmentación Dinámica (A, B, C, D)
  const { segment, reason } = calculateDynamicSegment({
    status,
    metadata,
    created_at: new Date().toISOString(),
  });

  // Parse tags to JSON array
  const tagsArray = tagsStr
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const leadId = `lead_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  // 4. Inserción en D1
  await c.env.DB.prepare(`
    INSERT INTO leads (
      id, full_name, phone, email, status, segment, assigned_to, tags, metadata, notes_summary, last_contacted_at, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      leadId,
      fullName,
      normalizedPhone,
      email,
      status,
      segment,
      assignedTo,
      JSON.stringify(tagsArray),
      JSON.stringify(metadata),
      note,
      now,
      user.userId,
      user.userId,
      now,
      now
    )
    .run();

  // 5. Inserción de bitácora inicial
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'creation', ?, ?)
  `)
    .bind(`act_${crypto.randomUUID().slice(0, 8)}`, leadId, user.userId, `Lead creado con clasificación en Segmento ${segment} (${reason}). Nota: ${note}`, now)
    .run();

  // 6. Auditoría
  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details)
    VALUES (?, ?, 'lead', ?, 'create', ?)
  `)
    .bind(`aud_${crypto.randomUUID().slice(0, 8)}`, user.userId, leadId, `Creado lead ${fullName} (${normalizedPhone})`)
    .run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Ficha detallada del lead con WhatsApp IA, bitácora y metadatos
 */
leadsRoutes.get('/leads/:id', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const templateId = c.req.query('template_id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();

  if (!lead) {
    return c.text('Prospecto no encontrado', 404);
  }

  // RBAC: Si es agente, solo puede ver sus asignados
  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.text('Acceso Denegado: No tienes permiso para ver este prospecto asignado a otro agente', 403);
  }

  const parsedLead: Lead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();
  const templatesRes = await c.env.DB.prepare('SELECT * FROM message_templates ORDER BY category').all<MessageTemplate>();
  
  const activitiesRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activity_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    WHERE a.lead_id = ? 
    ORDER BY a.created_at DESC
  `).bind(leadId).all<ActivityLog>();

  const { reason } = calculateDynamicSegment(parsedLead);

  return c.html(
    Layout({
      title: `${lead.full_name} | Ficha Prospecto`,
      user,
      currentPath: '/leads',
      children: LeadDetailView({
        user,
        lead: parsedLead,
        agents: agentsRes.results || [],
        templates: templatesRes.results || [],
        activities: activitiesRes.results || [],
        segmentReason: reason,
        selectedTemplateId: templateId,
      }),
    })
  );
});

/**
 * Generación de mensaje contextual con Cloudflare Workers AI
 */
leadsRoutes.post('/leads/:id/ai-message', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const tone = (body['tone'] as string) || 'motivador y persuasivo';

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const parsedLead: Lead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  const activitiesRes = await c.env.DB.prepare(
    'SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC LIMIT 5'
  ).bind(leadId).all<ActivityLog>();

  // Prompt con inyección de todo el perfil
  const promptData = buildLeadContextPrompt({
    lead: parsedLead,
    agentName: user.name,
    recentActivities: activitiesRes.results || [],
    tone,
  });

  const generatedText = await generateAiWhatsAppMessage(c.env, promptData, parsedLead, user.name);

  // Registrar en bitácora el evento de generación IA
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details)
    VALUES (?, ?, ?, 'ai_generated', ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Mensaje personalizado generado con IA (Tono: ${tone})`
  ).run();

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();
  const templatesRes = await c.env.DB.prepare('SELECT * FROM message_templates').all<MessageTemplate>();
  const allActivitiesRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activity_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    WHERE a.lead_id = ? 
    ORDER BY a.created_at DESC
  `).bind(leadId).all<ActivityLog>();

  const { reason } = calculateDynamicSegment(parsedLead);

  return c.html(
    Layout({
      title: `${lead.full_name} | Mensaje IA Generado`,
      user,
      currentPath: '/leads',
      flash: { type: 'success', message: '¡Mensaje de WhatsApp redactado exitosamente con IA!' },
      children: LeadDetailView({
        user,
        lead: parsedLead,
        agents: agentsRes.results || [],
        templates: templatesRes.results || [],
        activities: allActivitiesRes.results || [],
        segmentReason: reason,
        generatedAiText: generatedText,
      }),
    })
  );
});

/**
 * Diagnóstico comercial y resumen ejecutivo con Cloudflare Workers AI
 */
leadsRoutes.post('/leads/:id/ai-briefing', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const parsedLead: Lead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  const activitiesRes = await c.env.DB.prepare(
    'SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC LIMIT 6'
  ).bind(leadId).all<ActivityLog>();

  // Ejecutar diagnóstico con Cloudflare Workers AI
  const briefing = await generateAiLeadBriefing(c.env, parsedLead, activitiesRes.results || []);

  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'ai_generated', ?, ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Diagnóstico comercial generado con Cloudflare Workers AI: "${briefing}"`,
    now
  ).run();

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();
  const templatesRes = await c.env.DB.prepare('SELECT * FROM message_templates').all<MessageTemplate>();
  const allActivitiesRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activity_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    WHERE a.lead_id = ? 
    ORDER BY a.created_at DESC
  `).bind(leadId).all<ActivityLog>();

  const { reason } = calculateDynamicSegment(parsedLead);

  return c.html(
    Layout({
      title: `${lead.full_name} | Diagnóstico Workers AI`,
      user,
      currentPath: '/leads',
      flash: { type: 'success', message: '¡Diagnóstico comercial sintetizado por Cloudflare Workers AI!' },
      children: LeadDetailView({
        user,
        lead: parsedLead,
        agents: agentsRes.results || [],
        templates: templatesRes.results || [],
        activities: allActivitiesRes.results || [],
        segmentReason: reason,
        aiBriefing: briefing,
      }),
    })
  );
});

/**
 * Sugerencia y auto-etiquetado inteligente con Cloudflare Workers AI
 */
leadsRoutes.post('/leads/:id/ai-suggest-tags', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const parsedLead: Lead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  const suggested = await suggestAiTags(c.env, parsedLead);

  // Mezclar tags existentes sin duplicar
  const currentTags = parsedLead.tags || [];
  const mergedTags = Array.from(new Set([...currentTags, ...suggested]));

  await c.env.DB.prepare('UPDATE leads SET tags = ? WHERE id = ?')
    .bind(JSON.stringify(mergedTags), leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details)
    VALUES (?, ?, ?, 'ai_generated', ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Tags sugeridos por Cloudflare Workers AI: #${suggested.join(', #')}`
  ).run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Enviar WhatsApp: registra en bitácora y redirige al deep link directo
 */
leadsRoutes.post('/leads/:id/send-whatsapp', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const message = (body['message'] as string) || '';
  const logActivity = body['log_activity'] === '1';

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const now = new Date().toISOString();

  if (logActivity) {
    // Registrar mensaje en bitácora
    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
      VALUES (?, ?, ?, 'whatsapp_sent', ?, ?)
    `).bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `WhatsApp enviado: "${message.slice(0, 140)}..."`,
      now
    ).run();

    // Actualizar fecha de último contacto
    await c.env.DB.prepare(`
      UPDATE leads 
      SET last_contacted_at = ?, updated_by = ?, updated_at = ? 
      WHERE id = ?
    `).bind(now, user.userId, now, leadId).run();
  }

  const deepLink = createWhatsAppDeepLink(lead.phone, message);
  return c.redirect(deepLink);
});

/**
 * Actualizar estado del pipeline
 */
leadsRoutes.post('/leads/:id/status', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const newStatus = body['status'] as string;

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const now = new Date().toISOString();

  // Re-evaluar segmentación dinámica automáticamente con el nuevo status
  const { segment, reason } = calculateDynamicSegment({
    status: newStatus,
    metadata: lead.metadata,
    last_contacted_at: lead.last_contacted_at,
    created_at: lead.created_at,
  });

  await c.env.DB.prepare(`
    UPDATE leads 
    SET status = ?, segment = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(newStatus, segment, user.userId, now, leadId).run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'status_change', ?, ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Estado cambiado de '${lead.status}' a '${newStatus}'. Segmento actualizado a ${segment} (${reason}).`,
    now
  ).run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Reasignar agente responsable
 */
leadsRoutes.post('/leads/:id/assign', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const assignedTo = (body['assigned_to'] as string) || null;

  const now = new Date().toISOString();

  await c.env.DB.prepare('UPDATE leads SET assigned_to = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .bind(assignedTo, user.userId, now, leadId)
    .run();

  const agentUser = assignedTo
    ? await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(assignedTo).first<{ name: string }>()
    : null;

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'assignment', ?, ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Responsable asignado a: ${agentUser?.name || 'Sin asignar'}`,
    now
  ).run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Revaluar reglas de segmentación dinámicamente
 */
leadsRoutes.post('/leads/:id/recalculate-segment', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.text('No encontrado', 404);

  const { segment, reason } = calculateDynamicSegment(lead);
  const now = new Date().toISOString();

  await c.env.DB.prepare('UPDATE leads SET segment = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .bind(segment, user.userId, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'segment_change', ?, ?)
  `).bind(
    `act_${crypto.randomUUID().slice(0, 8)}`,
    leadId,
    user.userId,
    `Segmento recalculado dinámicamente a '${segment}'. Criterio: ${reason}`,
    now
  ).run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Agregar nota a la bitácora
 */
leadsRoutes.post('/leads/:id/notes', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const note = (body['note'] as string)?.trim();
  const actionType = (body['action_type'] as string) || 'note';

  if (!note) return c.redirect(`/leads/${leadId}`);

  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(`act_${crypto.randomUUID().slice(0, 8)}`, leadId, user.userId, actionType, note, now).run();

  // Actualizar último contacto
  await c.env.DB.prepare('UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?')
    .bind(now, now, leadId)
    .run();

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Agregar Tag / Chip
 */
leadsRoutes.post('/leads/:id/tags/add', async (c) => {
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const tag = (body['tag'] as string)?.trim();

  if (!tag) return c.redirect(`/leads/${leadId}`);

  const lead = await c.env.DB.prepare('SELECT tags FROM leads WHERE id = ?').bind(leadId).first<{ tags: string }>();
  if (lead) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(lead.tags || '[]');
    } catch {}

    if (!tags.includes(tag)) {
      tags.push(tag);
      await c.env.DB.prepare('UPDATE leads SET tags = ? WHERE id = ?')
        .bind(JSON.stringify(tags), leadId)
        .run();
    }
  }

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Eliminar Tag / Chip
 */
leadsRoutes.post('/leads/:id/tags/remove', async (c) => {
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();
  const tag = body['tag'] as string;

  const lead = await c.env.DB.prepare('SELECT tags FROM leads WHERE id = ?').bind(leadId).first<{ tags: string }>();
  if (lead) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(lead.tags || '[]');
    } catch {}

    tags = tags.filter((t) => t !== tag);
    await c.env.DB.prepare('UPDATE leads SET tags = ? WHERE id = ?')
      .bind(JSON.stringify(tags), leadId)
      .run();
  }

  return c.redirect(`/leads/${leadId}`);
});

/**
 * Actualizar Metadatos Flexibles (JSONB / Key-Value)
 */
leadsRoutes.post('/leads/:id/metadata', async (c) => {
  const leadId = c.req.param('id');
  const body = await c.req.parseBody();

  const lead = await c.env.DB.prepare('SELECT metadata FROM leads WHERE id = ?').bind(leadId).first<{ metadata: string }>();
  if (!lead) return c.text('No encontrado', 404);

  let currentMeta: Record<string, any> = {};
  try {
    currentMeta = JSON.parse(lead.metadata || '{}');
  } catch {}

  // Parse existing updated keys
  for (const [key, val] of Object.entries(body)) {
    if (key.startsWith('meta_')) {
      const fieldKey = key.replace('meta_', '');
      currentMeta[fieldKey] = val;
    }
  }

  // Parse new key-value pair if provided
  const newKey = (body['new_key'] as string)?.trim().toLowerCase().replace(/\s+/g, '_');
  const newVal = (body['new_val'] as string)?.trim();
  if (newKey && newVal) {
    currentMeta[newKey] = newVal;
  }

  await c.env.DB.prepare('UPDATE leads SET metadata = ? WHERE id = ?')
    .bind(JSON.stringify(currentMeta), leadId)
    .run();

  return c.redirect(`/leads/${leadId}`);
});
