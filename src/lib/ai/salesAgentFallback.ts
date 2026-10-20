import type { Lead, KnowledgeBaseEntry, WhatsAppSettings } from '../types';
import { normalizeActivityName } from '../activities';
import type { AgentAction } from './salesAgent';

/**
 * Motor de contingencia comercial del agente de ventas (extraído de salesAgent.ts).
 *
 * Se ejecuta únicamente desde runSalesAgentTurn() cuando Cloudflare Workers AI
 * no devuelve ninguna respuesta (binding y REST agotados para toda la cadena de
 * modelos): garantiza que el prospecto NUNCA se quede sin respuesta mediante un
 * motor de reglas por palabras clave y lectura dinámica de Ajustes y KB.
 *
 * Nota: AgentAction se importa como tipo desde ./salesAgent (type-only import,
 * se elimina en compilación) para evitar una dependencia circular en runtime.
 */

/**
 * Extrae información de precios configurada dinámicamente en Ajustes (KB o Business Context).
 */
function extractPricingInfo(
  kbEntries: KnowledgeBaseEntry[],
  settings?: WhatsAppSettings | null
): string | null {
  // 1. Prioridad: Buscar en kbEntries entradas activas de planes / precios
  const pricingKb = (kbEntries || []).filter((entry) => {
    if (entry.is_active === 0) return false;
    const cat = (entry.category || '').toLowerCase();
    const title = (entry.title || '').toLowerCase();
    const content = (entry.content || '').toLowerCase();
    return (
      cat.includes('plan') ||
      cat.includes('precio') ||
      cat.includes('pricing') ||
      cat.includes('membres') ||
      cat.includes('tarifa') ||
      title.includes('plan') ||
      title.includes('precio') ||
      title.includes('membres') ||
      title.includes('fit') ||
      title.includes('pase') ||
      content.includes('bs') ||
      content.includes('precio') ||
      content.includes('tarifa')
    );
  });

  if (pricingKb.length > 0) {
    const lines = pricingKb.slice(0, 4).map((e) => {
      const firstLine =
        e.content
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 0) || e.content.trim();
      return `- ${e.title}: ${firstLine}`;
    });
    return `Tenemos las siguientes opciones oficiales registradas en Ajustes:\n\n${lines.join('\n')}`;
  }

  // 2. Prioridad: Revisar si settings?.business_context contiene información de precios personalizada
  const customContext = settings?.business_context?.trim();
  if (customContext) {
    const candidateLines = customContext
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 0 &&
          (l.includes('Bs') ||
            l.toLowerCase().includes('precio') ||
            l.toLowerCase().includes('plan') ||
            l.toLowerCase().includes('tarifa') ||
            l.toLowerCase().includes('costo') ||
            l.toLowerCase().includes('membres'))
      );

    // Preferir líneas con formato de viñeta o número si existen; de lo contrario incluir las candidatas
    const bulletLines = candidateLines.filter(
      (l) => l.startsWith('-') || l.startsWith('*') || /^\d+[\.\)]/.test(l)
    );
    const selected = bulletLines.length > 0 ? bulletLines : candidateLines;

    if (selected.length > 0) {
      const formatted = selected.slice(0, 4).map((l) => {
        if (l.startsWith('-') || l.startsWith('*') || /^\d+[\.\)]/.test(l)) {
          return l;
        }
        return `- ${l}`;
      });
      return `Nuestras opciones de membresía son:\n\n${formatted.join('\n')}`;
    }
  }

  return null;
}

/**
 * Generador de respuesta comercial inteligente de contingencia (Zero-failure fallback)
 * Garantiza que el prospecto NUNCA se quede sin respuesta aunque Workers AI tenga latencia o caída temporal,
 * priorizando la información configurada por el usuario en Ajustes y KB.
 */
