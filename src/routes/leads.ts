import { Hono, Context } from 'hono';
import { Env, Lead, User, ActivityLog, SessionData, WhatsAppMessage } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizePhone, checkDuplicatePhone, calculateDynamicSegment, autoAssignAgent } from '../lib/rules';
import {
  buildLeadContextPrompt,
  generateAiWhatsAppMessage,
  generateAiLeadBriefing,
  suggestAiTags,
  createWhatsAppDeepLink,
} from '../lib/ai';

export const leadsRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

leadsRoutes.use('*', requireAuth);

/**
 * Lista de agentes disponibles para asignar o filtrar
 */
leadsRoutes.get('/api/agents', async (c) => {
  const agentsRes = await c.env.DB.prepare(
    'SELECT id, name, email, avatar_url, role FROM users WHERE is_active = 1 ORDER BY name ASC'
  ).all<User>();

  return c.json({ agents: agentsRes.results || [] });
});

/**
 * Dashboard principal - Datos y KPIs
 */
leadsRoutes.get('/api/dashboard', async (c) => {
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

  const statusCount: Record<string, number> = {
    nuevo: 0,
    contactado: 0,
    cita_agendada: 0,
    negociacion: 0,
    ganado: 0,
    perdido: 0,
  };
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
       ORDER BY a.created_at DESC LIMIT 10`
    : `SELECT a.*, l.full_name as lead_name, u.name as user_name 
       FROM activity_logs a 
       JOIN leads l ON l.id = a.lead_id
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 10`;

  const recentActivitiesRes = await c.env.DB.prepare(activitiesQuery)
    .bind(...leadParams)
    .all<ActivityLog & { lead_name: string }>();

  // Leads needing attention (Segment C or status 'nuevo')
  const attentionQuery = isAgent
    ? `SELECT l.*, u.name as assigned_name 
       FROM leads l 
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE l.assigned_to = ? AND (l.segment = 'C' OR l.status = 'nuevo') 
       ORDER BY l.created_at DESC LIMIT 6`
    : `SELECT l.*, u.name as assigned_name 
       FROM leads l 
       LEFT JOIN users u ON u.id = l.assigned_to
       WHERE l.segment = 'C' OR l.status = 'nuevo' 
       ORDER BY l.created_at DESC LIMIT 6`;

  const attentionLeadsRes = await c.env.DB.prepare(attentionQuery)
    .bind(...leadParams)
    .all<Lead>();

  const parsedAttention = (attentionLeadsRes.results || []).map((l) => ({
    ...l,
    tags: typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags,
    metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata,
  }));

  return c.json({
    totalLeads,
    segmentsCount,
    statusCount,
    recentActivities: recentActivitiesRes.results || [],
    leadsNeedingAttention: parsedAttention,
  });
});

/**
 * Listado de Leads con filtros reactivos
 */
leadsRoutes.get('/api/leads', async (c) => {
  const user = c.get('user');
  const search = c.req.query('search')?.trim();
  const segment = c.req.query('segment')?.trim();
  const status = c.req.query('status')?.trim();
  const agentId = c.req.query('agentId')?.trim();
  const tag = c.req.query('tag')?.trim();

  let whereClauses: string[] = [];
  let params: any[] = [];

  // RBAC: Si es agente, solo sus leads asignados
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

  const leads = (leadsRes.results || []).map((lead) => ({
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  }));

  return c.json({ leads });
});

/**
 * Obtener detalle de un lead
 */
leadsRoutes.get('/api/leads/:id', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare(`
    SELECT l.*, u.name as assigned_name 
    FROM leads l 
    LEFT JOIN users u ON u.id = l.assigned_to 
    WHERE l.id = ?
  `)
    .bind(leadId)
    .first<Lead>();

  if (!lead) {
    return c.json({ error: 'Lead no encontrado' }, 404);
  }

  // RBAC: Si es agente, solo puede ver sus propios leads
  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado: No tienes permisos para ver este lead' }, 403);
  }

  const parsedLead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  // Actividades
  const activitiesRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activity_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    WHERE a.lead_id = ? 
    ORDER BY a.created_at DESC
  `)
    .bind(leadId)
    .all<ActivityLog>();

  return c.json({
    lead: parsedLead,
    activities: activitiesRes.results || [],
  });
});

/**
 * Crear nuevo lead
 */
