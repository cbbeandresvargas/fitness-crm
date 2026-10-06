-- Script para limpiar datos demo y conservar únicamente el usuario administrador
-- Ejecución atómica y ordenada para evitar registros huérfanos e inconsistencias referenciales

BEGIN TRANSACTION;

-- 1. Eliminar relaciones dependientes N:M
DELETE FROM prospect_activities;

-- 2. Eliminar mensajes y bitácoras asociadas a prospectos
DELETE FROM whatsapp_messages;
DELETE FROM activity_logs;

-- 3. Eliminar prospectos
DELETE FROM leads;

-- 4. Limpiar plantillas y base de conocimiento
DELETE FROM message_templates;
DELETE FROM knowledge_base;

-- 5. Limpiar registros de auditoría
DELETE FROM audit_logs;

-- 6. Limpiar usuarios secundarios (conservando administrador principal)
DELETE FROM users WHERE id != 'usr_admin_1';

-- 7. Asegurar que el usuario administrador existe
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
('usr_admin_1', 'Administrador', 'admin@fitnessclub.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1);

COMMIT;
