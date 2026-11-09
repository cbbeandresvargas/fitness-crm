-- Migración 0002: Optimización crítica de lecturas en Cloudflare D1 (SQLite)
-- Elimina full-scans O(N_mensajes) en el listado de inbox desnormalizando
-- last_message_* y unread_count en la tabla `leads`, indexados y sincronizados
-- mediante triggers atómicos en SQLite y backfill automático.

PRAGMA defer_foreign_keys = true;

-- ============================================================================
-- 1. DESNORMALIZACIÓN EN TABLA `leads`
-- ============================================================================
ALTER TABLE leads ADD COLUMN last_message_text TEXT;
ALTER TABLE leads ADD COLUMN last_message_time TEXT;
ALTER TABLE leads ADD COLUMN last_message_sender TEXT;
ALTER TABLE leads ADD COLUMN last_message_status TEXT;
ALTER TABLE leads ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- 2. ÍNDICES DE ALTO RENDIMIENTO (COVERING Y COMPUESTOS)
-- ============================================================================

-- Índice principal para bandeja de entrada (Inbox):
-- Permite paginar las conversaciones activas leyendo estrictamente LIMIT filas
CREATE INDEX IF NOT EXISTS idx_leads_last_message_time ON leads(last_message_time DESC);

-- Índice compuesto para Inbox de asesores (filtro por asignación + orden cronológico)
CREATE INDEX IF NOT EXISTS idx_leads_assigned_last_msg ON leads(assigned_to, last_message_time DESC);

-- Índice parcial para conteo y filtrado rápido de prospectos con mensajes pendientes
CREATE INDEX IF NOT EXISTS idx_leads_unread ON leads(unread_count) WHERE unread_count > 0;

-- Índice para ordenamiento sin sorts en memoria de actividades por prospecto
CREATE INDEX IF NOT EXISTS idx_prospect_activities_lead_created ON prospect_activities(lead_id, created_at ASC);

-- Índice en clave foránea user_id en whatsapp_messages para evitar escaneos en joins
CREATE INDEX IF NOT EXISTS idx_whatsapp_user_id ON whatsapp_messages(user_id);

-- Índice en catálogo de actividades ordenadas por estado y nombre
CREATE INDEX IF NOT EXISTS idx_activities_active_name ON activities(is_active DESC, name COLLATE NOCASE ASC);

-- Índices en tablas auxiliares para auditoría y plantillas
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON message_templates(category);

-- ============================================================================
-- 3. SCRIPT DE BACKFILL PARA DATOS EXISTENTES
-- ============================================================================
-- Poblar last_message_* y unread_count con los mensajes históricos en whatsapp_messages
UPDATE leads
SET 
  last_message_text = (
    SELECT m.content 
    FROM whatsapp_messages m 
    WHERE m.lead_id = leads.id 
    ORDER BY m.created_at DESC, m.id DESC 
    LIMIT 1
  ),
  last_message_time = (
    SELECT m.created_at 
    FROM whatsapp_messages m 
    WHERE m.lead_id = leads.id 
    ORDER BY m.created_at DESC, m.id DESC 
    LIMIT 1
  ),
  last_message_sender = (
    SELECT m.sender 
    FROM whatsapp_messages m 
    WHERE m.lead_id = leads.id 
    ORDER BY m.created_at DESC, m.id DESC 
    LIMIT 1
  ),
  last_message_status = (
    SELECT m.status 
    FROM whatsapp_messages m 
    WHERE m.lead_id = leads.id 
    ORDER BY m.created_at DESC, m.id DESC 
    LIMIT 1
  ),
  unread_count = (
    SELECT COUNT(*) 
    FROM whatsapp_messages m 
    WHERE m.lead_id = leads.id AND m.sender = 'lead' AND m.status != 'read'
  )
WHERE EXISTS (
  SELECT 1 FROM whatsapp_messages m WHERE m.lead_id = leads.id
);

-- ============================================================================
-- 4. TRIGGERS ATÓMICOS PARA MANTENER LA CONSISTENCIA EN TIEMPO REAL
-- ============================================================================

-- Trigger 1: Al insertar un nuevo mensaje, actualizar el lead de forma atómica
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

-- Trigger 2: Al actualizar el estado de entrega o lectura de un mensaje
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

-- Trigger 3: Al eliminar un mensaje, descontar si era no leído
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
