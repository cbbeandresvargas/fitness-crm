/**
 * Segmentación comercial FC (Fitness Club Pass) — única fuente de verdad.
 *
 * Segmento = relación comercial del prospecto con Fitness Club Pass.
 * Es un concepto INDEPENDIENTE del Estado del Lead (proceso de ventas) y del
 * Estado de Membresía (estado de la membresía actual). Un prospecto puede ser,
 * por ejemplo: Lead Status "contactado" + Membresía "Caducada" + Segmento "A".
 *
 * El segmento se DERIVA de los datos existentes (no se asigna manualmente):
 * si la relación del prospecto con FC cambia (p. ej. compra su primera
 * membresía), su segmento cambia automáticamente.
 */

export type FcSegment = 'A' | 'B' | 'C';

export interface FcSegmentConfig {
  id: FcSegment;
  /** Nombre a mostrar en la UI */
  label: string;
  icon: string;
  description: string;
  /** Clases del chip/badge (sistema visual existente del CRM) */
  chipClasses: string;
}

/** Configuración extensible: para agregar segmentos, añade entradas aquí. */
export const FC_SEGMENTS: Record<FcSegment, FcSegmentConfig> = {
  A: {
    id: 'A',
    label: 'Antiguos pagadores',
    icon: '',
    description: 'Ya confiaron en FC: compraron al menos una membresía (activa, caducada o agotada).',
    chipClasses: 'bg-accent/20 border-accent/40 text-accent-text',
  },
  B: {
    id: 'B',
    label: 'Registrados que nunca pagaron',
    icon: '',
    description: 'Registrados en FC que conocen el producto pero nunca han comprado una membresía.',
    chipClasses: 'bg-orange-500/20 border-orange-500/40 text-orange-400',
  },
  C: {
    id: 'C',
    label: 'Usuarios con actividad/interés reciente',
    icon: '',
    description: 'Actividad o interés reciente en FC que aún no califica para A ni B.',
    chipClasses: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
  },
};

/** Señales de "actividad/interés reciente": máximo de días para considerar actividad reciente */
export const SEGMENT_C_MAX_DAYS = 30;

export interface SegmentLeadInput {
  metadata?: Record<string, any> | string | null;
  created_at?: string | null;
  last_contacted_at?: string | null;
  last_inbound_at?: string | null;
}

function parseMetadata(metadata: SegmentLeadInput['metadata']): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
}

function isWithinDays(dateStr: string | null | undefined, maxDays: number): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;
  const diffMs = Date.now() - date.getTime();
  return diffMs >= 0 && diffMs <= maxDays * 24 * 60 * 60 * 1000;
}

/**
 * Clasifica un prospecto en un segmento comercial FC.
 *
 * Prioridad (un prospecto pertenece a un solo segmento primario):
 * 1. A — Antiguos pagadores: cantidad_membresias >= 1 (pagó al menos una vez;
 *    no se exige que la membresía esté activa: caducada/agotada también califica).
 * 2. B — Registrados que nunca pagaron: registrados en el sistema FC
 *    (origen 'excel_fc' = hoja "Clientes" del Excel, el registro real de clientes)
 *    con cantidad_membresias === 0.
 * 3. C — Usuarios con actividad/interés reciente: registro o contacto reciente
 *    (created_at / last_contacted_at / last_inbound_at dentro de los últimos
 *    SEGMENT_C_MAX_DAYS días) sin calificar para A ni B.
 *
 * Si no califica para ninguno (sin actividad reciente y sin historial de
 * pago/registro) NO se le fabrica un segmento: devuelve segmento null.
 */
export function computeFcSegment(lead: SegmentLeadInput): {
  segment: FcSegment | null;
  reason: string;
} {
  const meta = parseMetadata(lead.metadata);
  const membershipCount = Number(meta.cantidad_membresias);

  // A — Antiguos pagadores (prioridad máxima)
  if (Number.isFinite(membershipCount) && membershipCount >= 1) {
    return {
      segment: 'A',
      reason: `Antiguo pagador: ${membershipCount} membresía(s) registrada(s); no se exige membresía activa.`,
    };
  }

  // B — Registrados que nunca pagaron
  // 'excel_fc' marca los clientes del registro real de FC (hoja "Clientes").
  // Un count de 0 (o sin conteo registrado) proveniente de ese registro
  // significa "registrado, nunca compró". (Leads creados manualmente con el 0
  // por defecto del sistema NO son del registro de FC: no se clasifican como B.)
  if (meta.origen === 'excel_fc' && !(Number.isFinite(membershipCount) && membershipCount >= 1)) {
    return {
      segment: 'B',
      reason: 'Registrado en el sistema FC (hoja "Clientes") sin membresías compradas.',
    };
  }

  // C — Usuarios con actividad/interés reciente (señales reales del CRM)
  if (
    isWithinDays(lead.created_at, SEGMENT_C_MAX_DAYS) ||
    isWithinDays(lead.last_contacted_at, SEGMENT_C_MAX_DAYS) ||
    isWithinDays(lead.last_inbound_at, SEGMENT_C_MAX_DAYS)
  ) {
    return {
      segment: 'C',
      reason: `Actividad o interés reciente (registro o contacto en los últimos ${SEGMENT_C_MAX_DAYS} días).`,
    };
  }

  return {
    segment: null,
    reason: 'Sin pago registrado, sin registro FC y sin actividad reciente.',
  };
}
