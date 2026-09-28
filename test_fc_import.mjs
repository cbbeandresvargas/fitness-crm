// Unit test for src/lib/fcImport.ts (FC Excel importer: parse + classify + metadata)
// Runs fully offline: generates a real .xlsx in memory and checks the classification rules.
// Usage: node test_fc_import.mjs
import { createRequire } from 'module';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const libPath = path.join(os.tmpdir(), 'opencode', 'fclib', 'fcImport.js');
const { parseFcWorkbook, classifyFcRows, buildImportedMetadata, FcImportError } = require(libPath);

let failures = 0;
const assert = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}`);
  if (!cond) failures++;
};

// ---- Fixtures: leads existentes en el CRM ----
const existingLeads = [
  // Ana: existe por teléfono; tiene email, sin CI ni metadata FC
  { id: 'lead_a', full_name: 'Ana Garcia', phone: '+5370000002', email: 'ana@test.com', status: 'contactado', metadata: { first_name: 'Ana', last_name: 'Garcia' } },
  // Luis: existe por CI; ya tiene estado de membresía 'Agotada' (NO debe sobrescribirse)
  { id: 'lead_b', full_name: 'Luis Rey', phone: '+5370000009', email: 'luis@test.com', status: 'nuevo', metadata: { ci: '99999999', cantidad_membresias: 1, estado_membresia: 'Agotada' } },
  // Mia: existe por email; ganado
  { id: 'lead_c', full_name: 'Mia Sol', phone: '+5370000010', email: 'mia@test.com', status: 'ganado', metadata: {} },
];

// ---- Excel "Clientes" con columnas en OTRA posición (el orden no debe importar) ----
const aoa = [
  ['WhatsApp', 'NRO', 'Apellido', 'Cantidad de Membresías', 'Nombre', 'Estado', 'Email Verificado', 'CI', 'Email'],
  ['+53 7000 0001', 1, 'Perez', 2, 'Juan', 'Caducada', true, '87111111', 'juan@test.com'],        // nuevo
  ['+53 7000 0002', 2, 'Garcia', 1, 'Ana', 'Nueva', 'Verdadero', '87111112', ''],                // existente por whatsapp (email vacío en Excel)
  ['+53 7000 0003', 3, 'Sol', 4, 'Mia', 'Agotada', false, '87111113', 'mia@test.com'],           // existente por email
  ['+53 7000 0004', 4, 'Rey', 7, 'Luis', 'Nueva', '', '99999999', 'luis2@test.com'],             // existente por CI (¡Estado difiere!)
  ['+53 7000 0005', 5, '', 1, 'SoloNombre', 'Nueva', '', '87111115', 'solo@test.com'],            // inválido: falta Apellido
  ['+53 7000 0001', 6, 'Duplicado', 1, 'Juan2', 'Nueva', '', '87111116', ''],                    // inválido: whatsapp duplicado en el archivo
  ['', 7, 'SinFono', 1, 'NuevoSin', 'Nueva', '', '87111117', 'nobody@test.com'],                 // inválido: sin whatsapp y sin match
  ['', 8, 'SinFonoMatch', 1, 'LuisSinFono', 'Agotada', '', '88888888', 'luis@test.com'],         // existente por email (sin whatsapp)
  [null, null, null, null, null, null, null, null, null],                                          // fila completamente vacía: ignorada
];

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

// ---- 1. Parse ----
let parsed;
try {
  parsed = parseFcWorkbook(xlsxBuffer);
  assert('parse: hoja "Clientes" encontrada', parsed.sheetName === 'Clientes');
  assert('parse: filas vacías ignoradas (8 filas de datos)', parsed.rows.length === 8);
} catch (e) {
  assert('parse: hoja "Clientes" encontrada', false);
  console.error(e);
  process.exit(1);
}

const byRow = Object.fromEntries(parsed.rows.map((r) => [r.data.firstName, r]));
assert('parse: Juan conserva Estado de Membresía exacta "Caducada"', byRow.Juan.data.membershipStatus === 'Caducada');
assert('parse: Juan conserva Cantidad de Membresías = 2 (número)', byRow.Juan.data.membershipCount === 2);
assert('parse: NRO preservado', byRow.Juan.data.nro === 1);
assert('parse: "Email Verificado" true (boolean) parseado', byRow.Juan.data.emailVerified === true);
assert('parse: "Verdadero" (string) parseado como true', byRow.Ana.data.emailVerified === true);
assert('parse: false (boolean) parseado', byRow.Mia.data.emailVerified === false);
assert('parse: email vacío queda ausente', !byRow.Ana.data.email);

// ---- 2. Classify ----
const cls = Object.fromEntries(classifyFcRows(parsed, existingLeads).map((r) => [r.data.firstName, r]));

assert('Juan: NUEVO (sin match)', cls.Juan.type === 'new');
assert('Juan: Estado del Lead = nuevo (default import)', cls.Juan.leadStatus === 'nuevo');

assert('Ana: EXISTENTE por whatsapp (número normalizado)', cls.Ana.type === 'existing' && cls.Ana.matchedBy === 'whatsapp');
assert('Ana: leadStatus refleja el estado del lead en el CRM (contactado)', cls.Ana.leadStatus === 'contactado');
assert('Ana: se completará CI desde Excel', cls.Ana.syncFields.includes('ci'));
assert('Ana: NO se sobrescribe email (ya existe en CRM)', !cls.Ana.syncFields.includes('email'));
assert('Ana: se completará estado de membresía "Nueva"', cls.Ana.syncFields.includes('estado de membresía'));

assert('Mia: EXISTENTE por email', cls.Mia.type === 'existing' && cls.Mia.matchedBy === 'email');
assert('Mia: leadStatus = ganado (CRM)', cls.Mia.leadStatus === 'ganado');

assert('Luis: EXISTENTE por CI', cls.Luis.type === 'existing' && cls.Luis.matchedBy === 'ci');
assert('Luis: "Agotada" del CRM NO se sobrescribe con "Nueva" del Excel', !cls.Luis.syncFields.includes('estado de membresía'));

assert('SoloNombre: INVÁLIDO (falta Apellido)', cls.SoloNombre.type === 'invalid' && /Apellido/.test(cls.SoloNombre.reason));
assert('Juan2: INVÁLIDO (whatsapp duplicado en el archivo)', cls.Juan2.type === 'invalid' && /duplicado/.test(cls.Juan2.reason));
assert('NuevoSin: INVÁLIDO (sin whatsapp y sin match)', cls.NuevoSin.type === 'invalid' && /WhatsApp/.test(cls.NuevoSin.reason));
assert('LuisSinFono: EXISTENTE por email aunque no traiga whatsapp', cls.LuisSinFono.type === 'existing' && cls.LuisSinFono.matchedBy === 'email');

// ---- 3. Metadata de nuevos: preserva los valores del Excel, no inventa ----
const meta = buildImportedMetadata(byRow.Juan.data);
assert('metadata nuevo: first/last name', meta.first_name === 'Juan' && meta.last_name === 'Perez');
assert('metadata nuevo: cantidad_membresias preservada (2)', meta.cantidad_membresias === 2);
assert('metadata nuevo: estado_membresia preservada (Caducada)', meta.estado_membresia === 'Caducada');
assert('metadata nuevo: email_verificado preservado (true)', meta.email_verificado === true);
assert('metadata nuevo: ci + nro preservados', meta.ci === '87111111' && meta.nro === 1);

// ---- 4. Errores estructurales ----
const wbNoSheet = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNoSheet, XLSX.utils.aoa_to_sheet([['Nombre', 'Apellido'], ['A', 'B']]), 'Datos');
try {
  parseFcWorkbook(XLSX.write(wbNoSheet, { type: 'buffer', bookType: 'xlsx' }));
  assert('sin hoja "Clientes": error claro', false);
} catch (e) {
  assert('sin hoja "Clientes": error claro', e instanceof FcImportError && /Clientes/.test(e.message));
}

const wbNoCol = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNoCol, XLSX.utils.aoa_to_sheet([['Nombre', 'WhatsApp'], ['A', '+5300000000']]), 'Clientes');
try {
  parseFcWorkbook(XLSX.write(wbNoCol, { type: 'buffer', bookType: 'xlsx' }));
  assert('sin columna Apellido: error claro', false);
} catch (e) {
  assert('sin columna Apellido: error claro', e instanceof FcImportError && /Apellido/.test(e.message));
}

try {
  parseFcWorkbook(Buffer.from('no es un excel'));
  assert('archivo corrupto: error claro', false);
} catch (e) {
  // SheetJS es tolerante con basura (fallback CSV): en ese caso el error claro es el de hoja "Clientes"
  assert('archivo corrupto: error claro', e instanceof FcImportError && /Clientes|No se pudo leer/.test(e.message));
}

console.log(failures === 0 ? '\nALL FC IMPORT UNIT TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
