import { normalizePhone } from './rules';

/**
 * Reemplaza variables / placeholders como {nombre}, {producto}, {ciudad}, {agente} en una plantilla
 * con valores por defecto seguros para Fitness Club Pass Cochabamba
 */
export function renderTemplate(
  templateContent: string,
  variables: Record<string, string>
): string {
  const merged: Record<string, string> = {
    producto: 'Fitness Club Pass',
    ciudad: 'Cochabamba',
    agente: 'tu Asesor',
    nombre: '',
    ...variables,
  };

  let result = templateContent;
  for (const [key, val] of Object.entries(merged)) {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, val?.trim() || (key === 'nombre' ? '' : 'Fitness Club Pass'));
  }
  // Limpieza de espacios dobles si el nombre estaba vacío
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Genera el enlace directo (deep link) para WhatsApp Web / Móvil
 */
export function createWhatsAppDeepLink(phone: string, text: string): string {
  const normalized = normalizePhone(phone);
  const cleanNumber = normalized.replace(/^\+/, '');
  const encodedText = encodeURIComponent(text.trim());
  return `https://wa.me/${cleanNumber}?text=${encodedText}`;
}
