-- Seed data for Fitness CRM

-- Insert initial Users (Passwords: admin123 -> 'admin123' sha256: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9, agent123 -> 'agent123' sha256: e6c279f016cdaf216e232122f86d44bf30b85d268f3974c5711f8b40721010a3)
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
('usr_admin_1', 'Carlos Mendoza (Director)', 'admin@ironpeak.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1),
('usr_agent_1', 'Valeria Ríos (Coach Ventas)', 'valeria@ironpeak.fit', 'e6c279f016cdaf216e232122f86d44bf30b85d268f3974c5711f8b40721010a3', 'agent', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80', 1),
('usr_agent_2', 'Mateo Silva (Asesor Deportivo)', 'mateo@ironpeak.fit', 'e6c279f016cdaf216e232122f86d44bf30b85d268f3974c5711f8b40721010a3', 'agent', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', 1);

-- Insert Message Templates with placeholders
INSERT OR IGNORE INTO message_templates (id, title, category, content, created_by) VALUES
('tmpl_1', 'Bienvenida & Clase de Prueba', 'primer_contacto', '¡Hola {nombre}! 💪 Te saluda {agente} de IronPeak Fitness. Vimos que tienes interés en nuestro programa de {producto} en {ciudad}. Tenemos clases de cortesía esta semana. ¿Te gustaría apartar tu lugar hoy o mañana?', 'usr_admin_1'),
('tmpl_2', 'Reactivación de Prospecto Inactivo', 'reactivacion', 'Hola {nombre}, ¿cómo estás? Hace unos días platicamos sobre tu meta de {producto}. Lanzamos un pase especial para entrenar en {ciudad} con plan nutricional incluido. ¿Aún te gustaría retomar tu meta fitness? 🏋️', 'usr_admin_1'),
('tmpl_3', 'Recordatorio de Cita / Diagnóstico Físico', 'seguimiento', '¡Hola {nombre}! Te confirmamos tu valoración física para tu plan de {producto}. Recuerda traer ropa deportiva cómoda y una toalla. ¿Tienes alguna pregunta antes de visitarnos en {ciudad}?', 'usr_admin_1'),
('tmpl_4', 'Cierre Promoción Membresía Anual', 'cierre', '¡Hola {nombre}! 🚀 Apartamos un beneficio exclusivo de 20% de descuento en la Membresía Anual de {producto} para ti. La promoción concluye hoy a las 8:00 PM. ¿Te gustaría que te envíe el enlace de pago seguro para congelar tu tarifa?', 'usr_admin_1');

-- Insert Initial Leads with Structured Metadata, Segments, Tags and Activities
INSERT OR IGNORE INTO leads (id, full_name, phone, email, status, segment, assigned_to, tags, metadata, notes_summary, last_contacted_at, created_by, updated_by) VALUES
(
  'lead_101',
  'Sofía Morales',
  '+525512345678',
  'sofia.morales@gmail.com',
  'cita_agendada',
  'A',
  'usr_agent_1',
  '["CrossFit", "Pérdida de Grasa", "VIP"]',
  '{"presupuesto": 180, "objetivo": "Perder 6kg para su boda", "horario_preferido": "Mañanas 7:00 AM", "ciudad": "Ciudad de México", "sede": "Polanco", "producto": "CrossFit Pro + Nutrición"}',
  'Muy motivada, agendó valoración física para el jueves.',
  DATETIME('now', '-2 hours'),
  'usr_admin_1',
  'usr_agent_1'
),
(
  'lead_102',
  'Diego Fernández',
  '+525598765432',
  'diego.f@outlook.com',
  'negociacion',
  'A',
  'usr_agent_2',
  '["Personal Trainer", "Hipertrofia", "Membresía Anual"]',
  '{"presupuesto": 250, "objetivo": "Ganancia muscular e hipertrofia", "horario_preferido": "Tardes 6:30 PM", "ciudad": "Guadalajara", "sede": "Chapultepec", "producto": "Plan Élite 1-on-1"}',
  'Interesado en paquete semestral con entrenador personal.',
  DATETIME('now', '-1 days'),
  'usr_admin_1',
  'usr_agent_2'
),
(
  'lead_103',
  'Camila Vargas',
  '+525545678901',
  'camila.vargas@yahoo.com',
  'contactado',
  'B',
  'usr_agent_1',
  '["Pilates", "Flexibilidad", "Nutrición"]',
  '{"presupuesto": 95, "objetivo": "Mejorar postura y movilidad", "horario_preferido": "Mediodía", "ciudad": "Monterrey", "sede": "San Pedro", "producto": "Pilates Reformer"}',
  'Respondio en WhatsApp, pidió detalles de precios por sesión.',
  DATETIME('now', '-3 days'),
  'usr_admin_1',
  'usr_agent_1'
),
(
  'lead_104',
  'Alejandro Torres',
  '+525523456789',
  'atorres.dev@gmail.com',
  'nuevo',
  'B',
  'usr_agent_2',
  '["Musculación", "Principiante"]',
  '{"presupuesto": 80, "objetivo": "Iniciar rutina de pesas por primera vez", "horario_preferido": "Noches 8:00 PM", "ciudad": "Ciudad de México", "sede": "Roma Norte", "producto": "Membresía General"}',
  'Lead entrante desde campaña de Instagram ads.',
  DATETIME('now', '-5 hours'),
  'usr_admin_1',
  'usr_admin_1'
),
(
  'lead_105',
  'Mariana Gómez',
  '+525578901234',
  'mariana.gomez@gmail.com',
  'contactado',
  'C',
  'usr_agent_1',
  '["Funcional", "Reactivación"]',
  '{"presupuesto": 60, "objetivo": "Acondicionamiento físico general", "horario_preferido": "Sábados", "ciudad": "Querétaro", "sede": "Juriquilla", "producto": "Entrenamiento Funcional"}',
  'No contesta llamadas desde hace 16 días. Enviar mensaje de reactivación.',
  DATETIME('now', '-16 days'),
  'usr_admin_1',
  'usr_agent_1'
),
(
  'lead_106',
  'Roberto Castillo',
  '+525589012345',
  'rcastillo@empresa.com',
  'ganado',
  'A',
  'usr_agent_2',
  '["Membresía Anual", "Black IronPeak"]',
  '{"presupuesto": 400, "objetivo": "Plan corporativo y bienestar", "horario_preferido": "Flexible", "ciudad": "Ciudad de México", "sede": "Polanco", "producto": "Pase Black Anual"}',
  'Cierre concretado con pago con tarjeta de crédito.',
  DATETIME('now', '-4 days'),
  'usr_admin_1',
  'usr_agent_2'
),
(
  'lead_107',
  'Lucía Herrera',
  '+525534567890',
  'lucia_herrera@hotmail.com',
  'perdido',
  'D',
  'usr_agent_1',
  '["Descartado"]',
  '{"presupuesto": 20, "objetivo": "Buscaba gimnasio municipal gratuito", "ciudad": "Puebla", "sede": "Angelópolis", "producto": "General"}',
  'Se mudó de ciudad y no tiene presupuesto acorde a planes.',
  DATETIME('now', '-35 days'),
  'usr_admin_1',
  'usr_agent_1'
);

-- Insert Activity Logs (Bitácora)
INSERT OR IGNORE INTO activity_logs (id, lead_id, user_id, action_type, details, created_at) VALUES
('act_1', 'lead_101', 'usr_admin_1', 'creation', 'Lead registrado mediante formulario web.', DATETIME('now', '-3 days')),
('act_2', 'lead_101', 'usr_admin_1', 'assignment', 'Asignado a Valeria Ríos mediante asignación directa.', DATETIME('now', '-3 days')),
('act_3', 'lead_101', 'usr_agent_1', 'whatsapp_sent', 'Enviado mensaje de bienvenida y agendamiento de clase prueba.', DATETIME('now', '-2 days')),
('act_4', 'lead_101', 'usr_agent_1', 'status_change', 'Estado actualizado a Cita Agendada para el jueves 10:00 AM.', DATETIME('now', '-2 hours')),
('act_5', 'lead_102', 'usr_agent_2', 'note', 'Cliente pide desglose de costos para 3 sesiones semanales con personal trainer.', DATETIME('now', '-1 days')),
('act_6', 'lead_105', 'usr_agent_1', 'segment_change', 'Reclasificado automáticamente a Segmento C por inactividad > 14 días.', DATETIME('now', '-2 days'));

-- Insert Audit Logs
INSERT OR IGNORE INTO audit_logs (id, user_id, entity_type, entity_id, action, details) VALUES
('aud_1', 'usr_admin_1', 'system', 'system', 'seed_initialization', 'Inicialización de base de datos con datos de prueba.');
