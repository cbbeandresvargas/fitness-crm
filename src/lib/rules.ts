import { D1Database } from '@cloudflare/workers-types';
import { Lead, LeadSegment, User } from './types';
import { computeFcSegment } from './segments';

/**
 * Normaliza un número telefónico para comparación estricta y formato WhatsApp.
 * Territorio objetivo: Exclusivamente Bolivia (+591, móviles de 8 dígitos).
 * Limpia cualquier carácter no numérico y formatea:
 * - 8 dígitos (ej. 7XXXXXXX o 6XXXXXXX) -> +591XXXXXXXX
 * - Inicia con 591 o +591 (11 dígitos) -> +591XXXXXXXX
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim();
  if (!trimmed) return '';

  // Descartar si contiene letras o signos más mal posicionados/duplicados
  if (/[a-zA-Z]/.test(trimmed)) return '';
  if ((trimmed.match(/\+/g) || []).length > 1) return '';
  if (trimmed.includes('+') && !trimmed.startsWith('+')) return '';

  // Extraer sólo dígitos
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // Caso Bolivia móvil: 8 dígitos que empiezan con 6 o 7
  if (digits.length === 8) {
    if (/^[67]/.test(digits)) {
      return `+591${digits}`;
    }
    // Números de 8 dígitos que no inician con 6 ni 7 no son móviles válidos de Bolivia
    return '';
  }

  // Caso Bolivia con código 591 (11 dígitos: 591 + 8 dígitos móviles)
  if (digits.length === 11 && digits.startsWith('591')) {
    if (/^591[67]/.test(digits)) {
      return `+${digits}`;
    }
    return '';
  }

  // Si tenía un + inicial y longitud válida internacional (entre 9 y 15 dígitos)
  if (trimmed.startsWith('+') && digits.length >= 9 && digits.length <= 15) {
    return `+${digits}`;
  }

  return '';
}

/**
 * Verifica si ya existe un lead con el mismo número telefónico
 */
export async function checkDuplicatePhone(
  db: D1Database,
  phone: string,
  excludeLeadId?: string
): Promise<{ exists: boolean; existingLead?: { id: string; full_name: string; phone: string } }> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { exists: false };

  let query = 'SELECT id, full_name, phone FROM leads WHERE phone = ?';
  const params: any[] = [normalized];

  if (excludeLeadId) {
    query += ' AND id != ?';
    params.push(excludeLeadId);
  }

  const result = await db.prepare(query).bind(...params).first<{ id: string; full_name: string; phone: string }>();

  if (result) {
    return { exists: true, existingLead: result };
  }
  return { exists: false };
}

/**
 * Motor de Segmentación Comercial FC — delega en la única fuente de verdad
 * (`computeFcSegment` de lib/segments). Ver reglas y prioridad allí.
 *
 * La columna `segment` de la BD es NOT NULL y actúa como caché del valor derivado:
 * las lecturas (lista, detalle, dashboard, export) siempre re-derivan con
 * computeFcSegment, por lo que el segmento cambia solo cuando cambia la
 * relación del prospecto con FC (p. ej. B pasa a A al comprar su primera
 * membresía). Si el lead no califica para ningún segmento, se cachea 'C'.
 */
export function calculateDynamicSegment(lead: {
  status: string;
  metadata?: Record<string, any> | string;
  last_contacted_at?: string | null;
  last_inbound_at?: string | null;
  created_at?: string | null;
}): { segment: LeadSegment; reason: string } {
  const computed = computeFcSegment(lead);
  return {
    segment: (computed.segment ?? 'C') as LeadSegment,
    reason: computed.reason,
  };
}

/**
 * Algoritmo de asignación automática de leads:
 * Selecciona el agente activo con menor cantidad de leads asignados (Carga balanceada / Round Robin)
 */
export async function autoAssignAgent(db: D1Database): Promise<string | null> {
  try {
    // Buscar todos los agentes activos y contar cuántos leads tienen
    const query = `
      SELECT u.id, u.name, COUNT(l.id) as active_leads
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id AND l.status NOT IN ('ganado', 'perdido')
      WHERE u.role = 'agent' AND u.is_active = 1
      GROUP BY u.id
      ORDER BY active_leads ASC, u.created_at ASC
      LIMIT 1;
    `;
    const agent = await db.prepare(query).first<{ id: string; name: string }>();
    if (agent) {
      return agent.id;
    }

    // Si no hay agentes activos, buscar admin
    const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1").first<{ id: string }>();
    return admin ? admin.id : null;
  } catch (err) {
    console.error('Error en autoAssignAgent:', err);
    return null;
  }
}
