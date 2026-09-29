-- Script para limpiar datos demo y conservar únicamente el usuario administrador
DELETE FROM whatsapp_messages;
DELETE FROM activity_logs;
DELETE FROM leads;
DELETE FROM message_templates;
DELETE FROM knowledge_base;
DELETE FROM users WHERE id != 'usr_admin_1';

-- Asegurar que el usuario administrador existe
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
('usr_admin_1', 'Administrador', 'admin@fitnessclub.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1);

