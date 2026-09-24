import { Hono } from 'hono';
import { Env, User, AuditLog, SessionData } from '../lib/types';
import { requireAuth, requireAdmin, hashPassword } from '../lib/auth';

export const teamRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

teamRoutes.use('*', requireAuth);
teamRoutes.use('*', requireAdmin);

/**
 * Vista de equipo, gestión RBAC y bitácora de auditoría
 */
teamRoutes.get('/api/team', async (c) => {
  const usersRes = await c.env.DB.prepare('SELECT id, name, email, role, avatar_url, is_active, created_at FROM users ORDER BY created_at ASC').all<User>();
  const auditRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM audit_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    ORDER BY a.created_at DESC 
    LIMIT 30
  `).all<AuditLog>();

  return c.json({
    users: usersRes.results || [],
    auditLogs: auditRes.results || [],
  });
});

/**
 * Crear nuevo agente o administrador
 */
teamRoutes.post('/api/team/new', async (c) => {
  const user = c.get('user');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const name = (body.name as string)?.trim();
  const email = (body.email as string)?.trim().toLowerCase();
  const password = body.password as string;
  const role = ((body.role as string) || 'agent') as 'admin' | 'agent';

  if (!name || !email || !password) {
    return c.json({ error: 'Nombre, correo y contraseña requeridos' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ error: 'Ya existe un usuario con este correo' }, 409);
  }

  const hashedPassword = await hashPassword(password);
  const newUserId = `usr_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `)
    .bind(newUserId, name, email, hashedPassword, role, now, now)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details, created_at)
    VALUES (?, ?, 'user', ?, 'create_user', ?, ?)
  `)
    .bind(
      `aud_${crypto.randomUUID().slice(0, 8)}`,
      user.userId,
      newUserId,
      `Creado nuevo usuario ${name} (${email}) con rol '${role}'`,
      now
    )
    .run();

  return c.json({
    success: true,
    user: { id: newUserId, name, email, role, is_active: 1, created_at: now },
  }, 201);
});

/**
 * Activar o desactivar usuario
 */
teamRoutes.post('/api/team/:id/toggle-status', async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');

  if (targetId === user.userId) {
    return c.json({ error: 'No puedes desactivar tu propia cuenta' }, 400);
  }

  const targetUser = await c.env.DB.prepare('SELECT is_active, name FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ is_active: number; name: string }>();

  if (!targetUser) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  const newStatus = targetUser.is_active ? 0 : 1;
  const now = new Date().toISOString();

  await c.env.DB.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
    .bind(newStatus, now, targetId)
    .run();

  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details, created_at)
    VALUES (?, ?, 'user', ?, 'toggle_status', ?, ?)
  `)
    .bind(
      `aud_${crypto.randomUUID().slice(0, 8)}`,
      user.userId,
      targetId,
      `Usuario ${targetUser.name} ${newStatus ? 'activado' : 'desactivado'}`,
      now
    )
    .run();

  return c.json({ success: true, is_active: newStatus });
});
