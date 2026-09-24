import { Hono } from 'hono';
import { Env, MessageTemplate, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';

export const templatesRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

templatesRoutes.use('*', requireAuth);

templatesRoutes.get('/api/templates', async (c) => {
  const templatesRes = await c.env.DB.prepare('SELECT * FROM message_templates ORDER BY created_at DESC')
    .all<MessageTemplate>();

  return c.json({ templates: templatesRes.results || [] });
});

templatesRoutes.post('/api/templates', async (c) => {
  const user = c.get('user');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const title = (body.title as string)?.trim();
  const category = (body.category as string) || 'general';
  const content = (body.content as string)?.trim();

  if (!title || !content) {
    return c.json({ error: 'Título y contenido requeridos' }, 400);
  }

  const id = `tmpl_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO message_templates (id, title, category, content, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(id, title, category, content, user.userId, now, now)
    .run();

  return c.json({
    success: true,
    template: { id, title, category, content, created_by: user.userId, created_at: now },
  }, 201);
});

templatesRoutes.all('/api/templates/:id/delete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM message_templates WHERE id = ?').bind(id).run();
  return c.json({ success: true, id });
});

templatesRoutes.delete('/api/templates/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM message_templates WHERE id = ?').bind(id).run();
  return c.json({ success: true, id });
});
