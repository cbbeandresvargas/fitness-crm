import { Hono } from 'hono';
import { Env, User, SessionData } from '../lib/types';
import { hashPassword, createSession, destroySession, getSession } from '../lib/auth';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user?: SessionData } }>();

// Obtener usuario en sesión actual (para inicializar el cliente SolidJS)
authRoutes.get('/api/auth/me', async (c) => {
  const session = await getSession(c);
  return c.json({ user: session || null });
});

// Inicio de sesión normal
authRoutes.post('/api/auth/login', async (c) => {
  let email = '';
  let password = '';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await c.req.json();
    email = body.email?.trim().toLowerCase();
    password = body.password;
  } else {
    const body = await c.req.parseBody();
    email = (body['email'] as string)?.trim().toLowerCase();
    password = body['password'] as string;
  }

  if (!email || !password) {
    return c.json({ error: 'Ingresa correo y contraseña' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
    .bind(email)
    .first<User>();

  if (!user) {
    return c.json({ error: 'Credenciales inválidas o usuario inactivo' }, 401);
  }

  const hashed = await hashPassword(password);
  if (user.password_hash !== hashed) {
    return c.json({ error: 'Contraseña incorrecta' }, 401);
  }

  await createSession(c, user);

  const sessionData: SessionData = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
  };

  return c.json({ success: true, user: sessionData });
});

// Demo Login (1 clic)
authRoutes.post('/api/auth/demo-login', async (c) => {
  let targetRole = 'admin';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await c.req.json();
    targetRole = body.role || 'admin';
  } else {
    const body = await c.req.parseBody();
    targetRole = (body['role'] as string) || 'admin';
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
    .bind(targetRole)
    .first<User>();

  if (!user) {
    return c.json({ error: `No se encontró un usuario con rol ${targetRole}` }, 404);
  }

  await createSession(c, user);

  const sessionData: SessionData = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
  };

  return c.json({ success: true, user: sessionData });
});

// Cambio rápido de rol para pruebas
authRoutes.post('/api/auth/quick-switch', async (c) => {
  let targetRole = 'agent';

  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await c.req.json();
    targetRole = body.role || 'agent';
  } else {
    const body = await c.req.parseBody();
    targetRole = (body['role'] as string) || 'agent';
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
    .bind(targetRole)
    .first<User>();

  if (!user) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  await destroySession(c);
  await createSession(c, user);

  const sessionData: SessionData = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
  };

  return c.json({ success: true, user: sessionData });
});

// Cerrar sesión
authRoutes.all('/api/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ success: true });
});

// Rutas de compatibilidad legacy (/auth/*)
authRoutes.post('/auth/demo-login', async (c) => {
  const body = (await c.req.parseBody().catch(() => ({}))) as Record<string, any>;
  const targetRole = (body['role'] as string) || 'admin';

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE role = ? AND is_active = 1 LIMIT 1')
    .bind(targetRole)
    .first<User>();

  if (!user) {
    return c.json({ error: 'Usuario no encontrado' }, 404);
  }

  await createSession(c, user);

  const accept = c.req.header('accept') || '';
  if (accept.includes('application/json')) {
    return c.json({ success: true, user });
  }
  return c.redirect('/');
});

authRoutes.post('/auth/quick-switch', async (c) => {
  const body = (await c.req.parseBody().catch(() => ({}))) as Record<string, any>;
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
  return c.redirect('/');
});
