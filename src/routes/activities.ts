import { Hono, Context } from 'hono';
import { Env, Lead, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizeActivityName } from '../lib/activities';

/**
 * Catálogo de Actividades de interés + relación Prospecto <-> Actividad.
 *
 * - Ver catálogo / crear: cualquier usuario autenticado (el catálogo crece
 *   orgánicamente, también desde la Ficha del prospecto).
 * - Editar (renombrar) / eliminar (borrado lógico): sólo administradores,
 *   porque afectan globalmente a todos los prospectos.
 * - Asociar/desasociar actividades de un prospecto: propietario (agente) o admin.
 *
 * El borrado de una actividad es LÓGICO (is_active=0, patrón existente de
 * users/knowledge_base): las asociaciones de prospectos se preservan intactas
 * (nunca quedan referencias rotas) y la actividad puede reactivarse.
 */

export const activitiesRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

activitiesRoutes.use('/api/activities', requireAuth);
activitiesRoutes.use('/api/activities/*', requireAuth);
activitiesRoutes.use('/api/leads/*/activities', requireAuth);
activitiesRoutes.use('/api/leads/*/activities/*', requireAuth);

interface ActivityRow {
  id: string;
  name: string;
  name_norm: string;
  is_active: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  prospect_count?: number;
}

interface LeadInterestRow {
  id: string;
  name: string;
  is_active: number;
  assigned_at: string;
}

// Registro histórico en activity_logs retirado: tabla eliminada del esquema D1


/**
 * Listar el catálogo de actividades activas con conteo de prospectos interesados
 */
activitiesRoutes.get('/api/activities', async (c) => {
  const res = await c.env.DB.prepare(`
    SELECT a.id, a.name, a.name_norm, a.is_active, a.created_at, a.updated_at,
           (SELECT COUNT(*) FROM prospect_activities pa WHERE pa.activity_id = a.id) as prospect_count
    FROM activities a
    ORDER BY a.is_active DESC, (SELECT COUNT(*) FROM prospect_activities pa WHERE pa.activity_id = a.id) DESC, a.name COLLATE NOCASE ASC
  `).all<ActivityRow>();

  return c.json({ activities: res.results || [] });
});

/**
 * Crear una actividad nueva en el catálogo (deduplicada).
 * Si ya existe una actividad equivalente (name_norm), se reutiliza:
 * - Activa => 409 con la existente (no se crea duplicado).
 * - Eliminada lógicamente => se reactiva con el nuevo nombre de visualización.
 */
activitiesRoutes.post('/api/activities', async (c) => {
  const user = c.get('user');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const name = String(body.name || '').trim();
  if (!name || name.length > 60) {
    return c.json({ error: 'El nombre de la actividad es requerido (máx. 60 caracteres).' }, 400);
  }

  const nameNorm = normalizeActivityName(name);

  const existing = await c.env.DB.prepare(
    'SELECT id, name, is_active FROM activities WHERE name_norm = ?'
  )
    .bind(nameNorm)
    .first<{ id: string; name: string; is_active: number }>();

  if (existing) {
    if (existing.is_active) {
      return c.json(
        { error: `La actividad "${existing.name}" ya existe en el catálogo.`, existingActivity: existing },
        409
      );
    }
    // Reactivar la entrada existente (mismo registro, sin duplicados)
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      'UPDATE activities SET name = ?, is_active = 1, updated_at = ? WHERE id = ?'
    )
      .bind(name, now, existing.id)
      .run();
    return c.json({ success: true, activity: { id: existing.id, name, is_active: 1 }, reactivated: true });
  }

  const now = new Date().toISOString();
  const id = `act_${crypto.randomUUID().slice(0, 8)}`;
  await c.env.DB.prepare(
    'INSERT INTO activities (id, name, name_norm, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
  )
    .bind(id, name, nameNorm, user.userId, now, now)
    .run();

  return c.json({ success: true, activity: { id, name, is_active: 1 } }, 201);
});

/**
 * Editar (renombrar) una actividad del catálogo — sólo administradores.
 * El ID no cambia: todos los prospectos siguen referenciando el mismo registro.
 */
activitiesRoutes.post('/api/activities/:id/update', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Acceso Denegado: sólo administradores pueden editar el catálogo.' }, 403);
  }

  const id = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const name = String(body.name || '').trim();
  if (!name || name.length > 60) {
    return c.json({ error: 'El nombre de la actividad es requerido (máx. 60 caracteres).' }, 400);
  }
  const nameNorm = normalizeActivityName(name);

  const current = await c.env.DB.prepare('SELECT id, name FROM activities WHERE id = ?')
    .bind(id)
    .first<{ id: string; name: string }>();
  if (!current) {
    return c.json({ error: 'Actividad no encontrada.' }, 404);
  }

  const collision = await c.env.DB.prepare(
    'SELECT id, name FROM activities WHERE name_norm = ? AND id != ?'
  )
    .bind(nameNorm, id)
    .first<{ id: string; name: string }>();
  if (collision) {
    return c.json(
      { error: `Ya existe otra actividad "${collision.name}" equivalente a ese nombre.` },
      409
    );
  }

  await c.env.DB.prepare('UPDATE activities SET name = ?, name_norm = ?, updated_at = ? WHERE id = ?')
    .bind(name, nameNorm, new Date().toISOString(), id)
    .run();

  return c.json({ success: true, activity: { id, name } });
});

/**
 * Eliminar una actividad del catálogo (borrado LÓGICO) — sólo administradores.
 * Las asociaciones de prospectos se conservan intactas (se muestran atenuadas
 * en la Ficha y pueden reactivarse); el catálogo deja de ofrecerla.
 */
