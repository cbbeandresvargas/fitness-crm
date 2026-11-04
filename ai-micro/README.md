# 🤖 Fitness AI Micro (`ai-micro`)

Microservicio autónomo, ligero y de alto rendimiento construido con **Hono** y **Cloudflare Workers AI** para gestionar la inteligencia artificial comercial de **Fitness Club Pass Cochabamba**.

---

## 🎯 Objetivo y Diseño Anti-Alucinaciones

Este microservicio resuelve de raíz los problemas de alucinación y respuestas excesivamente largas:
1. **Regla de 1 a 2 oraciones:** Respuestas directas al grano, ideales para WhatsApp, sin introducciones vacías ni discursos comerciales pesados.
2. **Planes y precios oficiales hardcodeados:**
   - **Básica:** Bs 290 / mes (20 check-ins).
   - **Pro:** Bs 420 / mes (25 check-ins, incluye Yoga y Pilates).
   - **Élite:** Bs 560 / mes (30 check-ins, acceso preferencial).
3. **Moneda Boliviana (Bs):** Estricta y exclusivamente en Bolivianos (Bs) con pago manual por QR Simple.
4. **Handoff automático:** Si el cliente pide asesor humano, realiza un reclamo o consulta algo fuera del alcance, la IA devuelve `"action": "handoff"`.

---

## 📁 Estructura del Proyecto

```text
ai-micro/
├── package.json         # Dependencias mínimas (Hono, Wrangler, TypeScript)
├── tsconfig.json        # Configuración de TypeScript
├── wrangler.jsonc       # Configuración de Cloudflare Workers y binding de AI
├── README.md            # Esta documentación
└── src/
    ├── index.ts         # Servidor Hono, endpoints /health y /chat
    ├── knowledge.ts     # Fuente inmutable de verdad sobre planes, sedes y pagos
    └── prompt.ts        # System prompt tajante, formateo de mensajes y parser JSON
```

---

## 🚀 Instalación y Ejecución Local

Desde la raíz de `ai-micro`:

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el entorno de desarrollo local (puerto 8788)
npm run dev
```

El microservicio estará disponible en `http://127.0.0.1:8788`.

---

## 📡 Endpoints Disponibles

### 1. `GET /health`
Verifica el estado del servicio, modelos configurados y disponibilidad del binding de AI.

```bash
curl http://127.0.0.1:8788/health
```

**Respuesta de ejemplo:**
```json
{
  "status": "ok",
  "service": "fitness-ai-micro",
  "timestamp": "2026-11-04T20:30:00.000Z",
  "aiBindingAvailable": true,
  "models": {
    "primary": "@cf/zai-org/glm-4.7-flash",
    "fallback": "@cf/meta/llama-3.2-3b-instruct"
  }
}
```

---

### 2. `POST /chat`
Procesa la conversación y genera la respuesta para WhatsApp en 1 a 2 oraciones.

```bash
curl -X POST http://127.0.0.1:8788/chat \
  -H "Content-Type: application/json" \
  -d '{
    "lead": {
      "name": "Carlos Mendoza",
      "phone": "+59170123456"
    },
    "history": [],
    "message": "¿Cuánto cuestan los pases y qué incluye?"
  }'
```

**Respuesta de ejemplo:**
```json
{
  "reply": "Nuestros planes mensuales en Cochabamba son: Básica Bs 290 (20 accesos), Pro Bs 420 (25 accesos) y Élite Bs 560 (30 accesos). ¿En qué zona te gustaría entrenar?",
  "action": "reply",
  "detectedName": "Carlos Mendoza",
  "detectedDisciplines": [],
  "modelUsed": "@cf/zai-org/glm-4.7-flash"
}
```

Si el cliente solicita un asesor:
```json
{
  "reply": "Con gusto te comunico ahora mismo con uno de nuestros asesores para que te atienda personalmente.",
  "action": "handoff",
  "detectedName": null,
  "detectedDisciplines": [],
  "modelUsed": "@cf/zai-org/glm-4.7-flash"
}
```

---

## ☁️ Despliegue en Cloudflare Workers

### 1. Despliegue Continuo Automático (CI/CD)
Este microservicio cuenta con despliegue automatizado en GitHub Actions configurado en `.github/workflows/deploy.yml`. Al hacer `push` a la rama `main` o disparar el workflow manualmente (`workflow_dispatch`), GitHub Actions ejecuta:
- `npm ci`
- `npm run typecheck`
- `npx wrangler deploy` (autenticado con los secrets `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`).

### 2. Despliegue Local Manual
Para desplegar manualmente desde la máquina local:

```bash
# Desde la carpeta ai-micro
npm run deploy

# O desde la raíz del proyecto
npm run deploy:ai
```

