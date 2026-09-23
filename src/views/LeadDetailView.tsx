import { html } from 'hono/html';
import { Lead, User, ActivityLog, MessageTemplate, SessionData } from '../lib/types';
import { renderTemplate, createWhatsAppDeepLink } from '../lib/ai';

interface LeadDetailProps {
  user: SessionData;
  lead: Lead;
  agents: User[];
  templates: MessageTemplate[];
  activities: ActivityLog[];
  segmentReason?: string;
  generatedAiText?: string;
  selectedTemplateId?: string;
  aiBriefing?: string;
}

export function LeadDetailView({
  user,
  lead,
  agents,
  templates,
  activities,
  segmentReason,
  generatedAiText,
  selectedTemplateId,
  aiBriefing,
}: LeadDetailProps) {
  const meta = lead.metadata || {};
  const currentAgent = agents.find((a) => a.id === lead.assigned_to);

  // Variables para la plantilla
  const vars: Record<string, string> = {
    nombre: lead.full_name.split(' ')[0],
    nombre_completo: lead.full_name,
    producto: meta.producto || 'nuestros planes de entrenamiento',
    ciudad: meta.ciudad || meta.sede || 'el gimnasio',
    sede: meta.sede || 'nuestra sede',
    agente: currentAgent?.name?.split(' ')[0] || user.name.split(' ')[0],
    telefono: lead.phone,
    presupuesto: meta.presupuesto ? `$${meta.presupuesto} USD` : 'personalizado',
  };

  const defaultTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const activeMessageText =
    generatedAiText ||
    (defaultTemplate ? renderTemplate(defaultTemplate.content, vars) : `¡Hola ${vars.nombre}! Te escribo de IronPeak Fitness...`);

  const whatsappUrl = createWhatsAppDeepLink(lead.phone, activeMessageText);

  // Pasos de avance del prospecto
  const pipelineSteps = [
    { key: 'nuevo', label: '1. Nuevo', emoji: '📥' },
    { key: 'contactado', label: '2. En Conversación', emoji: '💬' },
    { key: 'cita_agendada', label: '3. Cita Agendada', emoji: '📅' },
    { key: 'ganado', label: '4. ¡Inscrito / Ganado!', emoji: '🏆' },
  ];

  return html`
    <div class="space-y-6 max-w-5xl mx-auto">
      
      <!-- Volver atrás -->
      <div>
        <a href="/leads" class="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1.5">
          <span>← Volver a la lista de personas</span>
        </a>
      </div>

      <!-- Tarjeta Principal de la Persona -->
      <div class="p-6 rounded-3xl bg-brand-surface border border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-3xl bg-gradient-to-tr from-brand-orange to-amber-500 text-white flex items-center justify-center font-black text-2xl shadow-orange-glow shrink-0">
            ${lead.full_name.slice(0, 2).toUpperCase()}
          </div>
          <div class="space-y-1">
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="text-2xl font-black text-white">${lead.full_name}</h2>
              ${lead.segment === 'A' ? html`
                <span class="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-700 text-xs font-black">
                  🔥 CALIENTE / PRIORIDAD
                </span>
              ` : html`
                <span class="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold">
                  Prioridad Normal
                </span>
              `}
            </div>

            <div class="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
              <span>📞 Teléfono: <strong class="text-white">${lead.phone}</strong></span>
              <span>•</span>
              <span>👤 Asesor: <strong class="text-white">${currentAgent?.name || 'Sin Asignar'}</strong></span>
            </div>
          </div>
        </div>

        <!-- Asignar a otra persona si se desea -->
        <form action="/leads/${lead.id}/assign" method="POST" class="flex items-center gap-2">
          <select
            name="assigned_to"
            onchange="this.form.submit()"
            class="px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none"
            ${user.role !== 'admin' && lead.assigned_to !== user.userId ? 'disabled' : ''}
          >
            <option value="">Cambiar asesor...</option>
            ${agents.map((ag) => html`
              <option value="${ag.id}" ${lead.assigned_to === ag.id ? 'selected' : ''}>
                Asignar a: ${ag.name}
              </option>
            `)}
          </select>
        </form>
      </div>

      <!-- Barra de Pasos Visual (Haz Clic en un Paso para Cambiarlo) -->
      <div class="p-6 rounded-3xl bg-brand-surface border border-brand-border space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">¿En qué paso está este prospecto?</span>
          <span class="text-[11px] text-zinc-500 font-medium">Haz clic en cualquier paso para avanzar</span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          ${pipelineSteps.map((step) => {
            const isCurrent = lead.status === step.key;
            return html`
              <form action="/leads/${lead.id}/status" method="POST" class="w-full">
                <input type="hidden" name="status" value="${step.key}"/>
                <button
                  type="submit"
                  class="w-full p-3.5 rounded-2xl text-xs font-bold border transition flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-brand-orange text-white border-brand-orange shadow-orange-glow scale-102 font-extrabold'
                      : 'bg-brand-card text-zinc-400 hover:text-white hover:bg-zinc-800 border-brand-border'
                  }"
                >
                  <span class="text-base">${step.emoji}</span>
                  <span>${step.label}</span>
                </button>
              </form>
            `;
          })}
        </div>
      </div>

      <!-- Resumen Inteligente con IA (Explicado para Humanos) -->
      ${aiBriefing ? html`
        <div class="p-5 rounded-3xl bg-brand-card border border-brand-orange/40 flex items-start gap-4">
          <span class="text-2xl shrink-0">🧠</span>
          <div class="space-y-1">
            <h4 class="text-xs font-extrabold text-brand-orange uppercase tracking-wider">Consejo de Inteligencia Artificial para el Asesor:</h4>
            <p class="text-sm text-zinc-200 leading-relaxed font-medium">${aiBriefing}</p>
          </div>
        </div>
      ` : html`
        <div class="p-4 rounded-3xl bg-brand-surface border border-brand-border flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">💡</span>
            <span class="text-xs text-zinc-300">¿Quieres un resumen rápido de lo que busca este cliente?</span>
          </div>
          <form action="/leads/${lead.id}/ai-briefing" method="POST">
            <button
              type="submit"
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold border border-brand-border transition flex items-center gap-1.5"
            >
              <span>⚡ Resumir con IA</span>
            </button>
          </form>
        </div>
      `}

      <!-- CENTRO DE WHATSAPP (Fácil, Grande y Directo) -->
      <div class="p-7 rounded-3xl bg-gradient-to-b from-brand-surface to-brand-card border-2 border-emerald-900/60 shadow-green-glow space-y-6">
        
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div>
            <h3 class="text-lg font-extrabold text-white flex items-center gap-2">
              <span class="text-2xl">💬</span>
              <span>Enviar Mensaje de WhatsApp a ${vars.nombre}</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">Elige un mensaje rápido o deja que la IA lo escriba por ti:</p>
          </div>

          <!-- Botón Mágico de IA -->
          <form action="/leads/${lead.id}/ai-message" method="POST">
            <button
              type="submit"
              class="px-4 py-2 bg-gradient-to-r from-brand-orange to-amber-500 hover:scale-105 text-white rounded-xl text-xs font-black shadow-orange-glow transition flex items-center gap-2"
            >
              <span>✨ Redactar Mensaje Mágico con IA</span>
            </button>
          </form>
        </div>

        <!-- Botones de Respuestas Rápidas -->
        <div class="space-y-2">
          <span class="text-xs font-bold text-zinc-400">O elige una plantilla lista:</span>
          <div class="flex flex-wrap gap-2">
            ${templates.map((tmpl) => html`
              <a
                href="/leads/${lead.id}?template_id=${tmpl.id}"
                class="px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
                  tmpl.id === defaultTemplate?.id && !generatedAiText
                    ? 'bg-zinc-100 text-black border-white shadow-md'
                    : 'bg-brand-black text-zinc-300 hover:text-white hover:bg-zinc-800 border-zinc-800'
                }"
              >
                ${tmpl.title}
              </a>
            `)}
          </div>
        </div>

        <!-- Caja de Texto del Mensaje -->
        <form action="/leads/${lead.id}/send-whatsapp" method="POST" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1.5">
              Puedes editar el texto antes de enviar:
            </label>
            <textarea
              name="message"
              rows="4"
              class="w-full p-4 bg-brand-black border border-zinc-700 rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 leading-relaxed font-sans"
            >${activeMessageText}</textarea>
          </div>

          <input type="hidden" name="log_activity" value="1"/>

          <!-- BOTÓN GIGANTE VERDE IMPOSIBLE DE PERDER -->
          <button
            type="submit"
            class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-base font-black transition shadow-green-glow flex items-center justify-center gap-3 transform hover:scale-[1.01]"
          >
            <span class="text-2xl">🟢</span>
            <span>ABRIR WHATSAPP Y ENVIAR MENSAJE AHORA</span>
            <span class="text-xs font-medium opacity-80">(Se guardará en la bitácora)</span>
          </button>
        </form>

      </div>

      <!-- Datos Clave del Prospecto (Tarjetas Limpias) -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div class="p-5 rounded-3xl bg-brand-surface border border-brand-border space-y-1">
          <span class="text-xs font-bold uppercase tracking-wider text-brand-orange">🎯 Su Objetivo</span>
          <p class="text-base font-extrabold text-white">${meta.objetivo || 'Pérdida de peso / Tonificación'}</p>
          <p class="text-xs text-zinc-400">Meta deportiva que busca alcanzar</p>
        </div>

        <div class="p-5 rounded-3xl bg-brand-surface border border-brand-border space-y-1">
          <span class="text-xs font-bold uppercase tracking-wider text-brand-orange">💰 Presupuesto Estimado</span>
          <p class="text-base font-extrabold text-white">${meta.presupuesto ? `$${meta.presupuesto} USD/mes` : 'Por definir'}</p>
          <p class="text-xs text-zinc-400">Disposición de pago mensual</p>
        </div>

        <div class="p-5 rounded-3xl bg-brand-surface border border-brand-border space-y-1">
          <span class="text-xs font-bold uppercase tracking-wider text-brand-orange">📍 Sede y Horario</span>
          <p class="text-base font-extrabold text-white">${meta.sede || 'Principal'} • ${meta.horario_preferido || 'Flexible'}</p>
          <p class="text-xs text-zinc-400">Preferencia para entrenar</p>
        </div>

      </div>

      <!-- Bitácora: Lo que hemos hablado -->
      <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-5">
        <h3 class="text-base font-extrabold text-white flex items-center gap-2">
          <span>📝 Bitácora de Notas y Llamadas</span>
        </h3>

        <!-- Formulario para agregar una nota rápida -->
        <form action="/leads/${lead.id}/notes" method="POST" class="flex gap-3">
          <input
            type="text"
            name="note"
            required
            placeholder="Anota algo que te dijo (ej. 'Llamé, le interesa el horario de la tarde')..."
            class="flex-1 px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
          <button
            type="submit"
            class="px-5 py-3 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-bold transition shadow-orange-sm shrink-0"
          >
            Guardar Nota
          </button>
        </form>

        <!-- Historial de notas -->
        <div class="divide-y divide-zinc-800 pt-2">
          ${activities.length === 0 ? html`
            <div class="py-6 text-center text-xs text-zinc-500">Todavía no hay notas escritas.</div>
          ` : activities.map((act) => html`
            <div class="py-3.5 flex items-start gap-3 text-xs">
              <span class="text-base shrink-0 mt-0.5">
                ${act.action_type === 'whatsapp_sent' ? '🟢' : act.action_type === 'status_change' ? '🔄' : '📝'}
              </span>
              <div class="space-y-0.5 flex-1">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-white">${act.user_name || 'Sistema'}</span>
                  <span class="text-[11px] text-zinc-500">${act.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <p class="text-zinc-300">${act.details}</p>
              </div>
            </div>
          `)}
        </div>
      </div>

    </div>
  `;
}
