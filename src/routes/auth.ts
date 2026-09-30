import { Hono } from 'hono';
import { Env, User, SessionData } from '../lib/types';
import { hashPassword, createSession, destroySession, getSession } from '../lib/auth';

export const authRoutes = new Hono<{ Bindings: Env; Variables: { user?: SessionData } }>();

// Obtener usuario en sesión actual (para inicializar el cliente SolidJS)
authRoutes.get('/api/auth/me', async (c) => {
  const session = await getSession(c);
  return c.json({ user: session || null });
});

// Inicio de sesión seguro con credenciales
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
    return c.json({ error: 'Credenciales inválidas o usuario inactivo' }, 401);
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

// Cerrar sesión
authRoutes.all('/api/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ success: true });
});

// Logout directo por navegación HTTP
authRoutes.get('/auth/logout', async (c) => {
  await destroySession(c);
  return c.redirect('/login');
});
