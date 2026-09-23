import { Hono } from 'hono';
import { Env, User } from '../lib/types';
import { hashPassword, createSession, destroySession, getSession } from '../lib/auth';
import { LoginView } from '../views/LoginView';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user?: any } }>();

authRoutes.get('/login', async (c) => {
  const session = await getSession(c);
  if (session) {
    return c.redirect('/');
  }
  return c.html(LoginView({}));
});

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.parseBody();
  const email = (body['email'] as string)?.trim().toLowerCase();
  const password = body['password'] as string;

  if (!email || !password) {
    return c.html(LoginView({ error: 'Ingresa correo y contraseña' }));
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
    .bind(email)
    .first<User>();

  if (!user) {
    return c.html(LoginView({ error: 'Credenciales inválidas o usuario inactivo' }));
  }

  const hashed = await hashPassword(password);
  if (user.password_hash !== hashed) {
    return c.html(LoginView({ error: 'Contraseña incorrecta' }));
  }

  await createSession(c, user);
  return c.redirect('/');
});

authRoutes.post('/auth/demo-login', async (c) => {
  const body = await c.req.parseBody();
  const targetRole = (body['role'] as string) || 'admin';

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
    .bind(targetRole)
    .first<User>();

  if (!user) {
    return c.html(LoginView({ error: `No se encontró un usuario con rol ${targetRole}` }));
  }

  await createSession(c, user);
  return c.redirect('/');
});

authRoutes.post('/auth/quick-switch', async (c) => {
  const body = await c.req.parseBody();
  const targetRole = (body['role'] as string) || 'agent';

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
    .bind(targetRole)
    .first<User>();

  if (user) {
    await destroySession(c);
    await createSession(c, user);
  }

  return c.redirect(c.req.header('Referer') || '/');
});

authRoutes.get('/auth/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/login');
});
