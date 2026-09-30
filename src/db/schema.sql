-- Fitness CRM Database Schema for Cloudflare D1 (SQLite)

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

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK(status IN ('nuevo', 'contactado', 'negociacion', 'ganado', 'perdido')),
  segment TEXT NOT NULL DEFAULT 'B' CHECK(segment IN ('A', 'B', 'C', 'D')),
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  notes_summary TEXT,
  last_contacted_at TEXT,
  last_inbound_at TEXT,
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  handoff_at TEXT,
  handoff_reason TEXT,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action_type TEXT NOT NULL CHECK(action_type IN ('note', 'status_change', 'segment_change', 'assignment', 'whatsapp_sent', 'ai_generated', 'creation', 'update')),
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  sender TEXT NOT NULL CHECK(sender IN ('agent', 'lead', 'system')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'document', 'audio')),
  content TEXT NOT NULL,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_message_id TEXT UNIQUE,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

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
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'reconnect_required')),
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-instruct',
  ai_tone TEXT DEFAULT 'motivador, consultivo y enfocado en cierre de ventas',
  ai_instructions TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('plan_precio', 'horario_sede', 'politica', 'objecion_frecuente', 'entrenadores')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Catálogo central de Actividades de interés (fuente de verdad de nombres).
-- name_norm (minúsculas, sin acentos) previene duplicados (Pilates/pilates/PILATES).
-- is_active = borrado lógico (patrón existente de users/knowledge_base):
-- las relaciones de prospectos se preservan (nunca quedan referencias rotas).
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Relación Prospecto <-> Actividad (N:M). Un prospecto no puede tener la
-- misma actividad dos veces (UNIQUE) y eliminar una actividad o prospecto
-- no deja referencias huérfanas (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS prospect_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Semilla del catálogo inicial de actividades (idempotente)
INSERT OR IGNORE INTO activities (id, name, name_norm, is_active) VALUES
  ('act_gym', 'Gym', 'gym', 1),
  ('act_crossfit', 'CrossFit', 'crossfit', 1),
  ('act_natacion', 'Natación', 'natacion', 1),
  ('act_escalada', 'Escalada', 'escalada', 1),
  ('act_pilates', 'Pilates', 'pilates', 1);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_segment ON leads(segment);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_lead ON whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_wa_id ON whatsapp_messages(whatsapp_message_id);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_activities_name_norm ON activities(name_norm);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_lead ON prospect_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_activity ON prospect_activities(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_activities_unique ON prospect_activities(lead_id, activity_id);
