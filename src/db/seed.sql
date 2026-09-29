-- Fitness CRM Initial Seed
-- Solo usuario Administrador inicial (Password: admin123 -> 'admin123' sha256: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9)

INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
('usr_admin_1', 'Administrador', 'admin@fitnessclub.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1);

-- Registro de inicialización limpia del sistema
INSERT OR IGNORE INTO audit_logs (id, user_id, entity_type, entity_id, action, details) VALUES
('aud_1', 'usr_admin_1', 'system', 'system', 'system_init', 'Base de datos inicializada limpia con usuario administrador.');
