-- Migración 0001: soporte de stickers de WhatsApp
-- Idempotente y 100% segura: garantiza la existencia de la tabla stickers y sus índices
-- sin operaciones destructivas ni recreaciones de tabla que puedan poner en riesgo datos de producción.

PRAGMA defer_foreign_keys = true;

-- 1) Tabla de stickers compartidos
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
CREATE INDEX IF NOT EXISTS idx_stickers_created ON stickers(created_at DESC);

-- 2) Asegurar índices para whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_lead_created ON whatsapp_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_unread ON whatsapp_messages(lead_id, sender, status) WHERE status != 'read';