leadsRoutes.post('/api/leads', async (c) => {
  const user = c.get('user');
  let data: any = {};

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await c.req.json();
  } else {
    data = await c.req.parseBody();
  }

  const fullName = (data.full_name as string)?.trim();
  const rawPhone = (data.phone as string)?.trim();
  const email = (data.email as string)?.trim().toLowerCase() || null;
  const status = (data.status as string) || 'nuevo';
  let assignedTo = (data.assigned_to as string) || null;
  const tagsStr = (data.tags as string) || '';
  const notes = (data.notes as string)?.trim() || null;

  if (!fullName || !rawPhone) {
    return c.json({ error: 'El nombre completo y el teléfono son obligatorios.' }, 400);
  }

  const phone = normalizePhone(rawPhone);

  // Verificación de duplicado estricta
  const duplicateCheck = await checkDuplicatePhone(c.env.DB, phone);
  if (duplicateCheck.exists) {
    return c.json({
      error: `El teléfono ya está registrado para el prospecto: ${duplicateCheck.existingLead?.full_name}`,
      duplicate: true,
      existingLead: duplicateCheck.existingLead,
    }, 409);
  }

  // Parse tags
  let tags: string[] = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags;
  } else if (tagsStr) {
    tags = tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean);
  }

  // Metadatos
  let metadata: Record<string, any> = {};
  if (data.metadata && typeof data.metadata === 'object') {
    metadata = data.metadata;
  } else {
    metadata = {
      presupuesto: Number(data.presupuesto) || 0,
      objetivo: data.objetivo || '',
      horario_preferido: data.horario_preferido || '',
      ciudad: data.ciudad || '',
      sede: data.sede || '',
      producto: data.producto || '',
    };
  }

  // Segmentación Dinámica Automática
  const dynamicSeg = calculateDynamicSegment({
    status,
    metadata,
    created_at: new Date().toISOString(),
  });

  // Asignación automática si se seleccionó 'auto' o no se definió
  if (!assignedTo || assignedTo === 'auto') {
    assignedTo = await autoAssignAgent(c.env.DB);
  }

  const leadId = `lead_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO leads (
      id, full_name, phone, email, status, segment, assigned_to, tags, metadata, notes_summary, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      leadId,
      fullName,
      phone,
      email,
      status,
      dynamicSeg.segment,
      assignedTo,
      JSON.stringify(tags),
      JSON.stringify(metadata),
      notes,
      user.userId,
      user.userId,
      now,
      now
    )
    .run();

  // Log creación
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'creation', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Lead creado con segmento ${dynamicSeg.segment} (${dynamicSeg.reason}).`,
      now
    )
    .run();

  if (notes) {
    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
      VALUES (?, ?, ?, 'note', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        user.userId,
        `Nota inicial: ${notes}`,
        now
      )
      .run();
  }

  return c.json({
    success: true,
    lead: {
      id: leadId,
      full_name: fullName,
      phone,
      email,
      status,
      segment: dynamicSeg.segment,
      assigned_to: assignedTo,
      tags,
      metadata,
    },
  }, 201);
});

/**
 * Actualizar Estado del Lead
 */
leadsRoutes.post('/api/leads/:id/status', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const newStatus = body.status as string;
  if (!newStatus) {
    return c.json({ error: 'Estado requerido' }, 400);
  }

  const currentLead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!currentLead) return c.json({ error: 'Lead no encontrado' }, 404);

  if (user.role === 'agent' && currentLead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const now = new Date().toISOString();
  const dynamicSeg = calculateDynamicSegment({
    status: newStatus,
    metadata: currentLead.metadata,
    last_contacted_at: now,
  });

  await c.env.DB.prepare(`
    UPDATE leads 
    SET status = ?, segment = ?, last_contacted_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `)
    .bind(newStatus, dynamicSeg.segment, now, user.userId, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'status_change', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Estado actualizado de '${currentLead.status}' a '${newStatus}'. Segmento: ${dynamicSeg.segment} (${dynamicSeg.reason})`,
      now
    )
    .run();

  return c.json({ success: true, status: newStatus, segment: dynamicSeg.segment });
});

/**
 * Reasignar Asesor
 */
leadsRoutes.post('/api/leads/:id/assign', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  let newAgentId = body.assigned_to as string;
  if (!newAgentId) return c.json({ error: 'Asesor requerido' }, 400);

  if (newAgentId === 'auto') {
    newAgentId = (await autoAssignAgent(c.env.DB)) || '';
  }

  const targetAgent = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(newAgentId).first<{ name: string }>();
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE leads SET assigned_to = ?, updated_by = ?, updated_at = ? WHERE id = ?
  `)
    .bind(newAgentId, user.userId, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'assignment', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Reasignado al asesor ${targetAgent?.name || newAgentId}`,
      now
    )
    .run();

  return c.json({ success: true, assigned_to: newAgentId, assigned_name: targetAgent?.name });
});

/**
 * Agregar Nota
 */
leadsRoutes.post('/api/leads/:id/notes', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const note = (body.note as string)?.trim();
  if (!note) return c.json({ error: 'Nota requerida' }, 400);

  const now = new Date().toISOString();

  // Guardar en bitácora
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'note', ?, ?)
  `)
    .bind(`act_${crypto.randomUUID().slice(0, 8)}`, leadId, user.userId, note, now)
    .run();

  // Actualizar resumen en lead
  await c.env.DB.prepare(`
    UPDATE leads SET notes_summary = ?, last_contacted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?
  `)
    .bind(note, now, user.userId, now, leadId)
    .run();

  return c.json({ success: true, note });
});

