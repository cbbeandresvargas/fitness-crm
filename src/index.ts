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

// Cache en memoria para evitar consultas redundantes a sqlite_master en cada petición HTTP
let dbInitialized = false;

// Auto-bootstrap D1 database schema if empty (Zero-friction setup)
app.use('*', async (c, next) => {
  if (!dbInitialized && c.env.DB) {
    try {
      const checkTable = await c.env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      ).first();

      if (!checkTable) {
        console.log('⚡ Base de datos inicializándose por primera vez...');
        await c.env.DB.batch([
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              email TEXT UNIQUE NOT NULL,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('admin', 'agent')),
              avatar_url TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS leads (
              id TEXT PRIMARY KEY,
              full_name TEXT NOT NULL,
              phone TEXT UNIQUE NOT NULL,
              email TEXT,
              status TEXT NOT NULL DEFAULT 'nuevo' CHECK(status IN ('nuevo', 'contactado', 'negociacion', 'ganado', 'perdido')),
              segment TEXT NOT NULL DEFAULT 'B' CHECK(segment IN ('A', 'B', 'C', 'D')),
              assigned_to TEXT,
              tags TEXT NOT NULL DEFAULT '[]',
              metadata TEXT NOT NULL DEFAULT '{}',
              notes_summary TEXT,
              last_contacted_at TEXT,
              created_by TEXT,
              updated_by TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS activity_logs (
              id TEXT PRIMARY KEY,
              lead_id TEXT NOT NULL,
              user_id TEXT,
              action_type TEXT NOT NULL,
              details TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS message_templates (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              category TEXT NOT NULL DEFAULT 'general',
              content TEXT NOT NULL,
              created_by TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS audit_logs (
              id TEXT PRIMARY KEY,
              user_id TEXT,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              action TEXT NOT NULL,
              details TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS whatsapp_messages (
              id TEXT PRIMARY KEY,
              lead_id TEXT NOT NULL,
              user_id TEXT,
              sender TEXT NOT NULL,
              message_type TEXT NOT NULL DEFAULT 'text',
              content TEXT NOT NULL,
              media_url TEXT,
              status TEXT NOT NULL DEFAULT 'sent',
              whatsapp_message_id TEXT UNIQUE,
              ai_generated INTEGER NOT NULL DEFAULT 0,
              raw_payload TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS whatsapp_settings (
              id TEXT PRIMARY KEY,
              waba_id TEXT,
              phone_number_id TEXT,
              display_phone_number TEXT,
              verified_name TEXT,
              access_token_cipher TEXT,
              access_token_iv TEXT,
              access_token_tag TEXT,
              access_token_last4 TEXT,
              verify_token TEXT,
              app_secret TEXT,
              status TEXT NOT NULL DEFAULT 'disconnected',
              ai_enabled INTEGER NOT NULL DEFAULT 1,
              ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-instruct',
              ai_tone TEXT DEFAULT 'enérgico, motivador, empático y altamente enfocado en cerrar ventas',
              ai_instructions TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS knowledge_base (
              id TEXT PRIMARY KEY,
              category TEXT NOT NULL,
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS activities (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              name_norm TEXT NOT NULL UNIQUE,
              is_active INTEGER NOT NULL DEFAULT 1,
              created_by TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
              updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS prospect_activities (
              id TEXT PRIMARY KEY,
              lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
              activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
              created_by TEXT,
              created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
            );
          `),
          c.env.DB.prepare(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_activities_unique ON prospect_activities(lead_id, activity_id);
          `),
          c.env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_prospect_activities_lead ON prospect_activities(lead_id);
          `),
          c.env.DB.prepare(`
            CREATE INDEX IF NOT EXISTS idx_prospect_activities_activity ON prospect_activities(activity_id);
          `),
          // Semilla de usuario administrador inicial
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
            ('usr_admin_1', 'Administrador', 'admin@fitnessclub.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1);
          `),
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO audit_logs (id, user_id, entity_type, entity_id, action, details) VALUES
            ('aud_1', 'usr_admin_1', 'system', 'system', 'system_init', 'Base de datos inicializada limpia con usuario administrador.');
          `),
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO whatsapp_settings (
              id, waba_id, phone_number_id, display_phone_number, verified_name,
              verify_token, status, ai_enabled, ai_model, ai_tone, ai_instructions
            ) VALUES (
              'ws_default', '109283746591029', '551234567890123', '+52 55 1234 5678',
              'Fitness Club Center', 'fitnessclub_secure_verify_token_2026', 'disconnected', 1,
              '@cf/meta/llama-3.1-8b-instruct',
              'enérgico, motivador, empático y altamente enfocado en agendar valoraciones y cerrar ventas',
              'Siempre busca descubrir el objetivo deportivo principal del prospecto (pérdida de grasa, hipertrofia o salud). Ofrece una clase de valoración diagnóstica sin costo en su sede más cercana y propón dos horarios alternativos para concretar la cita. Si el cliente pregunta por precios, presenta el Plan Élite o Pase Black destacando beneficios antes de dar la cifra.'
            );
          `),
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO knowledge_base (id, category, title, content, is_active) VALUES
            ('kb_1', 'plan_precio', 'Membresía General Fitness Club (Acceso Total)', 'Precio mensual: $75 USD / mes. Incluye: Acceso ilimitado a zona de peso libre, máquinas de última generación, cardio y vestidores premium con sauna en cualquiera de nuestras sedes.', 1),
            ('kb_2', 'plan_precio', 'Programa CrossFit Pro + Nutrición Deportiva', 'Precio mensual: $140 USD / mes. Incluye: Clases guiadas en grupos reducidos con Head Coaches certificados, programación WOD personalizada, pesajes quincenales y plan nutricional adaptado.', 1),
            ('kb_3', 'plan_precio', 'Pase Black Anual (Todo Incluido VIP)', 'Precio de contado o 12 MSI: $699 USD anual ($58 USD/mes equivalente, ahorro del 25%). Incluye: Acceso a todas las sedes nacionales, 5 pases de invitado por mes, toallas, casillero fijo y 2 sesiones mensuales con entrenador personal.', 1),
            ('kb_4', 'plan_precio', 'Plan Élite Personal Trainer 1-on-1', 'Paquete de 12 sesiones: $220 USD. Paquete de 20 sesiones: $340 USD. Cada sesión dura 60 minutos con un coach deportivo dedicado exclusivamente a tu técnica, progresión de cargas y objetivos.', 1),
            ('kb_5', 'horario_sede', 'Sedes y Horarios de Apertura', 'Polanco (CDMX): Lun-Vie 5:30am-11pm. Sáb-Dom 7am-6pm. Roma Norte: Lun-Vie 6am-10:30pm. Guadalajara: Lun-Vie 6am-10pm. Monterrey: Lun-Dom 5:30am-10pm.', 1),
            ('kb_6', 'objecion_frecuente', 'Manejo de Objeción: "No tengo tiempo para entrenar"', 'Argumento de cierre: "Comprendo totalmente tu ritmo. Diseñamos entrenamientos HIIT Express de 45 minutos efectivos a las 6:00 AM o a las 8:00 PM. ¿Qué horario se adaptaría mejor a tu jornada?"', 1),
            ('kb_7', 'objecion_frecuente', 'Manejo de Objeción: "Se me hace caro / fuera de presupuesto"', 'Argumento de cierre: "En Fitness Club tienes seguimiento continuo de coaches para ver resultados desde el primer mes. Además hoy congelamos tu inscripción gratis. ¿Te parece si vienes a una valoración diagnóstica gratuita antes de decidir?"', 1);
          `),
          c.env.DB.prepare(`
            INSERT OR IGNORE INTO activities (id, name, name_norm, is_active) VALUES
            ('act_gym', 'Gym', 'gym', 1),
            ('act_crossfit', 'CrossFit', 'crossfit', 1),
            ('act_natacion', 'Natación', 'natacion', 1),
            ('act_escalada', 'Escalada', 'escalada', 1),
            ('act_pilates', 'Pilates', 'pilates', 1);
          `),
        ]);
        console.log('✅ Base de datos inicializada limpia con usuario administrador.');
      }
      dbInitialized = true;
    } catch (err) {
      console.error('Error al inicializar D1:', err);
    }
  }
  await next();
});

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
