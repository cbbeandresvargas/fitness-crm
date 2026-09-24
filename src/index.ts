import { Hono } from 'hono';
import { Env, SessionData } from './lib/types';
import { authMiddleware } from './lib/auth';
import { authRoutes } from './routes/auth';
import { leadsRoutes } from './routes/leads';
import { templatesRoutes } from './routes/templates';
import { importExportRoutes } from './routes/importExport';
import { teamRoutes } from './routes/team';

const app = new Hono<{ Bindings: Env; Variables: { user?: SessionData } }>();

// Auto-bootstrap local D1 database schema if empty (Ensures zero-friction development)
app.use('*', async (c, next) => {
  try {
    const checkTable = await c.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (!checkTable) {
      console.log('⚡ Base de datos inicializándose por primera vez...');
      // Execute schema creation
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
            status TEXT NOT NULL DEFAULT 'nuevo' CHECK(status IN ('nuevo', 'contactado', 'cita_agendada', 'negociacion', 'ganado', 'perdido')),
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
            whatsapp_message_id TEXT,
            created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
          );
        `),
        // Seed users
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
          ('usr_admin_1', 'Carlos Mendoza (Director)', 'admin@ironpeak.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1),
          ('usr_agent_1', 'Valeria Ríos (Coach Ventas)', 'valeria@ironpeak.fit', 'e6c279f016cdaf216e232122f86d44bf30b85d268f3974c5711f8b40721010a3', 'agent', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80', 1),
          ('usr_agent_2', 'Mateo Silva (Asesor Deportivo)', 'mateo@ironpeak.fit', 'e6c279f016cdaf216e232122f86d44bf30b85d268f3974c5711f8b40721010a3', 'agent', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', 1);
        `),
        // Seed templates
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO message_templates (id, title, category, content, created_by) VALUES
          ('tmpl_1', 'Bienvenida & Clase de Prueba', 'primer_contacto', '¡Hola {nombre}! 💪 Te saluda {agente} de IronPeak Fitness. Vimos que tienes interés en nuestro programa de {producto} en {ciudad}. Tenemos clases de cortesía esta semana. ¿Te gustaría apartar tu lugar hoy o mañana?', 'usr_admin_1'),
          ('tmpl_2', 'Reactivación de Prospecto Inactivo', 'reactivacion', 'Hola {nombre}, ¿cómo estás? Hace unos días platicamos sobre tu meta de {producto}. Lanzamos un pase especial para entrenar en {ciudad} con plan nutricional incluido. ¿Aún te gustaría retomar tu meta fitness? 🏋️', 'usr_admin_1'),
          ('tmpl_3', 'Recordatorio de Cita / Diagnóstico Físico', 'seguimiento', '¡Hola {nombre}! Te confirmamos tu valoración física para tu plan de {producto}. Recuerda traer ropa deportiva cómoda y una toalla. ¿Tienes alguna pregunta antes de visitarnos en {ciudad}?', 'usr_admin_1'),
          ('tmpl_4', 'Cierre Promoción Membresía Anual', 'cierre', '¡Hola {nombre}! 🚀 Apartamos un beneficio exclusivo de 20% de descuento en la Membresía Anual de {producto} para ti. La promoción concluye hoy a las 8:00 PM. ¿Te gustaría que te envíe el enlace de pago seguro para congelar tu tarifa?', 'usr_admin_1');
        `),
        // Seed initial leads
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO leads (id, full_name, phone, email, status, segment, assigned_to, tags, metadata, notes_summary, last_contacted_at, created_by, updated_by) VALUES
          ('lead_101', 'Sofía Morales', '+525512345678', 'sofia.morales@gmail.com', 'cita_agendada', 'A', 'usr_agent_1', '["CrossFit", "Pérdida de Grasa", "VIP"]', '{"presupuesto": 180, "objetivo": "Perder 6kg para su boda", "horario_preferido": "Mañanas 7:00 AM", "ciudad": "Ciudad de México", "sede": "Polanco", "producto": "CrossFit Pro + Nutrición"}', 'Muy motivada, agendó valoración física para el jueves.', DATETIME('now', '-2 hours'), 'usr_admin_1', 'usr_agent_1'),
          ('lead_102', 'Diego Fernández', '+525598765432', 'diego.f@outlook.com', 'negociacion', 'A', 'usr_agent_2', '["Personal Trainer", "Hipertrofia", "Membresía Anual"]', '{"presupuesto": 250, "objetivo": "Ganancia muscular e hipertrofia", "horario_preferido": "Tardes 6:30 PM", "ciudad": "Guadalajara", "sede": "Chapultepec", "producto": "Plan Élite 1-on-1"}', 'Interesado en paquete semestral con entrenador personal.', DATETIME('now', '-1 days'), 'usr_admin_1', 'usr_agent_2'),
          ('lead_103', 'Camila Vargas', '+525545678901', 'camila.vargas@yahoo.com', 'contactado', 'B', 'usr_agent_1', '["Pilates", "Flexibilidad", "Nutrición"]', '{"presupuesto": 95, "objetivo": "Mejorar postura y movilidad", "horario_preferido": "Mediodía", "ciudad": "Monterrey", "sede": "San Pedro", "producto": "Pilates Reformer"}', 'Respondio en WhatsApp, pidió detalles de precios por sesión.', DATETIME('now', '-3 days'), 'usr_admin_1', 'usr_agent_1'),
          ('lead_104', 'Alejandro Torres', '+525523456789', 'atorres.dev@gmail.com', 'nuevo', 'B', 'usr_agent_2', '["Musculación", "Principiante"]', '{"presupuesto": 80, "objetivo": "Iniciar rutina de pesas por primera vez", "horario_preferido": "Noches 8:00 PM", "ciudad": "Ciudad de México", "sede": "Roma Norte", "producto": "Membresía General"}', 'Lead entrante desde campaña de Instagram ads.', DATETIME('now', '-5 hours'), 'usr_admin_1', 'usr_admin_1'),
          ('lead_105', 'Mariana Gómez', '+525578901234', 'mariana.gomez@gmail.com', 'contactado', 'C', 'usr_agent_1', '["Funcional", "Reactivación"]', '{"presupuesto": 60, "objetivo": "Acondicionamiento físico general", "horario_preferido": "Sábados", "ciudad": "Querétaro", "sede": "Juriquilla", "producto": "Entrenamiento Funcional"}', 'No contesta llamadas desde hace 16 días. Enviar mensaje de reactivación.', DATETIME('now', '-16 days'), 'usr_admin_1', 'usr_agent_1'),
          ('lead_106', 'Roberto Castillo', '+525589012345', 'rcastillo@empresa.com', 'ganado', 'A', 'usr_agent_2', '["Membresía Anual", "Black IronPeak"]', '{"presupuesto": 400, "objetivo": "Plan corporativo y bienestar", "horario_preferido": "Flexible", "ciudad": "Ciudad de México", "sede": "Polanco", "producto": "Pase Black Anual"}', 'Cierre concretado con pago con tarjeta de crédito.', DATETIME('now', '-4 days'), 'usr_admin_1', 'usr_agent_2');
        `),
        // Seed initial activities
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO activity_logs (id, lead_id, user_id, action_type, details, created_at) VALUES
          ('act_1', 'lead_101', 'usr_admin_1', 'creation', 'Lead registrado mediante formulario web.', DATETIME('now', '-3 days')),
          ('act_2', 'lead_101', 'usr_agent_1', 'whatsapp_sent', 'Enviado mensaje de bienvenida y agendamiento de clase prueba.', DATETIME('now', '-2 days')),
          ('act_3', 'lead_101', 'usr_agent_1', 'status_change', 'Estado actualizado a Cita Agendada para el jueves.', DATETIME('now', '-2 hours')),
          ('act_4', 'lead_105', 'usr_agent_1', 'segment_change', 'Reclasificado automáticamente a Segmento C por inactividad > 14 días.', DATETIME('now', '-2 days'));
        `),
        // Seed initial demo WhatsApp messages
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO whatsapp_messages (id, lead_id, user_id, sender, message_type, content, media_url, status, created_at) VALUES
          ('msg_1', 'lead_101', 'usr_agent_1', 'agent', 'text', '¡Hola Sofía! 💪 Te saluda Valeria de IronPeak Fitness Polanco. ¿Pudiste revisar los horarios para tu valoración física?', NULL, 'read', DATETIME('now', '-2 days')),
          ('msg_2', 'lead_101', NULL, 'lead', 'text', '¡Hola Valeria! Sí, me queda perfecto el jueves a las 7:00 AM antes de entrar a la oficina. ¿Qué debo llevar?', NULL, 'read', DATETIME('now', '-1 days')),
          ('msg_3', 'lead_101', 'usr_agent_1', 'agent', 'text', 'Excelente Sofía. Trae ropa cómoda, toalla y tu termo de agua. Te comparto la ficha con el programa de CrossFit Pro y nutrición que revisaremos:', NULL, 'delivered', DATETIME('now', '-3 hours')),
          ('msg_4', 'lead_101', 'usr_agent_1', 'agent', 'image', 'Programa de Entrenamiento Pro - IronPeak Polanco', 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80', 'sent', DATETIME('now', '-2 hours'));
        `),
      ]);
      console.log('✅ Base de datos inicializada con éxito.');
    } else {
      // Ensure whatsapp_messages exists for existing tables
      await c.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id TEXT PRIMARY KEY,
          lead_id TEXT NOT NULL,
          user_id TEXT,
          sender TEXT NOT NULL,
          message_type TEXT NOT NULL DEFAULT 'text',
          content TEXT NOT NULL,
          media_url TEXT,
          status TEXT NOT NULL DEFAULT 'sent',
          whatsapp_message_id TEXT,
          created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
        );
      `).run();
    }
  } catch (err) {
    console.error('Error al inicializar D1:', err);
  }
  await next();
});

// Middleware de sesión
app.use('*', authMiddleware);

// Rutas de API y autenticación
app.route('/', authRoutes);
app.route('/', leadsRoutes);
app.route('/', templatesRoutes);
app.route('/', importExportRoutes);
app.route('/', teamRoutes);

// Servir estáticos o SPA de SolidJS para rutas que no son de API
app.all('*', async (c) => {
  // Si Cloudflare Workers Static Assets está disponible, dejar que sirva el archivo estático o index.html
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
