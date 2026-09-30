import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// 1. Cargar variables combinando .env, .dev.vars y process.env
const envFilePath = path.join(rootDir, '.env');
const exampleEnvPath = path.join(rootDir, '.env.example');
if (!fs.existsSync(envFilePath) && fs.existsSync(exampleEnvPath)) {
  fs.copyFileSync(exampleEnvPath, envFilePath);
  console.log('ℹ️  [env-sync] Archivo .env no encontrado. Creado automáticamente a partir de .env.example.');
}

const envFile = parseEnvFile(envFilePath);
const devVarsFile = parseEnvFile(path.join(rootDir, '.dev.vars'));

const config = {
  CLOUDFLARE_ACCOUNT_ID:
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    envFile.CLOUDFLARE_ACCOUNT_ID ||
    devVarsFile.CLOUDFLARE_ACCOUNT_ID ||
    '',
  D1_DATABASE_ID:
    process.env.D1_DATABASE_ID ||
    envFile.D1_DATABASE_ID ||
    devVarsFile.D1_DATABASE_ID ||
    '',
  D1_DATABASE_NAME:
    process.env.D1_DATABASE_NAME ||
    envFile.D1_DATABASE_NAME ||
    devVarsFile.D1_DATABASE_NAME ||
    'fitness-crm-db',
  KV_NAMESPACE_ID:
    process.env.KV_NAMESPACE_ID ||
    envFile.KV_NAMESPACE_ID ||
    devVarsFile.KV_NAMESPACE_ID ||
    '',
  R2_BUCKET_NAME:
    process.env.R2_BUCKET_NAME ||
    envFile.R2_BUCKET_NAME ||
    devVarsFile.R2_BUCKET_NAME ||
    'fitness-crm-storage',
  CLOUDFLARE_API_TOKEN:
    process.env.CLOUDFLARE_API_TOKEN ||
    envFile.CLOUDFLARE_API_TOKEN ||
    devVarsFile.CLOUDFLARE_API_TOKEN ||
    '',
  ADMIN_SECRET:
    process.env.ADMIN_SECRET ||
    envFile.ADMIN_SECRET ||
    devVarsFile.ADMIN_SECRET ||
    '',
  META_GRAPH_API_VERSION:
    process.env.META_GRAPH_API_VERSION ||
    envFile.META_GRAPH_API_VERSION ||
    devVarsFile.META_GRAPH_API_VERSION ||
    'v25.0',
  META_GRAPH_BASE_URL:
    process.env.META_GRAPH_BASE_URL ||
    envFile.META_GRAPH_BASE_URL ||
    devVarsFile.META_GRAPH_BASE_URL ||
    'https://graph.facebook.com',
  META_WA_PHONE_NUMBER_ID:
    process.env.META_WA_PHONE_NUMBER_ID ||
    envFile.META_WA_PHONE_NUMBER_ID ||
    devVarsFile.META_WA_PHONE_NUMBER_ID ||
    '',
  META_WA_ACCESS_TOKEN:
    process.env.META_WA_ACCESS_TOKEN ||
    envFile.META_WA_ACCESS_TOKEN ||
    devVarsFile.META_WA_ACCESS_TOKEN ||
    '',
  META_WA_WABA_ID:
    process.env.META_WA_WABA_ID ||
    envFile.META_WA_WABA_ID ||
    devVarsFile.META_WA_WABA_ID ||
    '',
  META_WA_VERIFY_TOKEN:
    process.env.META_WA_VERIFY_TOKEN ||
    envFile.META_WA_VERIFY_TOKEN ||
    devVarsFile.META_WA_VERIFY_TOKEN ||
    'fitnessclub_secure_verify_token_2026',
  META_APP_SECRET:
    process.env.META_APP_SECRET ||
    envFile.META_APP_SECRET ||
    devVarsFile.META_APP_SECRET ||
    '',
};

// 2. Leer wrangler.template.jsonc
const templatePath = path.join(rootDir, 'wrangler.template.jsonc');
if (!fs.existsSync(templatePath)) {
  console.error('❌ Error: No se encontró wrangler.template.jsonc');
  process.exit(1);
}

