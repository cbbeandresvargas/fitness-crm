# ⚡ IronPeak Fitness CRM

Plataforma CRM de alto rendimiento desarrollada para el sector fitness y gestión de prospectos de alto valor, construida sobre arquitectura edge con **Hono**, **Cloudflare Workers**, **Cloudflare D1** (SQLite relacional), **Cloudflare KV** (sesiones ultra-rápidas), **Cloudflare R2** (almacenamiento de importaciones y adjuntos) y **Cloudflare Workers AI** (mensajería inteligente para WhatsApp).

---

## 🎨 Diseño & Estética
- **Paleta Atlética**: Fondo negro carbón (`#09090b`), superficies elevadas (`#121215`), acentos naranja vibrante (`#f97316` / `#ff5500`), bordes sutiles y micro-animaciones.
- **Tipografía**: Plus Jakarta Sans.
- **Tailwind CSS**: Integración ligera en tiempo de ejecución (CDN) optimizada para serverless rendering con TSX/JSX en Cloudflare Workers.

---

## 🚀 Módulos y Funcionalidades Principales

### 1. Gestión de Leads y Pipeline
- **Asignación de Leads**: Modo manual o asignación automática balanceada (**Round-Robin**) entre agentes activos.
- **Segmentación Dinámica en Tiempo Real**: Motor de reglas para clasificar automáticamente a cada prospecto:
  - **Segmento A (VIP / Alta Intención)**: Presupuesto $\ge$ $150 USD, citas agendadas o clientes ganados.
  - **Segmento B (Tibio / Seguimiento Regular)**: Actividad reciente $\le$ 7 días.
  - **Segmento C (Frío / Reactivación)**: Inactividad $\ge$ 14 días.
  - **Segmento D (Descartado)**: Marcados como perdidos o inactividad $>$ 30 días.
- **Historial de Actividades y Bitácora**: Línea de tiempo cronológica inmutable con registro de notas, cambios de etapa, mensajes de WhatsApp y reasignaciones.
- **Detección Estricta de Duplicados**: Normalización y validación instantánea por número telefónico / WhatsApp tanto en el formulario unitario como en la importación masiva.

### 2. Integración de WhatsApp y Mensajería AI
- **Plantillas con Placeholders Dinámicos**: Variables `{nombre}`, `{producto}`, `{ciudad}`, `{agente}`, `{presupuesto}`.
- **Deep Link Directo**: Generación de botones con enlace directo `https://wa.me/{numero}?text={url_encoded}` para apertura instantánea en WhatsApp Web o móvil sin fricción.
- **Contexto para la IA**: Inyección del perfil completo del lead (etapa, presupuesto, objetivos, tags y últimas 4 notas de bitácora) en el prompt para redactar mensajes hiper-personalizados.

### 3. Perfil de Usuario y Metadatos Estructurados
- **Metadatos Flexibles (JSONB / Key-Value)**: Almacenamiento dinámico de objetivos deportivos, lesiones, sedes o presupuestos en D1 sin alterar el esquema relacional.
- **Etiquetado Rápido (Chips / Tags)**: Filtros instantáneos por intereses (`#CrossFit`, `#Nutricion`, `#Hipertrofia`, `#Pilates`, `#MembresiaVIP`).

### 4. Importación, Exportación y Mapeo Inteligente
- **Mapeo Dinámico de Columnas CSV**: Asignación visual de encabezados de archivos a los campos del CRM.
- **Validación con Reporte de Errores**: Previsualización fila por fila detectando duplicados o datos faltantes sin abortar toda la carga.
- **Almacenamiento en Cloudflare R2**: Persistencia de archivos importados.
- **Exportación Filtrada**: Descarga de prospectos a CSV filtrados por segmento, etapa o agente.

### 5. Seguridad y Control de Acceso (RBAC)
- **Roles Definidos**:
  - **Admin**: Visibilidad total, reasignación global, importación/exportación masiva, gestión de equipo y bitácora de auditoría.
  - **Agente / Ventas**: Restricción estricta; visualiza y gestiona únicamente los prospectos asignados a su cartera.
- **Auditoría de Seguridad**: Trazabilidad con campos `created_by`, `updated_by` y timestamps en cada registro.

---

## 🌐 Despliegue en Vivo (Cloudflare Workers)

- 🔗 **URL de Producción**: [https://fitness-crm.andresvm10.workers.dev](https://fitness-crm.andresvm10.workers.dev)
- 🗄️ **Base de Datos D1**: `fitness-crm-db`
- ⚡ **Sesiones KV**: `KV`
- 📦 **Bucket R2**: `fitness-crm-storage`
- 🧠 **Workers AI**: `@cf/meta/llama-3.1-8b-instruct`

---

## 💻 Inicio Rápido en Local

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor local con Cloudflare Wrangler
npm run dev
```

El servidor iniciará en `http://127.0.0.1:8787`.

### Credenciales de Demostración:
- **Director (Admin)**: `admin@ironpeak.fit` / `admin123`
- **Coach Ventas (Agente)**: `valeria@ironpeak.fit` / `agent123`
*(También disponibles mediante botones de acceso rápido de 1-click en `/login`)*.
