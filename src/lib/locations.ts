/**
 * Ciudades de Bolivia disponibles para el campo Ciudad del prospecto.
 * Representa la ciudad donde vive/está el prospecto; NO es el estado del lead,
 * NO es el estado de la membresía ni la ubicación del gimnasio.
 * Para agregar ciudades en el futuro, basta extender este arreglo.
 */
export const BOLIVIA_CITIES = [
  'Cochabamba',
  'La Paz',
  'Santa Cruz',
  'Sucre',
  'Oruro',
  'Potosí',
  'Tarija',
  'Trinidad',
  'Cobija',
] as const;

/**
 * Ciudad efectiva de un prospecto: `metadata.ciudad` (único campo de ubicación).
 *
 * Compatibilidad segura de datos previos: si un registro legado tiene
 * `metadata.region` o `metadata.sede`, se muestra como ciudad SÓLO si el valor
 * coincide exactamente con una de las ciudades de la lista (p. ej. "Cochabamba").
 * Los nombres de departamento que no corresponden claramente a una ciudad
 * (p. ej. "Beni", "Chuquisaca", "Pando") NO se convierten automáticamente:
 * el dato original queda preservado en metadata, simplemente no se muestra como ciudad.
 */
export function cityFromMetadata(
  metadata: Record<string, any> | undefined | null
): string {
  if (!metadata) return '';
  const ciudad = String(metadata.ciudad || '').trim();
  if (ciudad) return ciudad;
  for (const key of ['region', 'sede']) {
    const legacy = String(metadata[key] || '').trim();
    if (legacy && (BOLIVIA_CITIES as readonly string[]).includes(legacy)) {
      return legacy;
    }
  }
  return '';
}
