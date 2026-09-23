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
  segmentReason = 'Clasificado según reglas dinámicas',
  generatedAiText,
  selectedTemplateId,
  aiBriefing,
}: LeadDetailProps) {
  const meta = lead.metadata || {};
  const currentAgent = agents.find((a) => a.id === lead.assigned_to);

  // Template variables mapping
  const vars: Record<string, string> = {
    nombre: lead.full_name.split(' ')[0],
    nombre_completo: lead.full_name,
    producto: meta.producto || 'nuestros planes fitness',
    ciudad: meta.ciudad || meta.sede || 'nuestro gimnasio',
    sede: meta.sede || 'nuestras instalaciones',
    agente: currentAgent?.name?.split(' ')[0] || user.name.split(' ')[0],
    telefono: lead.phone,
    presupuesto: meta.presupuesto ? `$${meta.presupuesto} USD` : 'personalizado',
  };

  // Determine current active message text
  const defaultTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const activeMessageText = generatedAiText || (defaultTemplate ? renderTemplate(defaultTemplate.content, vars) : `Hola ${vars.nombre}, ¿cómo estás?`);
  const whatsappUrl = createWhatsAppDeepLink(lead.phone, activeMessageText);

  const segmentColors = {
    A: { bg: 'bg-emerald-950', border: 'border-emerald-700', text: 'text-emerald-400', label: 'VIP / Alta Intención' },
    B: { bg: 'bg-blue-950', border: 'border-blue-700', text: 'text-blue-400', label: 'Seguimiento Activo' },
    C: { bg: 'bg-amber-950', border: 'border-amber-700', text: 'text-amber-400', label: 'Frío / Inactivo' },
    D: { bg: 'bg-zinc-900', border: 'border-zinc-700', text: 'text-zinc-400', label: 'Descartado' },
  }[lead.segment];

  return html`
    <div class="space-y-6">

      <!-- Breadcrumbs & Top Bar -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <a href="/leads" class="text-xs text-brand-orange hover:underline font-semibold flex items-center gap-1 mb-1">
            ← Volver al Pipeline
          </a>
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-black text-white">${lead.full_name}</h2>
            <span class="px-2.5 py-1 rounded-full border text-xs font-black tracking-wider ${segmentColors.bg} ${segmentColors.border} ${segmentColors.text}">
              SEGMENTO ${lead.segment}
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            <strong>Motivo de regla:</strong> ${segmentReason}
          </p>
        </div>

        <!-- Quick actions -->
        <div class="flex items-center gap-2">
          <!-- Re-evaluate segment button -->
          <form action="/leads/${lead.id}/recalculate-segment" method="POST">
            <button type="submit" class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl border border-brand-border transition flex items-center gap-1.5" title="Revalúa inactividad y presupuesto">
              <span>🔄 Revaluar Reglas</span>
            </button>
          </form>

          <!-- Direct WhatsApp button -->
          <a
            href="${whatsappUrl}"
            target="_blank"
            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-lg flex items-center gap-2"
          >
            <span>🟢 Abrir WhatsApp</span>
          </a>
        </div>
      </div>

      <!-- Main 2-Column Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left Column: WhatsApp & AI Messaging Center (2 Cols) -->
        <div class="lg:col-span-2 space-y-6">

          <!-- Cloudflare Workers AI: Executive Briefing & Commercial Next Step -->
          <div class="p-5 rounded-2xl bg-gradient-to-r from-brand-surface via-brand-card to-brand-surface border border-brand-border space-y-3 relative overflow-hidden">
            <div class="flex items-center justify-between pb-2 border-b border-brand-border">
              <div class="flex items-center gap-2">
                <span class="text-base">⚡</span>
                <div>
                  <h3 class="text-xs font-bold text-white uppercase tracking-wider">Cloudflare Workers AI • Diagnóstico Comercial</h3>
                  <p class="text-[11px] text-zinc-400">Resumen ejecutivo y recomendación para el coach de ventas (@cf/meta/llama-3.1-8b-instruct)</p>
                </div>
              </div>

              <form action="/leads/${lead.id}/ai-briefing" method="POST">
                <button
                  type="submit"
                  class="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-1.5"
                >
                  <span>🧠 Generar Diagnóstico con Workers AI</span>
                </button>
              </form>
            </div>

            ${aiBriefing ? html`
              <div class="p-3.5 rounded-xl bg-brand-black/80 border border-brand-orange/40 text-xs text-zinc-200 leading-relaxed font-medium">
                ${aiBriefing}
              </div>
            ` : html`
              <p class="text-xs text-zinc-400 italic">
                Haz clic en el botón superior para que Cloudflare Workers AI sintetice las notas, objetivos y etapa de este prospecto y determine el siguiente paso recomendado.
              </p>
            `}
          </div>

          <!-- WhatsApp & AI Message Generator Card -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border relative overflow-hidden space-y-5">
            <div class="flex items-center justify-between pb-3 border-b border-brand-border">
              <div class="flex items-center gap-2">
                <span class="text-lg">💬</span>
                <div>
                  <h3 class="text-sm font-bold text-white">Centro de Mensajería WhatsApp & Asistente IA</h3>
                  <p class="text-xs text-zinc-400">Personalización dinámica con contexto del lead, tags y plantillas con variables</p>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-full bg-brand-orange-subtle border border-brand-orange/40 text-brand-orange text-[10px] font-bold">
                Cloudflare Workers AI
              </span>
            </div>

            <!-- Template selection & AI Generator Controls -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Cargar Plantilla con Placeholders</label>
                <form method="GET" action="/leads/${lead.id}">
                  <select
                    name="template_id"
                    onchange="this.form.submit()"
                    class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
                  >
                    ${templates.map((tmpl) => html`
                      <option value="${tmpl.id}" ${tmpl.id === defaultTemplate?.id ? 'selected' : ''}>
                        ${tmpl.title} (${tmpl.category})
                      </option>
                    `)}
                  </select>
                </form>
              </div>

              <!-- AI Generator Trigger Form -->
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Generador de Mensaje con IA</label>
                <form action="/leads/${lead.id}/ai-message" method="POST" class="flex gap-2">
                  <select name="tone" class="flex-1 px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange">
                    <option value="motivador y persuasivo">Tono Motivador & Fitness</option>
                    <option value="urgencia y cierre comercial">Tono Cierre & Descuento</option>
                    <option value="reactivacion amigable">Tono Reactivación Amigable</option>
                    <option value="cordial y formal">Tono Cordial & Evaluación</option>
                  </select>
                  <button
                    type="submit"
                    class="px-3.5 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-1.5 shrink-0"
                  >
                    <span>✨ Redactar IA</span>
                  </button>
                </form>
              </div>
            </div>

            <!-- Variable Chips Preview -->
            <div class="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-brand-card border border-brand-border text-[11px]">
              <span class="text-zinc-500 font-semibold">Variables inyectadas:</span>
              <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"><strong>{nombre}:</strong> ${vars.nombre}</span>
              <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"><strong>{producto}:</strong> ${vars.producto}</span>
              <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"><strong>{ciudad}:</strong> ${vars.ciudad}</span>
              <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300"><strong>{agente}:</strong> ${vars.agente}</span>
            </div>

            <!-- WhatsApp Message Editor & Sender Form -->
            <form action="/leads/${lead.id}/send-whatsapp" method="POST" class="space-y-4">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-zinc-200">Mensaje prellenado para WhatsApp Web / Móvil:</label>
                  <button
                    type="button"
                    onclick="navigator.clipboard.writeText(document.getElementById('waText').value); alert('Mensaje copiado al portapapeles');"
                    class="text-xs text-brand-orange hover:underline font-semibold"
                  >
                    📋 Copiar texto
                  </button>
                </div>
                <textarea
                  id="waText"
                  name="message"
                  rows="4"
                  class="w-full p-3.5 bg-brand-black border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange font-sans leading-relaxed"
                >${activeMessageText}</textarea>
              </div>

              <!-- Action button bar -->
              <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div class="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" name="log_activity" id="log_act" value="1" checked class="rounded bg-zinc-800 border-zinc-700 text-brand-orange focus:ring-0"/>
                  <label for="log_act" class="cursor-pointer">Registrar automáticamente en la Bitácora</label>
                </div>

                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="submit"
                    name="action"
                    value="save_and_open"
                    class="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.974.536 1.879.82 2.796.82 3.183 0 5.768-2.587 5.769-5.766.001-3.182-2.585-5.767-5.769-5.767zm0-2.172c4.379 0 7.938 3.559 7.939 7.938 0 4.38-3.56 7.939-7.939 7.939-1.29 0-2.522-.315-3.618-.871l-5.382 1.41 1.439-5.253c-.636-1.144-.977-2.443-.977-3.763 0-4.379 3.559-7.938 7.938-7.938z"/></svg>
                    <span>Lanzar Deep Link & Guardar en Bitácora</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          <!-- Structured Metadata & Fitness Attributes (JSONB / Key-Value) -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-brand-border">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span>🧬 Metadatos Flexibles (JSONB / Key-Value)</span>
                </h3>
                <p class="text-xs text-zinc-400">Atributos deportivos, presupuestos y objetivos sin alterar el esquema SQL</p>
              </div>
              <span class="text-xs text-brand-orange font-bold">D1 JSON</span>
            </div>

            <!-- Current metadata attributes display & editor -->
            <form action="/leads/${lead.id}/metadata" method="POST" class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${Object.entries(meta).map(([key, value]) => html`
                  <div class="p-3 rounded-xl bg-brand-card border border-brand-border space-y-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-brand-orange block">
                      ${key.replace('_', ' ')}
                    </span>
                    <input
                      type="text"
                      name="meta_${key}"
                      value="${String(value)}"
                      class="w-full bg-transparent border-b border-zinc-700 py-1 text-xs text-white focus:outline-none focus:border-brand-orange"
                    />
                  </div>
                `)}
              </div>

              <!-- Add new key-value row -->
              <div class="p-3 rounded-xl bg-brand-black border border-dashed border-zinc-700 flex flex-col sm:flex-row items-center gap-2 text-xs">
                <span class="text-zinc-400 font-semibold shrink-0">+ Nuevo atributo:</span>
                <input
                  type="text"
                  name="new_key"
                  placeholder="Clave (ej. lesiones, sede_preferida)"
                  class="flex-1 px-3 py-1.5 bg-brand-card border border-brand-border rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
                <input
                  type="text"
                  name="new_val"
                  placeholder="Valor (ej. Menisco derecho, Polanco)"
                  class="flex-1 px-3 py-1.5 bg-brand-card border border-brand-border rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div class="flex justify-end">
                <button
                  type="submit"
                  class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-brand-border transition"
                >
                  Guardar Cambios de Metadatos
                </button>
              </div>
            </form>
          </div>

          <!-- Activity Timeline & Bitácora -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-brand-border">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span>📜 Bitácora de Actividades & Historial</span>
                </h3>
                <p class="text-xs text-zinc-400">Registro inmutable de notas, llamadas, reasignaciones y estados</p>
              </div>
              <span class="text-xs text-zinc-500">${activities.length} eventos</span>
            </div>

            <!-- Add new note form -->
            <form action="/leads/${lead.id}/notes" method="POST" class="space-y-3">
              <div class="flex gap-2">
                <input
                  type="text"
                  name="note"
                  required
                  placeholder="Escribir una nota rápida (ej. 'Hablamos por teléfono, solicita plan semestral')..."
                  class="flex-1 px-3.5 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
                <select name="action_type" class="px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange">
                  <option value="note">Nota / Observación</option>
                  <option value="whatsapp_sent">WhatsApp Enviado</option>
                  <option value="status_change">Avance de Etapa</option>
                </select>
                <button
                  type="submit"
                  class="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm"
                >
                  Registrar
                </button>
              </div>
            </form>

            <!-- Timeline feed -->
            <div class="space-y-3 pt-2">
              ${activities.length === 0 ? html`
                <div class="py-6 text-center text-xs text-zinc-500">
                  Sin actividades registradas todavía.
                </div>
              ` : activities.map((act) => {
                const badge = 
                  act.action_type === 'whatsapp_sent' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                  act.action_type === 'status_change' ? 'bg-blue-950 text-blue-400 border-blue-800' :
                  act.action_type === 'segment_change' ? 'bg-purple-950 text-purple-400 border-purple-800' :
                  act.action_type === 'ai_generated' ? 'bg-brand-orange-subtle text-brand-orange border-brand-orange/40' :
                  'bg-zinc-800 text-zinc-300 border-zinc-700';

                return html`
                  <div class="p-3.5 rounded-xl bg-brand-card border border-brand-border space-y-1">
                    <div class="flex items-center justify-between text-xs">
                      <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${badge}">
                          ${act.action_type.replace('_', ' ')}
                        </span>
                        <span class="font-bold text-white">${act.user_name || 'Sistema'}</span>
                      </div>
                      <span class="text-[11px] text-zinc-500">${act.created_at}</span>
                    </div>
                    <p class="text-xs text-zinc-300 mt-1">${act.details}</p>
                  </div>
                `;
              })}
            </div>
          </div>

        </div>

        <!-- Right Column: Lead Info, Status, Agent & Quick Tags (1 Col) -->
        <div class="space-y-6">

          <!-- Lead Info & Pipeline Controller -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-5">
            <h3 class="text-sm font-bold text-white pb-2 border-b border-brand-border">
              ⚙️ Control de Pipeline
            </h3>

            <!-- Status Form -->
            <form action="/leads/${lead.id}/status" method="POST" class="space-y-3">
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Etapa Actual</label>
                <select
                  name="status"
                  onchange="this.form.submit()"
                  class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange font-semibold"
                >
                  <option value="nuevo" ${lead.status === 'nuevo' ? 'selected' : ''}>Nuevo Lead</option>
                  <option value="contactado" ${lead.status === 'contactado' ? 'selected' : ''}>Contactado</option>
                  <option value="cita_agendada" ${lead.status === 'cita_agendada' ? 'selected' : ''}>Cita Agendada</option>
                  <option value="negociacion" ${lead.status === 'negociacion' ? 'selected' : ''}>Negociación</option>
                  <option value="ganado" ${lead.status === 'ganado' ? 'selected' : ''}>Ganado (Inscrito / Cliente)</option>
                  <option value="perdido" ${lead.status === 'perdido' ? 'selected' : ''}>Perdido (Descartado)</option>
                </select>
              </div>
            </form>

            <!-- Agent Assignment Form (Admin or current agent) -->
            <form action="/leads/${lead.id}/assign" method="POST" class="space-y-3">
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Agente / Responsable Asignado</label>
                <div class="flex gap-2">
                  <select
                    name="assigned_to"
                    class="flex-1 px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
                    ${user.role !== 'admin' && lead.assigned_to !== user.userId ? 'disabled' : ''}
                  >
                    <option value="">Sin Asignar</option>
                    ${agents.map((ag) => html`
                      <option value="${ag.id}" ${lead.assigned_to === ag.id ? 'selected' : ''}>
                        ${ag.name} (${ag.role})
                      </option>
                    `)}
                  </select>
                  <button
                    type="submit"
                    class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-brand-border transition"
                  >
                    Asignar
                  </button>
                </div>
              </div>
            </form>

            <!-- Contact Data Sheet -->
            <div class="pt-3 border-t border-brand-border space-y-2.5 text-xs">
              <div class="flex justify-between">
                <span class="text-zinc-500 font-medium">Teléfono:</span>
                <span class="text-white font-bold">${lead.phone}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-zinc-500 font-medium">Correo:</span>
                <span class="text-white font-bold">${lead.email || 'No registrado'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-zinc-500 font-medium">Último contacto:</span>
                <span class="text-zinc-300">${lead.last_contacted_at ? lead.last_contacted_at.slice(0, 16).replace('T', ' ') : 'Nunca'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-zinc-500 font-medium">Creado:</span>
                <span class="text-zinc-400">${lead.created_at.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          <!-- Quick Tagging & Interest Chips -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-brand-border">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🏷️ Tags / Chips de Interés</span>
              </h3>
              <form action="/leads/${lead.id}/ai-suggest-tags" method="POST">
                <button
                  type="submit"
                  class="px-2.5 py-1 rounded-lg bg-brand-orange-subtle text-brand-orange border border-brand-orange/40 text-[10px] font-bold hover:bg-brand-orange hover:text-white transition flex items-center gap-1"
                  title="Cloudflare Workers AI analiza el perfil para sugerir tags relevantes"
                >
                  <span>✨ Auto-Tags con AI</span>
                </button>
              </form>
            </div>

            <!-- Current Tags -->
            <div class="flex flex-wrap gap-1.5">
              ${lead.tags && lead.tags.length > 0 ? lead.tags.map((tag) => html`
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-xs border border-zinc-700">
                  <span>#${tag}</span>
                  <form action="/leads/${lead.id}/tags/remove" method="POST" class="inline">
                    <input type="hidden" name="tag" value="${tag}"/>
                    <button type="submit" class="text-zinc-500 hover:text-red-400 font-bold ml-1">×</button>
                  </form>
                </span>
              `) : html`<p class="text-xs text-zinc-500">Sin tags asignados.</p>`}
            </div>

            <!-- Quick Add Popular Tag Buttons -->
            <div class="space-y-1.5 pt-2 border-t border-brand-border">
              <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Sugerencias rápidas:</span>
              <div class="flex flex-wrap gap-1">
                ${['CrossFit', 'Nutrición', 'Hipertrofia', 'Pilates', 'Membresía VIP', 'Personal Trainer'].map((t) => html`
                  <form action="/leads/${lead.id}/tags/add" method="POST" class="inline">
                    <input type="hidden" name="tag" value="${t}"/>
                    <button
                      type="submit"
                      class="px-2 py-0.5 rounded text-[10px] bg-brand-card hover:bg-brand-orange/20 hover:text-brand-orange border border-brand-border text-zinc-400 transition"
                    >
                      + ${t}
                    </button>
                  </form>
                `)}
              </div>
            </div>

            <!-- Manual Custom Tag Input -->
            <form action="/leads/${lead.id}/tags/add" method="POST" class="flex gap-2 pt-2">
              <input
                type="text"
                name="tag"
                required
                placeholder="Nuevo tag personalizado..."
                class="flex-1 px-3 py-1.5 bg-brand-card border border-brand-border rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
              <button
                type="submit"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-brand-border"
              >
                Agregar
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  `;
}
