import * as XLSX from 'xlsx';
import { normalizePhone } from './rules';

/**
 * Importador de Excel FC (Fitness Club Pass) — hoja "Clientes".
 *
 * Distinción CRÍTICA de conceptos:
 * - "Estado del Lead" (status del CRM) => posición en el proceso comercial (columna `status` de `leads`).
 *   El Excel NO contiene este dato => los registros importados nuevos inician en 'nuevo'.
 * - "Estado de Membresía" (Excel columna "Estado") => estado de la membresía de la persona
 *   (Nueva / Caducada / Agotada / Sin confirmar) => se guarda en metadata.estado_membresia.
 *   Es un concepto COMPLETAMENTE independiente del estado del lead y jamás se mezcla con él.
 */

export class FcImportError extends Error {}

/** Fila normalizada extraída del Excel FC */
export interface FcExcelRow {
  nro?: string | number;
  firstName: string;
  lastName: string;
  whatsapp?: string;
  email?: string;
  emailVerified?: boolean;
  ci?: string;
  membershipCount?: number;
  membershipStatus?: string;
}

export interface FcParsedFile {
  sheetName: string;
  headers: string[];
  /** Número de fila original en la hoja de Excel (1-based, contando encabezados) */
  rows: { rowNumber: number; data: FcExcelRow }[];
}

export type FcMatchedBy = 'whatsapp' | 'email' | 'ci';

export interface FcExistingLeadRef {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  status?: string;
  metadata: Record<string, any>;
}

export type FcRowType = 'new' | 'existing' | 'invalid';

export interface FcRowClassification {
  rowNumber: number;
  type: FcRowType;
  /** Sólo para 'invalid': razón por la que la fila no se puede importar */
  reason?: string;
  data: FcExcelRow;
  /** Estado del Lead en el CRM: 'nuevo' para registros nuevos; el actual del lead para existentes */
  leadStatus: string;
  matchedLead?: FcExistingLeadRef;
  matchedBy?: FcMatchedBy;
  /** Sólo para 'existing': campos vacíos del CRM que se completarán desde el Excel */
  syncFields?: string[];
}

/** Normaliza encabezados: minúsculas, sin acentos, espacios colapsados */
function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Mapa de encabezado normalizado del Excel FC -> campo interno */
const FC_HEADER_MAP: Record<string, keyof FcExcelRow> = {
  nro: 'nro',
  nombre: 'firstName',
  apellido: 'lastName',
  email: 'email',
  'email verificado': 'emailVerified',
  ci: 'ci',
  whatsapp: 'whatsapp',
  'cantidad de membresias': 'membershipCount',
  estado: 'membershipStatus', // La columna "Estado" del Excel es el estado de la MEMBRESÍA
};

const REQUIRED_HEADERS = ['nombre', 'apellido'];
const REQUIRED_DISPLAY: Record<string, string> = { nombre: 'Nombre', apellido: 'Apellido' };

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseEmailVerified(v: unknown): boolean | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'verdadero', 'si', 'sí', 'yes', '1', 'x'].includes(s)) return true;
  if (['false', 'falso', 'no', '0', ''].includes(s)) return false;
  return undefined;
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parsea el libro Excel y extrae la hoja "Clientes".
 * Lanza FcImportError con mensajes claros si falta la hoja o las columnas requeridas.
 */
export function parseFcWorkbook(data: ArrayBuffer | Uint8Array): FcParsedFile {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array' });
  } catch {
    throw new FcImportError(
      'No se pudo leer el archivo. Asegúrate de que sea un Excel válido (.xlsx).'
    );
  }

  const sheetName = Object.keys(wb.Sheets).find(
    (name) => normalizeHeader(name) === 'clientes'
  );
  if (!sheetName) {
    throw new FcImportError(
      `El archivo no contiene la hoja "Clientes". Hojas encontradas: ${
        Object.keys(wb.Sheets).join(', ') || '(ninguna)'
      }`
    );
  }

  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: true,
  });

  if (grid.length === 0) {
    throw new FcImportError('La hoja "Clientes" está vacía.');
  }

  // La primera fila no vacía es la fila de encabezados
  let headerRowIndex = grid.findIndex((r) =>
    Array.isArray(r) && r.some((cell) => cellToString(cell) !== '')
  );
  if (headerRowIndex < 0) {
    throw new FcImportError('La hoja "Clientes" no contiene encabezados.');
  }

  const rawHeaders = (grid[headerRowIndex] as unknown[]).map(cellToString);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const missing = REQUIRED_HEADERS.filter(
    (req) => !normalizedHeaders.includes(req)
  );
  if (missing.length > 0) {
    throw new FcImportError(
      `Faltan columnas requeridas en la hoja "Clientes": ${missing
        .map((m) => REQUIRED_DISPLAY[m] || m)
        .join(', ')}. Encabezados encontrados: ${rawHeaders.filter(Boolean).join(', ') || '(ninguno)'}`
    );
  }

  // Índice de columna -> campo FC (el orden de columnas no importa)
  const columnFieldMap: Record<number, keyof FcExcelRow> = {};
  for (let col = 0; col < normalizedHeaders.length; col++) {
    const field = FC_HEADER_MAP[normalizedHeaders[col]];
    if (field && !Object.values(columnFieldMap).includes(field)) {
      columnFieldMap[col] = field;
    }
  }

  const rows: { rowNumber: number; data: FcExcelRow }[] = [];

  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const raw = grid[r] as unknown[];
    if (!Array.isArray(raw) || raw.every((cell) => cellToString(cell) === '')) {
      continue; // Ignorar filas completamente vacías
    }

    const data: any = {};
    for (const [colStr, field] of Object.entries(columnFieldMap)) {
      const col = Number(colStr);
      const v = raw[col];
      switch (field) {
        case 'nro':
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            data.nro = typeof v === 'number' ? v : String(v).trim();
          }
          break;
        case 'firstName':
        case 'lastName':
        case 'whatsapp':
        case 'ci':
        case 'membershipStatus':
          data[field] = cellToString(v);
          break;
        case 'email':
          data[field] = cellToString(v).toLowerCase();
          break;
        case 'emailVerified':
          data[field] = parseEmailVerified(v);
          break;
        case 'membershipCount':
          data[field] = parseNumber(v);
          break;
      }
    }

    rows.push({ rowNumber: r + 1, data: data as FcExcelRow });
  }

  return { sheetName, headers: rawHeaders.filter(Boolean), rows };
}

