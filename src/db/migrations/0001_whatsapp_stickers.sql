-- Migración 0001: soporte de stickers de WhatsApp
-- Aplicar sobre bases ya existentes (schema.sql usa CREATE IF NOT EXISTS y no altera tablas previas):
--   npx wrangler d1 execute fitness-crm-db --local  --file=src/db/migrations/0001_whatsapp_stickers.sql
--   npx wrangler d1 execute fitness-crm-db --remote --file=src/db/migrations/0001_whatsapp_stickers.sql -y
-- Aplicar UNA sola vez (la reconstrucción de whatsapp_messages es idempotente en datos, pero innecesaria).

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

-- 2) Ampliar CHECK de whatsapp_messages.message_type ('video', 'sticker').
--    SQLite no permite alterar un CHECK: se reconstruye la tabla preservando datos.
CREATE TABLE whatsapp_messages_new (
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

INSERT INTO whatsapp_messages_new (
  id, lead_id, user_id, sender, message_type, content, media_url, status, whatsapp_message_id, ai_generated, raw_payload, created_at
)
SELECT id, lead_id, user_id, sender, message_type, content, media_url, status, whatsapp_message_id, ai_generated, raw_payload, created_at
FROM whatsapp_messages;

DROP TABLE whatsapp_messages;
ALTER TABLE whatsapp_messages_new RENAME TO whatsapp_messages;

CREATE INDEX IF NOT EXISTS idx_whatsapp_lead_created ON whatsapp_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_unread ON whatsapp_messages(lead_id, sender, status) WHERE status != 'read';
