import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, SessionData } from './lib/types';
import { authMiddleware } from './lib/auth';
import { authRoutes } from './routes/auth';
import { leadsRoutes } from './routes/leads';
import { templatesRoutes } from './routes/templates';
import { importExportRoutes } from './routes/importExport';
import { teamRoutes } from './routes/team';
import { whatsappRoutes } from './routes/whatsapp';
import { activitiesRoutes } from './routes/activities';

const app = new Hono<{ Bindings: Env; Variables: { user?: SessionData } }>();

// Router principal


// Middleware de CORS para desarrollo local y peticiones seguras con credenciales
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'x-hub-signature-256'],
  maxAge: 86400,
}));

// Middleware de sesión global
app.use('*', authMiddleware);

// Rutas de API y autenticación
app.route('/', authRoutes);
app.route('/', leadsRoutes);
app.route('/', templatesRoutes);
app.route('/', importExportRoutes);
app.route('/', teamRoutes);
app.route('/', whatsappRoutes);
app.route('/', activitiesRoutes);

// Servir estáticos o SPA de SolidJS con protección de rutas web
app.all('*', async (c) => {
  const path = c.req.path;
  const user = c.get('user');

  // Si es un endpoint de API que no existió o no coincidió, responder 404 JSON (NUNCA HTML)
  if (path.startsWith('/api/')) {
    return c.json({ error: `Ruta de API '${path}' no encontrada` }, 404);
  }

  // Si no es un asset estático compilado (JS, CSS, imágenes, favicon, etc.)
  const isStaticFile = path.includes('.') || path.startsWith('/assets/');

  if (!isStaticFile) {
    // Si no está autenticado y accede a rutas privadas web, redirigir a /login
    if (!user && path !== '/login') {
      return c.redirect('/login');
    }
    // Si ya está autenticado e intenta ir a /login, redirigir al Dashboard principal
    if (user && path === '/login') {
      return c.redirect('/');
    }
  }

  // Si Cloudflare Workers Static Assets está disponible, servir el asset o index.html
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === 'function') {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not found', 404);
});

// Manejo de errores
app.onError((err, c) => {
  console.error('Error no controlado en Worker:', err);
  return c.json({ error: err.message || 'Error interno del servidor' }, 500);
});

export default app;
