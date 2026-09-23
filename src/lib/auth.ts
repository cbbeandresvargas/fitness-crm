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

  // Set HTTP-only Cookie
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    secure: false, // allows localhost testing in dev
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
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
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
  const user = c.get('user');
  if (!user) {
    return c.redirect('/login');
  }
  await next();
}

export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: { user?: SessionData } }>,
  next: Next
) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.text('Acceso Denegado: Esta acción requiere rol de Administrador', 403);
  }
  await next();
}
