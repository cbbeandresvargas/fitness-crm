-- Fitness CRM Initial Seed para Producción
-- Empresa: Fitness Club Pass (Cochabamba, Bolivia)

-- 1. Usuario Administrador Inicial (Password: admin123 -> sha256: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9)
INSERT OR IGNORE INTO users (id, name, email, password_hash, role, avatar_url, is_active) VALUES
('usr_admin_1', 'Administrador', 'admin@fitnessclub.fit', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80', 1);

-- 2. Configuración predeterminada de WhatsApp y de IA
INSERT OR IGNORE INTO whatsapp_settings (
  id, waba_id, phone_number_id, display_phone_number, verified_name,
  verify_token, status, ai_enabled, ai_model, ai_tone, ai_instructions
) VALUES (
  'ws_default', '', '', '+591 60750474', 'Fitness Club Pass',
  'fitnessclub_secure_verify_token_2026', 'connected', 1,
  '@cf/meta/llama-3.2-3b-instruct',
  'enérgico, asesor consultivo, empático y altamente enfocado en cerrar suscripciones de Fitness Club Pass',
  'Fitness Club Pass es la plataforma de pases multideporte en Cochabamba, Bolivia. Con una sola membresía en la app, el usuario accede a múltiples centros deportivos, gimnasios, natación, crossfit, pádel y canchas de toda la ciudad. Todos los precios están en Bolivianos (Bs). La moneda oficial es Bs. El objetivo del asesor es indagar qué disciplinas le interesan al prospecto, explicar cómo la app le da pases flexibles y guiarlo a comprar su suscripción para activar su cuenta en la app.'
);

-- 3. Base de Conocimiento Inicial en Bolivianos (Bs) - Totalmente editable desde el CRM
INSERT OR IGNORE INTO knowledge_base (id, category, title, content, is_active) VALUES
('kb_plan_1', 'plan_precio', 'Pase Fit Básico (Bs 180 / mes)', 'Precio: Bs 180 al mes. Incluye: 8 pases mensuales válidos en gimnasios aliados y salas de pesas/cardio en Cochabamba. Ideal para quienes entrenan 2 veces por semana.', 1),
('kb_plan_2', 'plan_precio', 'Pase Fit Pro (Bs 280 / mes)', 'Precio: Bs 280 al mes. Incluye: 16 pases mensuales con acceso a gimnasios completos, box de crossfit, pilates y clases funcionales en Cochabamba. El plan más vendido.', 1),
('kb_plan_3', 'plan_precio', 'Pase Total Black VIP (Bs 380 / mes)', 'Precio: Bs 380 al mes. Incluye: Pases ilimitados mensuales con acceso a toda la red de centros deportivos, piscinas de natación, crossfit, pádel y gimnasios premium en Cochabamba.', 1),
('kb_plan_4', 'plan_precio', 'Plan Trimestral Ahorro (Bs 750 por 3 meses)', 'Precio: Bs 750 pago trimestral (equivale a Bs 250/mes). Ahorro directo con acceso Pro a toda la red y congelamiento de tarifa.', 1),
('kb_app_1', 'como_funciona_app', '¿Cómo funciona la App de Fitness Club Pass?', 'El cliente adquiere su suscripción por WhatsApp o enlace web y de inmediato se activa su cuenta en la aplicación móvil. En la app puede ver el mapa con todos los centros deportivos y gimnasios afiliados en Cochabamba, ver cuántos pases tiene disponibles en el mes y generar su código de acceso al ingresar a cada centro. No necesita pagar nada extra en recepción.', 1),
('kb_centros_1', 'centros_aliados', 'Centros Deportivos y Zonas en Cochabamba', 'Nuestra red cubre las principales zonas de Cochabamba: Zona Norte, Cala Cala, América, Zona Central, Recoleta y Sarco. Disciplinas disponibles: Gimnasios de Musculación, CrossFit, Natación, Pádel, Funcional, Calistenia, Boxeo y Yoga.', 1),
('kb_obj_1', 'objecion_frecuente', 'Manejo de Objeción: "¿Por qué no pagar un solo gimnasio?"', 'Argumento: "En un gimnasio tradicional pagas la mensualidad completa y te atas a un solo lugar. Con Fitness Club Pass pagas lo mismo en Bs pero tienes variedad total: puedes hacer pesas un día cerca de tu trabajo, crossfit otro día y natación o pádel el fin de semana sin pagar doble."', 1),
('kb_obj_2', 'objecion_frecuente', 'Manejo de Objeción: "¿Tienen clase o pase de prueba?"', 'Argumento: "¡Claro que sí! Podemos coordinar la activación de tu primer pase para que descargues la app y pruebes el centro deportivo que más te guste en Cochabamba. ¿Qué zona o disciplina te queda más cómoda para empezar?"', 1),
('kb_obj_3', 'objecion_frecuente', 'Manejo de Objeción: "Se me hace caro"', 'Argumento: "Nuestros planes empiezan desde solo Bs 180 al mes. Si fueras a dos gimnasios distintos pagarías más de Bs 400. Con Fitness Club Pass tienes libertad total de entrenar donde quieras por una fracción del costo."', 1);

-- 4. Plantillas Rápidas de Mensajes en WhatsApp
INSERT OR IGNORE INTO message_templates (id, title, category, content, created_by, created_at, updated_at) VALUES
('tmpl_1', 'Bienvenida Multideporte Cochabamba', 'primer_contacto', '¡Hola {nombre}! Te saluda {agente} de Fitness Club Pass Cochabamba. Con nuestra app tienes acceso a múltiples gimnasios, box de crossfit, piscinas y centros deportivos de la ciudad con una sola membresía en Bs. ¿Qué disciplina o zona de Cochabamba te queda más cómoda para entrenar?', 'usr_admin_1', DATETIME('now'), DATETIME('now')),
('tmpl_2', 'Explicación de la App y Planes en Bs', 'seguimiento', '¡Hola {nombre}! Te comento cómo funciona: al suscribirte a Fitness Club Pass activas tu cuenta en la app móvil y recibes tus pases para entrenar en cualquiera de nuestros centros aliados en Cochabamba. Tenemos planes desde Bs 180 al mes. ¿Te gustaría que te envíe los detalles de los planes para elegir el tuyo?', 'usr_admin_1', DATETIME('now'), DATETIME('now')),
('tmpl_3', 'Activación de Cuenta y QR de Pago', 'cierre', '¡Excelente decisión {nombre}! Tu cuenta de Fitness Club Pass está lista para habilitarse. Te comparto nuestro código QR / datos de transferencia para activar tus pases en la app hoy mismo. ¿Prefieres pago por QR simple o transferencia bancaria?', 'usr_admin_1', DATETIME('now'), DATETIME('now')),
('tmpl_4', 'Reactivación de Suscripción', 'reactivacion', '¡Hola {nombre}! Te escribimos de Fitness Club Pass. Este mes incorporamos nuevos centros deportivos y gimnasios en Cochabamba. Tenemos un beneficio especial en tu renovación si reactivas tu suscripción esta semana. ¿Aún estás con ganas de entrenar?', 'usr_admin_1', DATETIME('now'), DATETIME('now'));

-- 5. Catálogo de Actividades / Disciplinas Multideporte
INSERT OR IGNORE INTO activities (id, name, name_norm, is_active) VALUES
('act_gym', 'Musculación / Gym', 'musculacion / gym', 1),
('act_crossfit', 'CrossFit', 'crossfit', 1),
('act_natacion', 'Natación', 'natacion', 1),
('act_padel', 'Pádel', 'padel', 1),
('act_pilates', 'Pilates / Yoga', 'pilates / yoga', 1),
('act_artes_marciales', 'Boxeo / Artes Marciales', 'boxeo / artes marciales', 1),
('act_funcional', 'Funcional / Calistenia', 'funcional / calistenia', 1);

-- 6. Log inicial de auditoría
INSERT OR IGNORE INTO audit_logs (id, user_id, entity_type, entity_id, action, details) VALUES
('aud_init', 'usr_admin_1', 'system', 'system', 'system_init', 'Base de datos inicializada limpia para Fitness Club Pass Cochabamba.');