/**
 * Generar Mensaje WhatsApp con IA
 */
leadsRoutes.post('/api/leads/:id/ai-message', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const tone = (body.tone as string) || 'bienvenida';

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const activities = await c.env.DB.prepare(
    'SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC LIMIT 5'
  )
    .bind(leadId)
    .all<ActivityLog>();

  const parsedLead: Lead = {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  };

  const promptData = buildLeadContextPrompt({
    lead: parsedLead,
    agentName: user.name,
    recentActivities: activities.results || [],
    tone,
  });

  const message = await generateAiWhatsAppMessage(
    c.env,
    promptData,
    parsedLead,
    user.name
  );

  const deepLink = createWhatsAppDeepLink(lead.phone, message);

  // Registrar actividad
  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'ai_generated', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Mensaje sugerido con IA (Tono: ${tone}): "${message.slice(0, 80)}..."`,
      new Date().toISOString()
    )
    .run();

  return c.json({ success: true, message, deepLink });
});

/**
 * Resumen Ejecutivo con IA (AI Briefing)
 */
leadsRoutes.post('/api/leads/:id/ai-briefing', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const activities = await c.env.DB.prepare(
    'SELECT * FROM activity_logs WHERE lead_id = ? ORDER BY created_at DESC LIMIT 6'
  )
    .bind(leadId)
    .all<ActivityLog>();

  const briefing = await generateAiLeadBriefing(
    c.env,
    {
      ...lead,
      tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
      metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
    },
    activities.results || []
  );

  return c.json({ success: true, briefing });
});

/**
 * Sugerir Tags con IA
 */
leadsRoutes.post('/api/leads/:id/ai-suggest-tags', async (c) => {
  const leadId = c.req.param('id');
  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const suggested = await suggestAiTags(c.env, {
    ...lead,
    tags: typeof lead.tags === 'string' ? JSON.parse(lead.tags || '[]') : lead.tags,
    metadata: typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : lead.metadata,
  });

  return c.json({ success: true, suggestedTags: suggested });
});

/**
 * Registrar Envío de WhatsApp y generar Deep Link
 */
leadsRoutes.post('/api/leads/:id/send-whatsapp', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const messageText = (body.message as string)?.trim() || 'Hola';

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const deepLink = createWhatsAppDeepLink(lead.phone, messageText);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'whatsapp_sent', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `WhatsApp enviado: "${messageText.slice(0, 100)}"`,
      now
    )
    .run();

  await c.env.DB.prepare(`
    UPDATE leads SET last_contacted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?
  `)
    .bind(now, user.userId, now, leadId)
    .run();

  return c.json({ success: true, deepLink });
});

/**
 * Recalcular Segmento Dinámico
 */
leadsRoutes.post('/api/leads/:id/recalculate-segment', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const calc = calculateDynamicSegment(lead);
  const now = new Date().toISOString();

  await c.env.DB.prepare('UPDATE leads SET segment = ?, updated_by = ?, updated_at = ? WHERE id = ?')
    .bind(calc.segment, user.userId, now, leadId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'segment_change', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Segmento recalculado a '${calc.segment}': ${calc.reason}`,
      now
    )
    .run();

  return c.json({ success: true, segment: calc.segment, reason: calc.reason });
});

/**
 * Agregar y Quitar Tags
 */
leadsRoutes.post('/api/leads/:id/tags/add', async (c) => {
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const tag = (body.tag as string)?.trim();
  if (!tag) return c.json({ error: 'Tag requerido' }, 400);

  const lead = await c.env.DB.prepare('SELECT tags FROM leads WHERE id = ?').bind(leadId).first<{ tags: string }>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const tags: string[] = JSON.parse(lead.tags || '[]');
  if (!tags.includes(tag)) {
    tags.push(tag);
    await c.env.DB.prepare('UPDATE leads SET tags = ? WHERE id = ?').bind(JSON.stringify(tags), leadId).run();
  }

  return c.json({ success: true, tags });
});

