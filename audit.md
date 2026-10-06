# Auditoría Técnica Integral y Diagnóstico del Proyecto: Fitness CRM

**Proyecto:** Fitness CRM  
**Stack Principal:** Cloudflare Workers, Hono, Cloudflare D1 (SQLite), Cloudflare KV, Cloudflare R2, Cloudflare Workers AI, Solid.js, Tailwind CSS v4, TypeScript, Vite.  
**Entorno de Ejecución:** Cloudflare Workers (Plan Free - Límite de 50ms CPU por petición)  
**Mercado Objetivo:** Bolivia (+591, números móviles de 8 dígitos)  
**Fecha:** 6 de Octubre de 2026  
**Equipo Auditor:** Orquestador Multiagente (Backend, Frontend, UX/UI, Base de Datos, CI/CD y QA)

---

## 1. Veredicto y Opinión General del Proyecto

Fitness CRM cuenta con una base arquitectónica moderna y de alto rendimiento en el Edge de Cloudflare, integrando APIs en Hono, persistencia en D1, KV y R2, e inferencia nativa con Workers AI, junto con una interfaz reactiva en Solid.js y Tailwind CSS v4.

Sin embargo, el sistema presentaba vulnerabilidades de seguridad de nivel crítico (inyección SQL, CORS desprotegido, bypass de verificación de webhooks), cuellos de botella de CPU críticos para el plan gratuito de Workers (consultas N+1, 5 subconsultas correlacionadas en la bandeja de WhatsApp), inconsistencias en el manejo de números telefónicos de Bolivia (+591), bugs de reactividad en el detalle de prospectos, respuestas de IA excesivamente largas/redundantes, y una ausencia total de pruebas automatizadas y pipelines de CI/CD.

A continuación se detalla la matriz de hallazgos y el plan de acción acordado.

---

## 2. Matriz de Errores, Vulnerabilidades y Riesgos Críticos

### 🚨 Severidad Crítica (P0)

1. **Inyección SQL directa por concatenación de strings:**
   - **Archivo:** `src/routes/whatsapp.ts` (L714)
   - **Problema:** `query += " AND (l.assigned_to = '" + user.userId + "' OR l.assigned_to IS NULL)";`  
     Se rompió la parametrización de consultas preparadas (`.bind()`), abriendo un vector de inyección SQL.
   - **Acción:** Parametrizar con `?` y `.bind(user.userId)`.

2. **CORS abierto con credenciales (`credentials: true`):**
   - **Archivo:** `src/index.ts` (L19-L25)
   - **Problema:** `origin: (origin) => origin || '*'` refleja dinámicamente cualquier origen solicitante con credenciales activas, permitiendo robo de datos cross-origin desde sitios web maliciosos.
   - **Acción:** Restringir los orígenes permitidos estrictamente al dominio de la aplicación o variables de entorno autorizadas.

3. **Bypass de firma HMAC en Webhook de WhatsApp (Fail-Open):**
   - **Archivo:** `src/lib/crypto.ts` (L82-L85) y `src/routes/whatsapp.ts` (L117)
   - **Problema:** Si `META_APP_SECRET` no está configurado, la función retorna `true`. Atacantes externos pueden enviar mensajes falsos, crear leads ilegítimos y saturar cuotas de IA sin autenticación.
   - **Acción:** Implementar política Fail-Closed: si falta el secreto o la firma no coincide con HMAC-SHA256, rechazar con HTTP 401.

4. **Normalización telefónica errónea para Bolivia (Rompe WhatsApp):**
   - **Archivo:** `src/lib/rules.ts:normalizePhone`
   - **Problema:** La lógica asumía números mexicanos de 10 dígitos y forzaba prefijo `+52`. Para números bolivianos de 8 dígitos (ej. `71234567`), se generaba `+71234567` (Rusia/Kazajistán), rompiendo los envíos a través de Meta WhatsApp Cloud API.
   - **Acción:** Adaptar `normalizePhone` para estándar boliviano: números de 8 dígitos que inician con 6 o 7 se formatean a `+591XXXXXXXX`. Si ya incluye 591, normalizar a `+591XXXXXXXX`.

5. **Pérdida de reactividad en rutas dinámicas de Solid.js:**
   - **Archivo:** `src/client/pages/LeadDetail.tsx` (L127-L134)
   - **Problema:** En Solid.js los componentes no se desmontan al navegar entre rutas con el mismo componente (`/leads/1` -> `/leads/2`). `loadLead()` estaba ligada exclusivamente a `onMount()`, congelando los datos del prospecto anterior en pantalla.
   - **Acción:** Usar `createEffect(() => { const id = params.id; if (id) loadLead(id); })`.

6. **Registros huérfanos por llaves foráneas inactivas en SQLite/D1:**
   - **Archivo:** `src/routes/leads.ts` (L999-L1013)
   - **Problema:** Cloudflare D1 opera con `PRAGMA foreign_keys = OFF` por defecto. Al borrar un lead, el código borraba `activity_logs` y `whatsapp_messages`, pero omitía `prospect_activities`, dejando huérfanos que corrompen las estadísticas N:M.
   - **Acción:** Incluir `DELETE FROM prospect_activities WHERE lead_id = ?` en la transacción `DB.batch()`.