/**
 * Clasifica las filas del Excel contra los leads existentes del CRM.
 * Identificadores de coincidencia (en orden de prioridad): WhatsApp, Email, CI.
 * - 'new': no existe => se creará con Estado del Lead = 'nuevo'.
 * - 'existing': coincide con un lead existente => NO se sobrescribe; sólo se completan campos vacíos.
 * - 'invalid': fila inválida con razón (no se importa).
 */
export function classifyFcRows(
  parsed: FcParsedFile,
  existingLeads: FcExistingLeadRef[]
): FcRowClassification[] {
  const byPhone = new Map<string, FcExistingLeadRef>();
  const byEmail = new Map<string, FcExistingLeadRef>();
  const byCi = new Map<string, FcExistingLeadRef>();

  for (const lead of existingLeads) {
    if (lead.phone) byPhone.set(lead.phone, lead);
    if (lead.email) byEmail.set(lead.email.toLowerCase(), lead);
    const ci = lead.metadata?.ci ? String(lead.metadata.ci).trim() : '';
    if (ci) byCi.set(ci, lead);
  }

  const seenPhones = new Map<string, number>();

  return parsed.rows.map(({ rowNumber, data }) => {
    const classification: FcRowClassification = {
      rowNumber,
      type: 'invalid',
      data,
      leadStatus: 'nuevo',
    };

    if (!data.firstName || !data.lastName) {
      classification.reason =
        'Faltan Nombre y/o Apellido (columnas requeridas).';
      return classification;
    }

    const phone = data.whatsapp ? normalizePhone(data.whatsapp) : '';

    // Duplicados dentro del propio archivo
    if (phone) {
      const firstRow = seenPhones.get(phone);
      if (firstRow !== undefined) {
        classification.reason = `WhatsApp duplicado dentro del archivo (misma persona en la fila ${firstRow}).`;
        return classification;
      }
      seenPhones.set(phone, rowNumber);
    }

    // Coincidencia con leads existentes: WhatsApp -> Email -> CI
    let matched: FcExistingLeadRef | undefined;
    let matchedBy: FcMatchedBy | undefined;
    if (phone && byPhone.has(phone)) {
      matched = byPhone.get(phone);
      matchedBy = 'whatsapp';
    } else if (data.email && byEmail.has(data.email)) {
      matched = byEmail.get(data.email);
      matchedBy = 'email';
    } else if (data.ci && byCi.has(data.ci)) {
      matched = byCi.get(data.ci);
      matchedBy = 'ci';
    }

    if (matched) {
      classification.type = 'existing';
      classification.matchedLead = matched;
      classification.matchedBy = matchedBy;
      classification.leadStatus = matched.status || 'nuevo';

      // Sólo se completan campos VACÍOS del CRM; jamás se sobrescribe información existente
      const syncFields: string[] = [];
      if (!matched.email && data.email) syncFields.push('email');
      if (matched.metadata?.ci === undefined && data.ci) syncFields.push('ci');
      if (matched.metadata?.nro === undefined && data.nro !== undefined) syncFields.push('nro');
      if (matched.metadata?.first_name === undefined) syncFields.push('nombre');
      if (matched.metadata?.last_name === undefined) syncFields.push('apellido');
      if (matched.metadata?.email_verificado === undefined && data.emailVerified !== undefined) syncFields.push('email verificado');
      // Cantidad de membresías: se completa si falta o si el Excel reporta un
      // conteo MAYOR (compra de membresía => B pasa automáticamente a A)
      if (
        data.membershipCount !== undefined &&
        (matched.metadata?.cantidad_membresias === undefined || data.membershipCount > Number(matched.metadata.cantidad_membresias))
      ) syncFields.push('cantidad de membresías');
      if (matched.metadata?.estado_membresia === undefined && data.membershipStatus) syncFields.push('estado de membresía');
      classification.syncFields = syncFields;

      return classification;
    }

    if (!phone) {
      classification.reason =
        'Sin WhatsApp: no coincide con ningún registro existente (email/CI) y el CRM requiere número para crear un lead nuevo.';
      return classification;
    }

    classification.type = 'new';
    classification.leadStatus = 'nuevo';
    return classification;
  });
}

/** Construye el metadata de un lead NUEVO a partir de la fila del Excel (sin inventar datos ausentes) */
export function buildImportedMetadata(data: FcExcelRow): Record<string, any> {
  const metadata: Record<string, any> = { origen: 'excel_fc' };
  if (data.nro !== undefined) metadata.nro = data.nro;
  metadata.first_name = data.firstName;
  metadata.last_name = data.lastName;
  if (data.ci) metadata.ci = data.ci;
  if (data.emailVerified !== undefined) metadata.email_verificado = data.emailVerified;
  if (data.membershipCount !== undefined) metadata.cantidad_membresias = data.membershipCount;
  if (data.membershipStatus) metadata.estado_membresia = data.membershipStatus;
  return metadata;
}