leadsRoutes.post('/api/leads/:id/tags/remove', async (c) => {
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const tag = (body.tag as string)?.trim();
  const lead = await c.env.DB.prepare('SELECT tags FROM leads WHERE id = ?').bind(leadId).first<{ tags: string }>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  let tags: string[] = JSON.parse(lead.tags || '[]');
  tags = tags.filter((t) => t !== tag);

  await c.env.DB.prepare('UPDATE leads SET tags = ? WHERE id = ?').bind(JSON.stringify(tags), leadId).run();
  return c.json({ success: true, tags });
});

/**
 * Actualizar Metadatos
 */
leadsRoutes.post('/api/leads/:id/metadata', async (c) => {
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const lead = await c.env.DB.prepare('SELECT metadata FROM leads WHERE id = ?').bind(leadId).first<{ metadata: string }>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  const currentMeta = JSON.parse(lead.metadata || '{}');
  const updatedMeta = { ...currentMeta, ...(body.metadata || body) };

  await c.env.DB.prepare('UPDATE leads SET metadata = ? WHERE id = ?').bind(JSON.stringify(updatedMeta), leadId).run();
  return c.json({ success: true, metadata: updatedMeta });
});

/**
 * Actualizar datos generales del lead (Nombre, Teléfono, Correo, Metas, Sede)
 */
const handleUpdateLead = async (c: Context<{ Bindings: Env; Variables: { user: SessionData } }>) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const currentLead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!currentLead) return c.json({ error: 'Lead no encontrado' }, 404);

  if (user.role === 'agent' && currentLead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const fullName = (body.full_name as string)?.trim() || currentLead.full_name;
  const rawPhone = (body.phone as string)?.trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : currentLead.phone;
  const email = body.email !== undefined ? ((body.email as string)?.trim().toLowerCase() || null) : currentLead.email;
  const notesSummary = body.notes_summary !== undefined ? (body.notes_summary as string)?.trim() : currentLead.notes_summary;

  if (phone !== currentLead.phone) {
    const dupCheck = await checkDuplicatePhone(c.env.DB, phone, leadId);
    if (dupCheck.exists) {
      return c.json({ error: `El número ${phone} ya pertenece a otro prospecto (${dupCheck.existingLead?.full_name})` }, 409);
    }
  }

  let metadata = typeof currentLead.metadata === 'string' ? JSON.parse(currentLead.metadata || '{}') : (currentLead.metadata || {});
  if (body.metadata && typeof body.metadata === 'object') {
    metadata = { ...metadata, ...body.metadata };
  } else {
    if (body.presupuesto !== undefined) metadata.presupuesto = Number(body.presupuesto) || 0;
    if (body.producto !== undefined) metadata.producto = body.producto;
    if (body.objetivo !== undefined) metadata.objetivo = body.objetivo;
    if (body.sede !== undefined) metadata.sede = body.sede;
    if (body.ciudad !== undefined) metadata.ciudad = body.ciudad;
    if (body.horario_preferido !== undefined) metadata.horario_preferido = body.horario_preferido;
  }

  let tags = typeof currentLead.tags === 'string' ? JSON.parse(currentLead.tags || '[]') : (currentLead.tags || []);
  if (Array.isArray(body.tags)) {
    tags = body.tags;
  } else if (typeof body.tags === 'string' && body.tags.trim()) {
    tags = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
  }

  const now = new Date().toISOString();
  const dynamicSeg = calculateDynamicSegment({
    status: currentLead.status,
    metadata,
    last_contacted_at: currentLead.last_contacted_at,
    created_at: currentLead.created_at,
  });

  await c.env.DB.prepare(`
    UPDATE leads 
    SET full_name = ?, phone = ?, email = ?, segment = ?, tags = ?, metadata = ?, notes_summary = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `)
    .bind(
      fullName,
      phone,
      email,
      dynamicSeg.segment,
      JSON.stringify(tags),
      JSON.stringify(metadata),
      notesSummary,
      user.userId,
      now,
      leadId
    )
    .run();

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'update', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      `Datos del prospecto actualizados por ${user.name}.`,
      now
    )
    .run();

  return c.json({
    success: true,
    lead: {
      ...currentLead,
      full_name: fullName,
      phone,
      email,
      segment: dynamicSeg.segment,
      tags,
      metadata,
      notes_summary: notesSummary,
      updated_at: now,
    },
  });
};

leadsRoutes.put('/api/leads/:id', handleUpdateLead);
leadsRoutes.post('/api/leads/:id/update', handleUpdateLead);

/**
 * Eliminar prospecto
 */
