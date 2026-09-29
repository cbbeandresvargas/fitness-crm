# ⚡ Fitness Club CRM

Plataforma CRM de alto rendimiento desarrollada para el sector fitness y gestión de prospectos de alto valor, construida sobre arquitectura edge con **Hono**, **Cloudflare Workers**, **Cloudflare D1** (SQLite relacional), **Cloudflare KV** (sesiones ultra-rápidas), **Cloudflare R2** (almacenamiento de importaciones y adjuntos) y **Cloudflare Workers AI** (mensajería inteligente para WhatsApp).

---

## 🎨 Diseño & Estética
- **Paleta Fuego**: Acento primario naranja vibrante (`#FF9933`), acento hover coral (`#FF6666`) y acento profundo rojo (`#CC3333`) para gradientes y estados fuertes.
- **Modo Claro / Oscuro**: Conmutador de tema en la cabecera (y en `/login`) con persistencia en `localStorage` y detección automática de la preferencia del sistema (`prefers-color-scheme`).
  - **Oscuro**: Fondo negro carbón (`#09090b`), superficies elevadas (`#121215`), bordes sutiles y micro-animaciones.
  - **Claro**: Superficies blancas y crema cálida (`#FAF9F7`) con texto gris cálido, manteniendo la paleta de acentos fuego.
- **Tipografía**: Plus Jakarta Sans.
- **Tailwind CSS 4**: Compilado en tiempo de build vía `@tailwindcss/vite`, con tokens semánticos (`bg-app`, `bg-surface`, `bg-accent`, etc.) definidos como variables CSS en `src/client/index.css` — un único origen de verdad para ambos temas.

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

## 💻 Guía de Ejecución Local para el Equipo

Esta sección explica paso a paso cómo clonar, configurar y ejecutar el proyecto en cualquier máquina local con soporte para cuentas independientes de Cloudflare.

---

### 1. Requisitos Previos

- **Node.js**: v18.0.0 o superior (recomendado v20+).
- **npm**: v9+ (incluido con Node.js).
- **Cuenta de Cloudflare**: Gratuita o de pago.
- **Wrangler CLI**: Autenticado en tu máquina ejecutando:
  ```bash
  npx wrangler login
  ```
  *(Se abrirá el navegador para autorizar el acceso de Wrangler a tu cuenta de Cloudflare)*.

---

### 2. Instalación y Puesta en Marcha (Paso a Paso)

#### Paso 1: Instalar dependencias
```bash
npm install
```
> **Nota:** Al ejecutar `npm install`, el hook `postinstall` creará automáticamente tu archivo `.env` a partir de `.env.example` si aún no existe.

#### Paso 2: Crear o Identificar tus Recursos en Cloudflare

Si es la primera vez que configuras tu cuenta de Cloudflare para este proyecto, crea tus recursos con los siguientes comandos:

```bash
# 1. Obtener tu Account ID
npx wrangler whoami

# 2. Crear la base de datos D1
npx wrangler d1 create fitness-crm-db

# 3. Crear el Namespace KV
npx wrangler kv namespace create KV

# 4. Crear el Bucket R2
npx wrangler r2 bucket create fitness-crm-storage
```

> 💡 **Si ya tienes los recursos creados**, puedes consultar sus IDs en cualquier momento:
> - Ver base de datos D1: `npx wrangler d1 list`
> - Ver namespaces KV: `npx wrangler kv namespace list`
> - Ver buckets R2: `npx wrangler r2 bucket list`

#### Paso 3: Configurar tus Variables de Entorno (`.env`)

Abre el archivo `.env` en la raíz del proyecto y coloca los valores de tu propia cuenta:

```env
CLOUDFLARE_ACCOUNT_ID=tu_account_id_aqui
D1_DATABASE_ID=tu_d1_database_uuid_aqui
D1_DATABASE_NAME=fitness-crm-db
KV_NAMESPACE_ID=tu_kv_id_aqui
R2_BUCKET_NAME=fitness-crm-storage

# Opcional (para llamadas directas a Workers AI REST API)
CLOUDFLARE_API_TOKEN=
ADMIN_SECRET=
```

> 🔒 **Seguridad y Colaboración:** El archivo `.env` está en `.gitignore`. Cada desarrollador mantiene sus propios IDs en su máquina sin interferir ni pisar las configuraciones del resto del equipo.

#### Paso 4: Inicializar la Base de Datos Local

Aplica el esquema SQL y los datos de prueba iniciales en tu base de datos SQLite local:

```bash
npm run d1:init
```

#### Paso 5: Iniciar el Servidor de Desarrollo

```bash
npm run dev
```

