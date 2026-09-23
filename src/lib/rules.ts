import { D1Database } from '@cloudflare/workers-types';
import { Lead, LeadSegment, User } from './types';

/**
 * Normaliza un número telefónico para comparación estricta y formato WhatsApp
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';
  // Elimina espacios, guiones, paréntesis y puntos
  let cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');
  // Si no inicia con +, pero tiene 10 o más dígitos
  if (!cleaned.startsWith('+')) {
    // Si tiene 10 dígitos (ej. México/Colombia), asumimos +52 si no trae código o agregamos +
    if (cleaned.length === 10) {
      cleaned = '+52' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
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
 * Motor de Segmentación Dinámica:
 * Calcula automáticamente si el lead pertenece a Segmento A, B, C o D
 */
export function calculateDynamicSegment(lead: {
  status: string;
  metadata?: Record<string, any> | string;
  last_contacted_at?: string | null;
  created_at?: string | null;
}): { segment: LeadSegment; reason: string } {
  const meta: Record<string, any> =
    typeof lead.metadata === 'string'
      ? (() => {
          try {
            return JSON.parse(lead.metadata);
          } catch {
            return {};
          }
        })()
      : lead.metadata || {};

  const presupuesto = Number(meta.presupuesto) || 0;
  const status = lead.status;

  // Cálculo de días desde el último contacto
  const referenceDateStr = lead.last_contacted_at || lead.created_at || new Date().toISOString();
  const lastContactDate = new Date(referenceDateStr);
  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Regla 1: Descartado / Perdido o inactividad severa > 30 días
  if (status === 'perdido' || diffDays > 30 || (presupuesto > 0 && presupuesto < 35)) {
    return {
      segment: 'D',
      reason: status === 'perdido' ? 'Lead marcado como Perdido' : diffDays > 30 ? `Inactividad de ${diffDays} días (>30d)` : 'Presupuesto por debajo del mínimo',
    };
  }

  // Regla 2: Segmento A (VIP / Alto Valor / Caliente)
  if (
    status === 'ganado' ||
    presupuesto >= 150 ||
    (status === 'cita_agendada' && diffDays <= 3) ||
    (status === 'negociacion' && diffDays <= 2)
  ) {
    return {
      segment: 'A',
      reason: status === 'ganado'
        ? 'Cliente ganado / Activo'
        : presupuesto >= 150
        ? `Presupuesto alto ($${presupuesto} USD)`
        : `En fase ${status} con contacto reciente (${diffDays}d)`,
    };
  }

  // Regla 3: Segmento C (Frío / Requiere reactivación)
  if (diffDays >= 14 || status === 'contactado' && diffDays >= 7) {
    return {
      segment: 'C',
      reason: `Sin contacto en ${diffDays} días (Reactivación necesaria)`,
    };
  }

  // Regla 4: Segmento B (Tibio / Seguimiento estándar)
  return {
    segment: 'B',
    reason: `Seguimiento regular activo (${diffDays} días desde último contacto)`,
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
