import { Hono } from 'hono';
import { Env, User, AuditLog, SessionData } from '../lib/types';
import { requireAuth, requireAdmin, hashPassword } from '../lib/auth';
import { Layout } from '../views/Layout';
import { TeamView } from '../views/TeamView';

export const teamRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

teamRoutes.use('*', requireAuth);
teamRoutes.use('*', requireAdmin);

/**
 * Vista de equipo, gestión RBAC y bitácora de auditoría
 */
teamRoutes.get('/team', async (c) => {
  const user = c.get('user');

  const usersRes = await c.env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<User>();
  const auditRes = await c.env.DB.prepare(`
    SELECT a.*, u.name as user_name 
    FROM audit_logs a 
    LEFT JOIN users u ON u.id = a.user_id 
    ORDER BY a.created_at DESC 
    LIMIT 25
  `).all<AuditLog>();

  return c.html(
    Layout({
      title: 'Equipo & Auditoría RBAC',
      user,
      currentPath: '/team',
      children: TeamView({
        user,
        users: usersRes.results || [],
        auditLogs: auditRes.results || [],
      }),
    })
  );
});

/**
 * Crear nuevo agente o administrador
 */
teamRoutes.post('/team/new', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();

  const name = (body['name'] as string)?.trim();
  const email = (body['email'] as string)?.trim().toLowerCase();
  const password = body['password'] as string;
  const role = ((body['role'] as string) || 'agent') as 'admin' | 'agent';

  if (!name || !email || !password) {
    return c.redirect('/team');
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
    INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details)
    VALUES (?, ?, 'user', ?, 'create_user', ?)
  `)
    .bind(
      `aud_${crypto.randomUUID().slice(0, 8)}`,
      user.userId,
      newUserId,
      `Creado nuevo usuario ${name} (${email}) con rol '${role}'`
    )
    .run();

  return c.redirect('/team');
});

/**
 * Activar o desactivar usuario
 */
teamRoutes.post('/team/:id/toggle-status', async (c) => {
  const user = c.get('user');
  const targetId = c.req.param('id');

  if (targetId === user.userId) {
    return c.redirect('/team');
  }

  const targetUser = await c.env.DB.prepare('SELECT is_active, name FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ is_active: number; name: string }>();

  if (targetUser) {
    const newStatus = targetUser.is_active ? 0 : 1;
    await c.env.DB.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
      .bind(newStatus, new Date().toISOString(), targetId)
      .run();

    await c.env.DB.prepare(`
      INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details)
      VALUES (?, ?, 'user', ?, 'toggle_status', ?)
    `)
      .bind(
        `aud_${crypto.randomUUID().slice(0, 8)}`,
        user.userId,
        targetId,
        `Usuario ${targetUser.name} ${newStatus ? 'activado' : 'desactivado'}`
      )
      .run();
  }

  return c.redirect('/team');
});