El servidor local de Cloudflare Workers iniciará en:
👉 **`http://127.0.0.1:8787`**

---

### 🔑 Credenciales de Acceso Local (Demostración)

La base de datos local incluye usuarios de prueba precargados:

| Rol | Correo Electrónico | Contraseña | Permisos |
| :--- | :--- | :--- | :--- |
| **Director General (Admin)** | `admin@fitnessclub.fit` | `admin123` | Control total, reasignación masiva, importación/exportación, gestión de equipo y auditoría. |
| **Head Coach (Admin)** | `carlos@fitnessclub.fit` | `admin123` | Mismos accesos administrativos. |
| **Coach Comercial (Agente)** | `valeria@fitnessclub.fit` | `agent123` | Vista filtrada a sus prospectos asignados, registro de notas, WhatsApp y llamadas. |
| **Asesora Fitness (Agente)** | `sofia@fitnessclub.fit` | `agent123` | Gestión exclusiva de su cartera de prospectos. |

> ⚡ En la pantalla de login (`http://127.0.0.1:8787/login`) encontrarás **botones de acceso rápido de 1-click** para iniciar sesión como Admin o Agente sin necesidad de escribir las credenciales manualmente.

---

### 🛠️ Scripts Disponibles en `package.json`

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Sincroniza variables de entorno e inicia el servidor local con Wrangler y recarga en vivo. |
| `npm run build` | Sincroniza variables, compila la SPA cliente (SolidJS/Vite) y valida tipos de TypeScript (`tsc --noEmit`). |
| `npm run deploy` | Compila el cliente y despliega la aplicación a tu cuenta de Cloudflare Workers. |
| `npm run config:sync` | Regenera manualmente `wrangler.jsonc` y `.dev.vars` a partir de tu archivo `.env`. |
| `npm run d1:init` | Aplica `schema.sql` y `seed.sql` en la base de datos local SQLite de D1. |

---

### 📂 Estructura Limpia del Proyecto

```text
fitness-crm/
├── .dev.vars                  # Variables locales para wrangler dev (auto-generado)
├── .env                       # Variables de tu cuenta local (ignorado en git)
├── .env.example               # Plantilla para que nuevos miembros creen su .env
├── .gitignore                 # Exclusiones de Git (.env, .dev.vars, node_modules, etc.)
├── index.html                 # Punto de entrada HTML de la aplicación web
├── package.json               # Dependencias y scripts del proyecto
├── README.md                  # Documentación oficial del CRM
├── tsconfig.json              # Configuración de TypeScript
├── vite.config.ts             # Configuración de Vite para SolidJS y TailwindCSS
├── wrangler.jsonc             # Configuración activa de Cloudflare (auto-generada)
├── wrangler.template.jsonc    # Plantilla de configuración con marcadores de variables
├── scripts/
│   └── sync-wrangler-env.mjs  # Sincronizador automático .env -> wrangler.jsonc
└── src/
    ├── index.ts               # Servidor Hono y Worker principal en el Edge
    ├── client/                # Frontend SPA con SolidJS y Tailwind CSS 4
    │   ├── App.tsx            # Enrutamiento de vistas y layout principal
    │   ├── api.ts             # Cliente HTTP tipado hacia los endpoints de Hono
    │   ├── index.css          # Sistema de diseño, tokens de color fuego y temas
    │   ├── index.tsx          # Renderizado inicial en el DOM
    │   ├── types.ts           # Interfaces de datos del cliente
    │   ├── components/        # Componentes UI reutilizables (Layout, modales)
    │   ├── context/           # Contextos globales (AuthContext, ThemeContext)
    │   └── pages/             # Vistas: Dashboard, Leads, LeadDetail, Team, etc.
    ├── db/
    │   ├── schema.sql         # Esquema D1 relacional (users, leads, activity, etc.)
    │   └── seed.sql           # Datos iniciales de demostración para el CRM
    ├── lib/
    │   ├── ai.ts              # Integración con Cloudflare Workers AI
    │   ├── auth.ts            # Autenticación con cookies y sesiones en KV
    │   ├── fcImport.ts        # Adaptador del modelo de datos de leads
    │   ├── rules.ts           # Reglas de negocio (segmentación y normalización)
    │   └── types.ts           # Tipos de TypeScript del backend y entorno (Env)
    └── routes/
        ├── auth.ts            # Rutas de autenticación (/auth)
        ├── importExport.ts    # Importación y exportación de prospectos (/import-export)
        ├── leads.ts           # Pipeline y gestión comercial de prospectos (/leads)
        ├── team.ts            # Gestión de asesores y auditoría (/team)
        └── templates.ts       # Plantillas de mensajes para WhatsApp (/templates)
```