// Validación: sin estos IDs wrangler genera una configuración inválida (falla al arrancar).
// Mejor detenerse aquí con instrucciones claras que romper wrangler.jsonc.
const missing = [];
if (!config.D1_DATABASE_ID) {
  missing.push('D1_DATABASE_ID  ->  créalo con:  npx wrangler d1 create fitness-crm-db');
}
if (!config.KV_NAMESPACE_ID) {
  missing.push('KV_NAMESPACE_ID  ->  créalo con:  npx wrangler kv namespace create KV');
}
if (missing.length > 0) {
  console.error('❌ [env-sync] Faltan valores requeridos en .env — NO se sobrescribió wrangler.jsonc:');
  for (const m of missing) console.error(`   - ${m}`);
  console.error('ℹ️  Copia los IDs generados a tu .env y vuelve a ejecutar: npm run config:sync');
  process.exit(1);
}

let template = fs.readFileSync(templatePath, 'utf-8');

// Reemplazos de tokens
template = template
  .replaceAll('__CLOUDFLARE_ACCOUNT_ID__', config.CLOUDFLARE_ACCOUNT_ID)
  .replaceAll('__D1_DATABASE_ID__', config.D1_DATABASE_ID)
  .replaceAll('__D1_DATABASE_NAME__', config.D1_DATABASE_NAME)
  .replaceAll('__KV_NAMESPACE_ID__', config.KV_NAMESPACE_ID)
  .replaceAll('__R2_BUCKET_NAME__', config.R2_BUCKET_NAME);

// Escribir wrangler.jsonc resultante, eliminando campos vacíos
// (wrangler rechaza account_id vacío y los bindings requieren IDs no vacíos)
const wranglerJsonPath = path.join(rootDir, 'wrangler.jsonc');
try {
  const cfg = JSON.parse(template);
  if (!cfg.account_id) delete cfg.account_id;
  if (cfg.vars && typeof cfg.vars === 'object') {
    for (const key of Object.keys(cfg.vars)) {
      if (!String(cfg.vars[key] ?? '').trim()) delete cfg.vars[key];
    }
    if (Object.keys(cfg.vars).length === 0) delete cfg.vars;
  }
  fs.writeFileSync(wranglerJsonPath, JSON.stringify(cfg, null, '\t'), 'utf-8');
} catch (e) {
  console.error('❌ [env-sync] wrangler.template.jsonc no produce JSON válido:', e.message);
  process.exit(1);
}

// 3. Sincronizar .dev.vars para desarrollo local con wrangler dev
const devVarsContent = [
  `CLOUDFLARE_ACCOUNT_ID=${config.CLOUDFLARE_ACCOUNT_ID}`,
  config.CLOUDFLARE_API_TOKEN ? `CLOUDFLARE_API_TOKEN=${config.CLOUDFLARE_API_TOKEN}` : '',
  config.ADMIN_SECRET ? `ADMIN_SECRET=${config.ADMIN_SECRET}` : '',
  `META_GRAPH_API_VERSION=${config.META_GRAPH_API_VERSION}`,
  `META_GRAPH_BASE_URL=${config.META_GRAPH_BASE_URL}`,
  config.META_WA_PHONE_NUMBER_ID ? `META_WA_PHONE_NUMBER_ID=${config.META_WA_PHONE_NUMBER_ID}` : '',
  config.META_WA_ACCESS_TOKEN ? `META_WA_ACCESS_TOKEN=${config.META_WA_ACCESS_TOKEN}` : '',
  config.META_WA_WABA_ID ? `META_WA_WABA_ID=${config.META_WA_WABA_ID}` : '',
  `META_WA_VERIFY_TOKEN=${config.META_WA_VERIFY_TOKEN}`,
  config.META_APP_SECRET ? `META_APP_SECRET=${config.META_APP_SECRET}` : '',
]
  .filter(Boolean)
  .join('\n');

fs.writeFileSync(path.join(rootDir, '.dev.vars'), devVarsContent + '\n', 'utf-8');

console.log('⚡ [env-sync] wrangler.jsonc y .dev.vars generados con éxito:');
console.log(`   - Account ID: ${config.CLOUDFLARE_ACCOUNT_ID || '(no definido)'}`);
console.log(`   - D1 Database: ${config.D1_DATABASE_NAME} (${config.D1_DATABASE_ID || 'sin ID'})`);
console.log(`   - KV Namespace ID: ${config.KV_NAMESPACE_ID || '(sin ID)'}`);
console.log(`   - R2 Bucket: ${config.R2_BUCKET_NAME}`);
