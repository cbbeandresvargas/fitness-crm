import { Hono } from 'hono';
import { Env, MessageTemplate, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { Layout } from '../views/Layout';
import { TemplatesView } from '../views/TemplatesView';

export const templatesRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

templatesRoutes.use('*', requireAuth);

templatesRoutes.get('/templates', async (c) => {
  const user = c.get('user');
  const templatesRes = await c.env.DB.prepare('SELECT * FROM message_templates ORDER BY created_at DESC')
    .all<MessageTemplate>();

  return c.html(
    Layout({
      title: 'Plantillas de WhatsApp',
      user,
      currentPath: '/templates',
      children: TemplatesView({
        user,
        templates: templatesRes.results || [],
      }),
    })
  );
});

templatesRoutes.post('/templates', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();

  const title = (body['title'] as string)?.trim();
  const category = (body['category'] as string) || 'general';
  const content = (body['content'] as string)?.trim();

  if (!title || !content) {
    return c.redirect('/templates');
  }

  const id = `tmpl_${crypto.randomUUID().slice(0, 8)}`;
  await c.env.DB.prepare(`
    INSERT INTO message_templates (id, title, category, content, created_by)
    VALUES (?, ?, ?, ?, ?)
  `)
    .bind(id, title, category, content, user.userId)
    .run();

  return c.redirect('/templates');
});

templatesRoutes.post('/templates/:id/delete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM message_templates WHERE id = ?').bind(id).run();
  return c.redirect('/templates');
});