export function generateSmartSalesFallback(params: {
  lead: Lead;
  incomingText: string;
  kbEntries: KnowledgeBaseEntry[];
  settings?: WhatsAppSettings | null;
}): AgentAction {
  const { lead, incomingText, kbEntries, settings } = params;
  const lower = incomingText.toLowerCase().trim();
  const firstName = lead.full_name?.split(' ')[0] || '';
  const greeting =
    firstName &&
    !firstName.toLowerCase().startsWith('whatsapp') &&
    !firstName.toLowerCase().startsWith('lead') &&
    !firstName.toLowerCase().startsWith('prospecto')
      ? `Hola ${firstName}`
      : 'Hola';

  // 1. Detección de solicitud de asesor humano
  if (
    lower.includes('humano') ||
    lower.includes('asesor') ||
    lower.includes('persona') ||
    lower.includes('alguien') ||
    lower.includes('queja') ||
    lower.includes('reclamo') ||
    lower.includes('llamame') ||
    lower.includes('llámame') ||
    lower.includes('telefono') ||
    lower.includes('teléfono') ||
    lower.includes('encargado')
  ) {
    return {
      action: 'handoff',
      handoff_reason: 'El prospecto solicitó atención humana directa.',
      farewell: `${greeting}, te comunico enseguida con un asesor para atenderte personalmente por aquí.`,
      suggested_status: lead.status === 'nuevo' ? 'contactado' : lead.status,
    };
  }

  // 2. Detección discreta de nombre del prospecto
  let detectedName: string | undefined = undefined;
  const nameMatch = lower.match(/(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ]+)/i);
  if (nameMatch && nameMatch[1]) {
    const raw = nameMatch[1].trim();
    if (!['un', 'una', 'el', 'la', 'nuevo', 'interesado', 'cliente', 'de'].includes(raw.toLowerCase())) {
      detectedName = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }

  // 3. Detección de disciplinas
  const detectedDisciplines: string[] = [];
  if (
    lower.includes('gym') ||
    lower.includes('pesa') ||
    lower.includes('musculacion') ||
    lower.includes('musculación')
  ) {
    detectedDisciplines.push('Musculación / Gym');
  }
  if (
    lower.includes('natacion') ||
    lower.includes('natación') ||
    lower.includes('pileta') ||
    lower.includes('piscina')
  ) {
    detectedDisciplines.push('Natación');
  }
  if (lower.includes('crossfit')) {
    detectedDisciplines.push('CrossFit');
  }
  if (lower.includes('padel') || lower.includes('pádel') || lower.includes('paddle')) {
    detectedDisciplines.push('Pádel');
  }
  if (lower.includes('pilates') || lower.includes('yoga')) {
    detectedDisciplines.push('Pilates / Yoga');
  }
  if (lower.includes('boxeo') || lower.includes('box') || lower.includes('marcial')) {
    detectedDisciplines.push('Boxeo / Artes Marciales');
  }
  if (lower.includes('funcional') || lower.includes('calistenia')) {
    detectedDisciplines.push('Funcional / Calistenia');
  }

  // 4. Detección de comprobante o confirmación de pago
  if (
    lower.includes('comprobante') ||
    lower.includes('transferi') ||
    lower.includes('transferí') ||
    lower.includes('ya pague') ||
    lower.includes('ya pagué') ||
    lower.includes('listo el pago') ||
    lower.includes('pago realizado') ||
    lower.includes('envió una foto') ||
    lower.includes('envio una foto')
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'ganado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['pago_confirmado', 'cliente_activo'],
      reply_text: `¡Excelente noticia! Bienvenido a Fitness Club Pass. Por favor pásame tu correo electrónico para dar de alta tu cuenta y enviarte los enlaces de descarga de la app móvil.`,
    };
  }

  // 5. Detección de interés de pago, QR o cuenta
  if (
    lower.includes('pago') ||
    lower.includes('pagar') ||
    lower.includes('qr') ||
    lower.includes('transferencia') ||
    lower.includes('cuenta') ||
    lower.includes('inscribir') ||
    lower.includes('comprar') ||
    lower.includes('adquirir') ||
    lower.includes('banco')
  ) {
    return {
      action: 'update_and_reply',
      suggested_status: 'negociacion',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['interes_pago', 'solicito_qr'],
      reply_text: `¡Buenísimo! Te facilito el código QR simple para activar tu pase hoy mismo. ¿Prefieres pago por QR o transferencia bancaria en Bolivianos?`,
    };
  }

  const clientGreeting = detectedName ? `Hola ${detectedName}` : greeting;

  // 6. Consulta de planes y precios
  if (
    lower.includes('plan') ||
    lower.includes('precio') ||
    lower.includes('costo') ||
    lower.includes('cuanto') ||
    lower.includes('cuánto') ||
    lower.includes('vale') ||
    lower.includes('valor') ||
    lower.includes('membresia') ||
    lower.includes('membresía') ||
    lower.includes('tarifa') ||
    lower.includes('promo') ||
    lower.includes('descuento')
  ) {
    const customPricing = extractPricingInfo(kbEntries, settings);
    const pricingBody =
      customPricing ||
      `Tenemos tres opciones de membresía mensual:\n\n- Básica: Bs 290 al mes, con 20 check-ins.\n- Pro: Bs 420 al mes, con 25 check-ins.\n- Élite: Bs 560 al mes, con 30 check-ins.`;

    return {
      action: 'update_and_reply',
      suggested_status: 'negociacion',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['consulta_precios'],
      reply_text: `${clientGreeting}. ${pricingBody}\n\n¿Qué actividades te gustaría hacer? Así te ayudo a ver cuál te conviene.`,
    };
  }

  // 7. Consulta explícita de sedes / zonas en Cochabamba
  if (
    lower.includes('sede') ||
    lower.includes('centro') ||
    lower.includes('zona') ||
    lower.includes('donde') ||
    lower.includes('dónde') ||
    lower.includes('ubicacion') ||
    lower.includes('ubicación') ||
    (lower.includes('cochabamba') && !detectedName)
  ) {
    const sedeKb = (kbEntries || []).filter((entry) => {
      if (entry.is_active === 0) return false;
      const cat = (entry.category || '').toLowerCase();
      const title = (entry.title || '').toLowerCase();
      return (
        cat.includes('sede') ||
        cat.includes('ubicacion') ||
        cat.includes('zona') ||
        title.includes('sede') ||
        title.includes('zona')
      );
    });

    const sedesInfo =
      sedeKb.length > 0
        ? `Sedes y centros confirmados en Ajustes:\n\n${sedeKb.slice(0, 3).map((e) => `- ${e.title}: ${e.content.split('\n')[0].trim()}`).join('\n')}`
        : `Nuestra red multideporte cubre las mejores zonas de Cochabamba: Zona Norte, Cala Cala, América, Zona Central, Recoleta y Sarco.`;

    return {
      action: 'update_and_reply',
      suggested_status: 'contactado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: ['consulta_sedes'],
      reply_text: `${clientGreeting}. ${sedesInfo}\n\n¿En qué zona te queda más cómodo entrenar?`,
    };
  }

  // 8. Saludo inicial o registro de disciplinas (Paso 1 del embudo)
  if (detectedDisciplines.length > 0) {
    const discStr = detectedDisciplines.join(' y ');
    return {
      action: 'update_and_reply',
      suggested_status: 'contactado',
      detected_name: detectedName,
      detected_disciplines: detectedDisciplines,
      suggested_tags: detectedDisciplines.map((d) => `interes_${normalizeActivityName(d).replace(/[\s/]+/g, '_')}`),
      reply_text: `¡${clientGreeting}! Excelente opción con ${discStr}. Con Fitness Club Pass tienes acceso en toda Cochabamba con una sola membresía en Bs. ¿En qué zona o barrio te queda más cómodo entrenar?`,
    };
  }

  return {
    action: 'update_and_reply',
    suggested_status: 'contactado',
    detected_name: detectedName,
    detected_disciplines: detectedDisciplines,
    reply_text: `¡${clientGreeting}! Te saluda el equipo de Fitness Club Pass Cochabamba. Con una sola membresía en Bs tienes acceso a múltiples gimnasios y disciplinas en la ciudad. ¿Cuál es tu nombre y qué deporte te gustaría practicar?`,
  };
}
