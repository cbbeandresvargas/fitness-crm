-- Fitness CRM Database Schema for Cloudflare D1 (SQLite)
-- Plataforma: Fitness Club Pass (Cochabamba, Bolivia)

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
  -- Campos desnormalizados optimizados para Cloudflare D1 (lectura O(LIMIT) en bandeja de entrada)
  last_message_text TEXT,
  last_message_time TEXT,
  last_message_sender TEXT CHECK(last_message_sender IN ('agent', 'lead', 'system')),
  last_message_status TEXT CHECK(last_message_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
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
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'document', 'audio', 'video', 'sticker')),
  content TEXT NOT NULL,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  whatsapp_message_id TEXT UNIQUE,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Biblioteca de stickers de WhatsApp compartida por todo el negocio (archivos en R2)
CREATE TABLE IF NOT EXISTS stickers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  animated INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL,
  meta_media_id TEXT,
  meta_media_expires_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id TEXT PRIMARY KEY,
  display_phone_number TEXT,
  verified_name TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected', 'disconnected', 'reconnect_required')),
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.2-3b-instruct',
  ai_tone TEXT DEFAULT 'directo, ágil, empático y comercial, enfocado en respuestas breves y agendar visitas',
  ai_instructions TEXT,
  business_context TEXT,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Catálogo de Actividades y Disciplinas disponibles
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
  updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- Relación Prospecto <-> Actividades de interés (N:M)
CREATE TABLE IF NOT EXISTS prospect_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- ============================================================================
-- Índices de alto rendimiento y optimización para Cloudflare D1
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_created ON leads(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_status_assigned ON leads(status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_segment ON leads(segment);
CREATE INDEX IF NOT EXISTS idx_leads_last_message_time ON leads(last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_last_msg ON leads(assigned_to, last_message_time DESC);
CREATE INDEX IF NOT EXISTS idx_leads_unread ON leads(unread_count) WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_lead_created ON whatsapp_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_unread ON whatsapp_messages(lead_id, sender, status) WHERE status != 'read';
CREATE INDEX IF NOT EXISTS idx_whatsapp_user_id ON whatsapp_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_stickers_created ON stickers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_active_name ON activities(is_active DESC, name COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_activity ON prospect_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_lead_created ON prospect_activities(lead_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_activities_unique ON prospect_activities(lead_id, activity_id);

-- ============================================================================
-- Triggers atómicos para sincronización de Inbox en tiempo real
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS trg_whatsapp_messages_after_insert
AFTER INSERT ON whatsapp_messages
BEGIN
  UPDATE leads
  SET 
    last_message_text = CASE 
      WHEN leads.last_message_time IS NULL OR NEW.created_at >= leads.last_message_time 
      THEN NEW.content 
      ELSE leads.last_message_text 
    END,
    last_message_time = CASE 
      WHEN leads.last_message_time IS NULL OR NEW.created_at >= leads.last_message_time 
      THEN NEW.created_at 
      ELSE leads.last_message_time 
    END,
    last_message_sender = CASE 
      WHEN leads.last_message_time IS NULL OR NEW.created_at >= leads.last_message_time 
      THEN NEW.sender 
      ELSE leads.last_message_sender 
    END,
    last_message_status = CASE 
      WHEN leads.last_message_time IS NULL OR NEW.created_at >= leads.last_message_time 
      THEN NEW.status 
      ELSE leads.last_message_status 
    END,
    unread_count = CASE 
      WHEN NEW.sender = 'lead' AND NEW.status != 'read' 
      THEN leads.unread_count + 1 
      ELSE leads.unread_count 
    END,
    updated_at = NEW.created_at
  WHERE id = NEW.lead_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_whatsapp_messages_after_update_status
AFTER UPDATE OF status ON whatsapp_messages
BEGIN
  UPDATE leads
  SET 
    unread_count = CASE 
      WHEN OLD.sender = 'lead' AND OLD.status != 'read' AND NEW.status = 'read' 
      THEN MAX(0, leads.unread_count - 1)
      WHEN OLD.sender = 'lead' AND OLD.status = 'read' AND NEW.status != 'read'
      THEN leads.unread_count + 1
      ELSE leads.unread_count
    END,
    last_message_status = CASE 
      WHEN NEW.created_at >= COALESCE(leads.last_message_time, '') 
      THEN NEW.status 
      ELSE leads.last_message_status 
    END,
    updated_at = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
  WHERE id = NEW.lead_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_whatsapp_messages_after_delete
AFTER DELETE ON whatsapp_messages
BEGIN
  UPDATE leads
  SET 
    unread_count = CASE 
      WHEN OLD.sender = 'lead' AND OLD.status != 'read' 
      THEN MAX(0, leads.unread_count - 1)
      ELSE leads.unread_count
    END,
    updated_at = strftime('%Y-%m-%d %H:%M:%fZ', 'now')
  WHERE id = OLD.lead_id;
END;