leadsRoutes.delete('/api/leads/:id', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM activity_logs WHERE lead_id = ?').bind(leadId),
    c.env.DB.prepare('DELETE FROM whatsapp_messages WHERE lead_id = ?').bind(leadId),
    c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(leadId),
    c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details, created_at)
      VALUES (?, ?, 'lead', ?, 'delete_lead', ?, ?)
    `).bind(
      `aud_${crypto.randomUUID().slice(0, 8)}`,
      user.userId,
      leadId,
      `Prospecto ${lead.full_name} (${lead.phone}) eliminado por ${user.name}`,
      new Date().toISOString()
    ),
  ]);

  return c.json({ success: true, deletedId: leadId });
});

/**
 * Obtener historial de mensajes de WhatsApp
 */
leadsRoutes.get('/api/leads/:id/messages', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT id, full_name, phone, assigned_to FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const messagesRes = await c.env.DB.prepare(`
    SELECT m.*, u.name as user_name 
    FROM whatsapp_messages m 
    LEFT JOIN users u ON u.id = m.user_id 
    WHERE m.lead_id = ? 
    ORDER BY m.created_at ASC
  `)
    .bind(leadId)
    .all<WhatsAppMessage>();

  return c.json({
    lead: { id: lead.id, full_name: lead.full_name, phone: lead.phone },
    messages: messagesRes.results || [],
  });
});

/**
 * Enviar / Registrar nuevo mensaje de WhatsApp (texto o imagen)
 */
leadsRoutes.post('/api/leads/:id/messages', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const content = (body.content as string)?.trim() || '';
  const messageType = ((body.message_type as string) || 'text') as 'text' | 'image' | 'document' | 'audio';
  const mediaUrl = (body.media_url as string)?.trim() || null;
  const sender = ((body.sender as string) || 'agent') as 'agent' | 'lead' | 'system';

  if (!content && !mediaUrl) {
    return c.json({ error: 'El contenido o archivo adjunto es requerido' }, 400);
  }

  const lead = await c.env.DB.prepare('SELECT id, full_name, phone, assigned_to FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);

  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const msgId = `msg_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO whatsapp_messages (
      id, lead_id, user_id, sender, message_type, content, media_url, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
  `)
    .bind(
      msgId,
      leadId,
      sender === 'agent' ? user.userId : null,
      sender,
      messageType,
      content || (messageType === 'image' ? 'Imagen enviada' : ''),
      mediaUrl,
      now
    )
    .run();

  // Actualizar último contacto en lead y registrar en bitácora
  await c.env.DB.prepare(`
    UPDATE leads SET last_contacted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?
  `)
    .bind(now, user.userId, now, leadId)
    .run();

  const activityDetail = messageType === 'image'
    ? `Imagen enviada por WhatsApp: "${content || 'Archivo multimedia'}"`
    : `WhatsApp ${sender === 'lead' ? 'recibido de' : 'enviado a'} ${lead.full_name}: "${content.slice(0, 80)}"`;

  await c.env.DB.prepare(`
    INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
    VALUES (?, ?, ?, 'whatsapp_sent', ?, ?)
  `)
    .bind(
      `act_${crypto.randomUUID().slice(0, 8)}`,
      leadId,
      user.userId,
      activityDetail,
      now
    )
    .run();

  const deepLink = createWhatsAppDeepLink(lead.phone, content || 'Hola');

  return c.json({
    success: true,
    message: {
      id: msgId,
      lead_id: leadId,
      user_id: user.userId,
      user_name: user.name,
      sender,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      status: 'sent',
      created_at: now,
    },
    deepLink,
  }, 201);
});

/**
 * Subir imagen o comprobante para WhatsApp (R2 o KV fallback)
 */
leadsRoutes.post('/api/upload/image', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return c.json({ error: 'No se recibió ningún archivo de imagen' }, 400);
    }

    const typedFile = file as File;
    const arrayBuffer = await typedFile.arrayBuffer();
    const ext = typedFile.name.split('.').pop() || 'jpg';
    const key = `chat-media/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

    if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
      try {
        await c.env.STORAGE.put(key, arrayBuffer, {
          httpMetadata: { contentType: typedFile.type || 'image/jpeg' },
        });
      } catch (e) {
        console.warn('Storage put warning:', e);
      }
    }

    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    const dataUrl = `data:${typedFile.type || 'image/jpeg'};base64,${base64}`;

    return c.json({
      success: true,
      media_url: dataUrl,
      key,
      file_name: typedFile.name,
    });
  } catch (err: any) {
    console.error('Error subiendo imagen:', err);
    return c.json({ error: err.message || 'Error al procesar archivo' }, 500);
  }
});
