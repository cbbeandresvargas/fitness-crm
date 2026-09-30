/**
 * Utilidades del Catálogo de Actividades de interés.
 *
 * Las actividades son una entidad central (tabla `activities`) y la relación
 * con los prospectos es N:M (tabla `prospect_activities`). El catálogo es la
 * fuente de verdad de los nombres — nunca se guardan strings arbitrarios en
 * el prospecto.
 *
 * Concepto INDEPENDIENTE del Estado del Lead, Estado de Membresía, Segmento,
 * Ciudad y Membresías.
 */

/**
 * Normaliza un nombre de actividad para comparación/deduplicación:
 * minúsculas, sin acentos, espacios colapsados.
 * "Pilates" / "pilates" / "PILATES" / "  Pilates  " => "pilates".
 */
export function normalizeActivityName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
