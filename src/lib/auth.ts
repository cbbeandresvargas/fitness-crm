import { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SessionData, User, Env } from './types';

const SESSION_COOKIE_NAME = 'fitcrm_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(
  c: Context<any>,
  user: User
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const sessionData: SessionData = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url,
  };

  // Store in Cloudflare KV
  await c.env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  // Set HTTP-only Cookie with dynamic HTTPS security
  const isHttps = c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https';
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
  });

  return sessionId;
}

export async function getSession(
  c: Context<any>
): Promise<SessionData | null> {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) return null;

  try {
    const raw = await c.env.KV.get(`session:${sessionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch (err) {
    console.error('Error fetching session from KV:', err);
    return null;
  }
}

export async function destroySession(
  c: Context<any>
): Promise<void> {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    try {
      await c.env.KV.delete(`session:${sessionId}`);
    } catch (err) {
      console.error('Error deleting session from KV:', err);
    }
  }
  const isHttps = c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https';
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: isHttps });
}

export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: { user?: SessionData } }>,
  next: Next
) {
  const session = await getSession(c);
  if (session) {
    c.set('user', session);
  }
  await next();
}

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: { user?: SessionData } }>,
  next: Next
) {
  const path = c.req.path;

  // Rutas públicas, assets estáticos o inicio de sesión
  if (
    path === '/login' ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/whatsapp/webhook') ||
    path.startsWith('/assets') ||
    path.includes('.')
  ) {
    return next();
  }

  const user = c.get('user');
  if (!user) {
    if (path.startsWith('/api/')) {
      return c.json({ error: 'No autorizado. Inicia sesión.' }, 401);
    }
    return c.redirect('/login');
  }
  await next();
}

export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: { user?: SessionData } }>,
  next: Next
) {
  const path = c.req.path;
  if (path.startsWith('/api/whatsapp/webhook')) {
    return next();
  }

  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    if (path.startsWith('/api/')) {
      return c.json({ error: 'Acceso Denegado: Esta acción requiere rol de Administrador' }, 403);
    }
    return c.redirect('/login');
  }
  await next();
}
