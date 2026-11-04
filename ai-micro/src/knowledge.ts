/**
 * Base de Conocimiento Oficial de Fitness Club Pass Cochabamba
 * Fuente inmutable de verdad para el microservicio de IA.
 * Prohibido inventar datos fuera de este archivo.
 */

export interface PlanInfo {
  name: string;
  priceBs: number;
  checkins: number;
  description: string;
}

export const OFFICIAL_PLANS: Record<string, PlanInfo> = {
  basica: {
    name: 'Básica',
    priceBs: 290,
    checkins: 20,
    description: 'Bs 290 al mes con 20 check-ins en la red de gimnasios y centros deportivos afiliados.',
  },
  pro: {
    name: 'Pro',
    priceBs: 420,
    checkins: 25,
    description: 'Bs 420 al mes con 25 check-ins, incluye gimnasios de Básica más Yoga y Pilates (según disponibilidad del centro).',
  },
  elite: {
    name: 'Élite',
    priceBs: 560,
    checkins: 30,
    description: 'Bs 560 al mes con 30 check-ins, incluye acceso preferencial a todos los centros de la red.',
  },
};

export const AVAILABLE_DISCIPLINES = [
  'gimnasio',
  'musculacion',
  'natacion',
  'crossfit',
  'calistenia',
  'artes marciales',
  'boxeo',
  'muay thai',
  'padel',
  'pilates',
  'yoga',
  'tiro con arco',
  'hidrogimnasia',
  'boulder',
  'escalada',
] as const;

export const COVERAGE_ZONES = [
  'Zona Norte',
  'Cala Cala',
  'Avenida América',
  'Zona Central',
  'La Recoleta',
  'Sarco',
];

export const PAYMENT_PROCESS = {
  currency: 'Bolivianos (Bs)',
  method: 'Código QR Simple boliviano o transferencia bancaria en Bs.',
  steps: [
    '1. El cliente confirma el plan de su interés.',
    '2. El equipo comercial le envía el código QR de pago en Bs.',
    '3. El cliente efectúa el pago y envía su comprobante por este chat.',
    '4. El equipo valida el comprobante y activa la cuenta en la app de Fitness Club Pass.',
  ],
};

/**
 * Resumen compacto del conocimiento para inyectar en el System Prompt
 */
export const KNOWLEDGE_SUMMARY = `
- NEGOCIO: Fitness Club Pass en Cochabamba, Bolivia. Membresía multisede para entrenar en diversos gimnasios y centros deportivos con una sola suscripción mensual.
- PLANES OFICIALES (ÚNICOS PRECIOS VÁLIDOS, EN BOLIVIANOS):
  * Básica: Bs 290/mes (20 check-ins mensuales).
  * Pro: Bs 420/mes (25 check-ins mensuales, incluye Yoga/Pilates).
  * Élite: Bs 560/mes (30 check-ins mensuales, acceso preferencial a la red).
- DISCIPLINAS DISPONIBLES: Gimnasio/musculación, natación, artes marciales, boxeo, Muay Thai, CrossFit, calistenia, pádel, pilates, yoga, tiro con arco, hidrogimnasia y escalada/boulder.
- ZONAS DE COCHABAMBA: Zona Norte, Cala Cala, América, Zona Central, La Recoleta, Sarco.
- PAGO Y ACTIVACIÓN: Se paga exclusivamente mediante código QR Simple boliviano (o transferencia) en Bs. El equipo envía el QR, el cliente comparte el comprobante y el equipo activa el pase en la app móvil.
- PROHIBICIÓN TOTAL DE ALUCINACIONES: NUNCA inventar precios distintos, descuentos no existentes, ni prometer membresías gratuitas o ilimitadas. Si el usuario pregunta algo no contemplado (como horarios exactos de una sede específica o reclamos), se debe derivar con un asesor humano.
`.trim();
