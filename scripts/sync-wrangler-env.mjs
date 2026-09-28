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
};

// 2. Leer wrangler.template.jsonc
const templatePath = path.join(rootDir, 'wrangler.template.jsonc');
if (!fs.existsSync(templatePath)) {
  console.error('❌ Error: No se encontró wrangler.template.jsonc');
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

// Escribir wrangler.jsonc resultante
const wranglerJsonPath = path.join(rootDir, 'wrangler.jsonc');
fs.writeFileSync(wranglerJsonPath, template, 'utf-8');

// 3. Sincronizar .dev.vars para desarrollo local con wrangler dev
const devVarsContent = [
  `CLOUDFLARE_ACCOUNT_ID=${config.CLOUDFLARE_ACCOUNT_ID}`,
  config.CLOUDFLARE_API_TOKEN ? `CLOUDFLARE_API_TOKEN=${config.CLOUDFLARE_API_TOKEN}` : '',
  config.ADMIN_SECRET ? `ADMIN_SECRET=${config.ADMIN_SECRET}` : '',
]
  .filter(Boolean)
  .join('\n');

fs.writeFileSync(path.join(rootDir, '.dev.vars'), devVarsContent + '\n', 'utf-8');

console.log('⚡ [env-sync] wrangler.jsonc y .dev.vars generados con éxito:');
console.log(`   - Account ID: ${config.CLOUDFLARE_ACCOUNT_ID || '(no definido)'}`);
console.log(`   - D1 Database: ${config.D1_DATABASE_NAME} (${config.D1_DATABASE_ID || 'sin ID'})`);
console.log(`   - KV Namespace ID: ${config.KV_NAMESPACE_ID || '(sin ID)'}`);
console.log(`   - R2 Bucket: ${config.R2_BUCKET_NAME}`);
