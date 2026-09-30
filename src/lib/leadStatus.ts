/**
 * Estados del Lead (posición en el proceso comercial) — única fuente de verdad.
 *
 * 'cita_agendada' fue REMOVIDO del sistema: ya no es un estado válido.
 * (Nota: la columna `status` de bases de datos creadas antes de este cambio
 * mantiene el CHECK antiguo que lo permite, pero la API ya no lo acepta.)
 *
 * Es un concepto INDEPENDIENTE del Estado de Membresía y de los Segmentos.
 */
export const LEAD_STATUS_OPTIONS = [
  { value: 'nuevo', label: '🌱 Nuevo' },
  { value: 'contactado', label: '💬 Contactado' },
  { value: 'negociacion', label: '🤝 Negociación' },
  { value: 'ganado', label: '🏆 Ganado' },
  { value: 'perdido', label: '🛑 Perdido' },
] as const;

export type LeadStatusValue = (typeof LEAD_STATUS_OPTIONS)[number]['value'];

/** Identificadores internos de estados válidos (para validación de API) */
export const ALLOWED_LEAD_STATUSES: readonly LeadStatusValue[] = LEAD_STATUS_OPTIONS.map(
  (opt) => opt.value
);

export function isValidLeadStatus(value: unknown): value is LeadStatusValue {
  return (
    typeof value === 'string' &&
    LEAD_STATUS_OPTIONS.some((opt) => opt.value === value)
  );
}