activitiesRoutes.delete('/api/activities/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Acceso Denegado: sólo administradores pueden eliminar actividades.' }, 403);
  }

  const id = c.req.param('id');
  const current = await c.env.DB.prepare(
    'SELECT id, name, is_active FROM activities WHERE id = ?'
  )
    .bind(id)
    .first<{ id: string; name: string; is_active: number }>();
  if (!current) {
    return c.json({ error: 'Actividad no encontrada.' }, 404);
  }

  const countRes = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM prospect_activities WHERE activity_id = ?'
  )
    .bind(id)
    .first<{ n: number }>();
  const prospectCount = countRes?.n || 0;

  await c.env.DB.prepare('UPDATE activities SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();

  return c.json({ success: true, deletedId: id, prospectCount });
});

/**
 * Actividades de interés de un prospecto (para la Ficha)
 */
activitiesRoutes.get('/api/leads/:id/activities', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');

  const lead = await c.env.DB.prepare('SELECT id, assigned_to FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);
  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const res = await c.env.DB.prepare(`
    SELECT a.id, a.name, a.is_active, pa.created_at as assigned_at
    FROM prospect_activities pa
    JOIN activities a ON a.id = pa.activity_id
    WHERE pa.lead_id = ?
    ORDER BY pa.created_at ASC
  `)
    .bind(leadId)
    .all<LeadInterestRow>();

  return c.json({ interests: res.results || [] });
});

/**
 * Asociar una actividad a un prospecto — flujo único desde la Ficha:
 *  - { activity_id }: asocia una existente del catálogo.
 *  - { name }: crea la actividad en el catálogo (o reactiva/deduplica) y la asocia.
 * Un prospecto no puede tener la misma actividad dos veces (409 amigable).
 */
activitiesRoutes.post('/api/leads/:id/activities', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const lead = await c.env.DB.prepare('SELECT id, assigned_to, full_name FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);
  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const now = new Date().toISOString();
  let activityId = (body.activity_id as string)?.trim() || '';
  let activityName = '';
  let createdNew = false;

  if (activityId) {
    const activity = await c.env.DB.prepare(
      'SELECT id, name, is_active FROM activities WHERE id = ?'
    )
      .bind(activityId)
      .first<{ id: string; name: string; is_active: number }>();
    if (!activity) {
      return c.json({ error: 'Actividad no encontrada en el catálogo.' }, 404);
    }
    if (!activity.is_active) {
      return c.json(
        { error: `La actividad "${activity.name}" fue eliminada del catálogo. Reactívala desde el Catálogo de actividades.` },
        400
      );
    }
    activityName = activity.name;
  } else {
    const name = String(body.name || '').trim();
    if (!name || name.length > 60) {
      return c.json({ error: 'Indica la actividad existente o el nombre de la nueva.' }, 400);
    }
    const nameNorm = normalizeActivityName(name);

    const existing = await c.env.DB.prepare(
      'SELECT id, name, is_active FROM activities WHERE name_norm = ?'
    )
      .bind(nameNorm)
      .first<{ id: string; name: string; is_active: number }>();

    if (existing) {
      // Reutilizar la entrada existente del catálogo (nunca duplicar)
      activityId = existing.id;
      activityName = existing.name;
      if (!existing.is_active) {
        await c.env.DB.prepare(
          'UPDATE activities SET name = ?, is_active = 1, updated_at = ? WHERE id = ?'
        )
          .bind(name, now, existing.id)
          .run();
        activityName = name;
      }
    } else {
      activityId = `act_${crypto.randomUUID().slice(0, 8)}`;
      activityName = name;
      await c.env.DB.prepare(
        'INSERT INTO activities (id, name, name_norm, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)'
      )
        .bind(activityId, name, nameNorm, user.userId, now, now)
        .run();
      createdNew = true;
    }
  }

  // Evitar duplicado (actividad ya asociada a este prospecto)
  const already = await c.env.DB.prepare(
    'SELECT id FROM prospect_activities WHERE lead_id = ? AND activity_id = ?'
  )
    .bind(leadId, activityId)
    .first();
  if (already) {
    return c.json({ error: `"${activityName}" ya está asociada a este prospecto.` }, 409);
  }

  await c.env.DB.prepare(
    'INSERT INTO prospect_activities (id, lead_id, activity_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(`pa_${crypto.randomUUID().slice(0, 8)}`, leadId, activityId, user.userId, now)
    .run();

  return c.json(
    { success: true, interest: { id: activityId, name: activityName, is_active: 1 }, createdNew },
    201
  );
});

/**
 * Quitar una actividad de un prospecto (la actividad permanece en el catálogo)
 */
activitiesRoutes.delete('/api/leads/:id/activities/:activityId', async (c) => {
  const user = c.get('user');
  const leadId = c.req.param('id');
  const activityId = c.req.param('activityId');

  const lead = await c.env.DB.prepare('SELECT id, assigned_to FROM leads WHERE id = ?')
    .bind(leadId)
    .first<Lead>();
  if (!lead) return c.json({ error: 'Lead no encontrado' }, 404);
  if (user.role === 'agent' && lead.assigned_to !== user.userId) {
    return c.json({ error: 'Acceso Denegado' }, 403);
  }

  const res = await c.env.DB.prepare(
    'DELETE FROM prospect_activities WHERE lead_id = ? AND activity_id = ?'
  )
    .bind(leadId, activityId)
    .run();
  if (!res.success || res.meta.changes === 0) {
    return c.json({ error: 'Esa actividad no está asociada a este prospecto.' }, 404);
  }

  return c.json({ success: true, removedActivityId: activityId });
});