---

### ⚠️ Severidad Alta (P1)

1. **Cuello de botella de CPU en Bandeja de WhatsApp (5 subconsultas correlacionadas):**
   - **Archivo:** `src/routes/whatsapp.ts` (L663-L718)
   - **Problema:** Cada fila evaluada ejecutaba 5 subconsultas SQL, provocando un filesort general que sobrepasa el límite de 50ms de CPU del plan Workers Free.
   - **Acción:** Refactorizar con CTE y funciones de ventana (`ROW_NUMBER()`) e índices compuestos (`idx_whatsapp_lead_created`).

2. **Respuestas de IA extensas, aburridas o redundantes:**
   - **Archivos:** `src/lib/ai/salesAgent.ts`, `src/lib/ai.ts`, `src/db/schema.sql`, `src/routes/whatsapp.ts`
   - **Problema:** El prompt del sistema y la configuración de tono inducían al modelo Llama 3 a generar textos largos, explicaciones no solicitadas y fórmulas comerciales acartonadas.
   - **Acción:** Reajustar el prompt del sistema y la configuración para que la IA responda de forma ultra directa, conversacional y concisa (1 a 3 frases cortas), con preguntas de cierre naturales para agendar visitas o clases de prueba, evitando rodeos innecesarios.

3. **Build de Vite lento (94 segundos) por barrel import de `lucide-solid`:**
   - **Problema:** `import { Icon } from 'lucide-solid'` forzaba a compilar más de 2,100 componentes JSX en cada build.
   - **Acción:** Optimizar importaciones o configuración de Vite para reducir el build a ~2 segundos.

4. **Listado de Leads sin Paginación (Riesgo OOM de 128 MB):**
   - **Archivo:** `src/routes/leads.ts` (L181-L234)
   - **Problema:** Descarga todos los leads en memoria en cada llamada a `/api/leads`.
   - **Acción:** Implementar paginación con `LIMIT` y `OFFSET`.

5. **Sesiones de usuarios desactivados activas en KV hasta 7 días:**
   - **Archivo:** `src/routes/team.ts` y `src/lib/auth.ts`
   - **Problema:** Al marcar `is_active = 0`, la sesión en KV seguía permitiendo acceso.
   - **Acción:** Verificar `is_active` en el middleware de autenticación o purgar la sesión de KV.

---

### 🟡 Severidad Media / Usabilidad y Accesibilidad (P2)

1. **Ruptura responsiva en Live Inbox de WhatsApp:**
   - **Archivo:** `src/client/pages/WhatsAppInbox.tsx`
   - **Problema:** En móviles (<768px), la lista de conversaciones y el chat se desbordan horizontalmente.
   - **Acción:** Implementar patrón Maestro-Detalle con botón "Volver" en vista móvil.

2. **Fallas severas de contraste en modo claro (WCAG 2.1 AA):**
   - **Archivo:** `src/client/components/SegmentBadge.tsx` e `index.css`
   - **Problema:** Textos naranja y ámbar sobre fondo claro tenían contraste menor a 2.1:1.
   - **Acción:** Aplicar clases adaptativas (ej. `text-orange-700 dark:text-orange-400`).

3. **Uso de primitivas bloqueantes `window.alert()` y `window.confirm()`:**
   - **Problema:** Diálogos nativos del navegador que congelan la interfaz.
   - **Acción:** Sustituir por toasts reactivos y modales de confirmación accesibles.

4. **Polling indiscriminado cada 3.5 segundos en WhatsApp:**
   - **Problema:** Peticiones continuas a D1/KV con la pestaña minimizada.
   - **Acción:** Respetar `document.hidden` y encadenar llamadas sólo tras recibir respuesta.

---

### 🟢 Calidad y CI/CD (P3)

1. **Ausencia total de Tests Automatizados:**
   - **Acción:** Configurar Vitest con pruebas unitarias para `normalizePhone`, `computeFcSegment`, parser de Excel y agentes de IA.
2. **Ausencia de Pipeline CI/CD:**
   - **Acción:** Configurar GitHub Actions (`ci.yml`) para ejecutar typecheck, build y test en cada PR.

---

## 3. Plan de Trabajo Coordinado

| Especialista | Misión Principal |
| :--- | :--- |
| **Backend** | Parches de seguridad (CORS, SQL injection, webhook fail-closed, auth active check, prompt de IA conciso y directo). |
| **Database** | Optimización de consultas D1 (CTE de WhatsApp Inbox, eliminación de huérfanos, índices compuestos). |
| **Frontend** | Hotfix de reactividad (`LeadDetail.tsx`), optimización de build de `lucide-solid`, ajuste de polling. |
| **UX/UI** | Responsividad móvil en WhatsApp Inbox, contrastes WCAG en modo claro y sustitución de `alert/confirm`. |
| **QA** | Configuración de Vitest, tests unitarios de reglas bolivianas, IA y validación general de parches. |
| **CI/CD** | Pipeline de GitHub Actions para validación estática y builds automáticos. |
