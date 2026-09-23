import { html } from 'hono/html';
import { Lead, User, SessionData } from '../lib/types';

interface LeadsViewProps {
  user: SessionData;
  leads: Lead[];
  agents: User[];
  filters: {
    search?: string;
    segment?: string;
    status?: string;
    agentId?: string;
    tag?: string;
    view?: string;
  };
  allTags: string[];
}

export function LeadsView({
  user,
  leads,
  agents,
  filters,
  allTags,
}: LeadsViewProps) {
  const currentView = filters.view || 'table';

  const filterTabs = [
    { key: '', label: '🌟 Todos', active: !filters.segment && !filters.status },
    { key: 'segment=A', label: '🔥 Muy Interesados (VIP)', active: filters.segment === 'A' },
    { key: 'status=cita_agendada', label: '📅 Con Cita Agendada', active: filters.status === 'cita_agendada' },
    { key: 'status=contactado', label: '💬 En Conversación', active: filters.status === 'contactado' },
    { key: 'status=ganado', label: '🏆 Ya Inscritos', active: filters.status === 'ganado' },
    { key: 'segment=C', label: '⏰ Por Reactivar', active: filters.segment === 'C' },
  ];

  return html`
    <div class="space-y-6 max-w-6xl mx-auto">
      
      <!-- Barra de Filtros Simple -->
      <div class="p-6 rounded-3xl bg-brand-surface border border-brand-border space-y-4">
        
        <!-- Buscador Grande y Botón de Vista -->
        <div class="flex flex-col md:flex-row items-center justify-between gap-4">
          <form method="GET" action="/leads" class="w-full md:w-auto flex-1 flex items-center gap-3">
            <input type="hidden" name="view" value="${currentView}"/>
            <div class="relative flex-1 max-w-lg">
              <span class="absolute left-4 top-3.5 text-zinc-400 text-base">🔍</span>
              <input
                type="text"
                name="search"
                value="${filters.search || ''}"
                placeholder="Escribe el nombre o teléfono de la persona..."
                class="w-full pl-11 pr-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>
            <button
              type="submit"
              class="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-bold transition border border-brand-border"
            >
              Buscar
            </button>
            ${filters.search || filters.segment || filters.status || filters.agentId || filters.tag ? html`
              <a href="/leads?view=${currentView}" class="text-xs text-brand-orange hover:underline font-bold">Limpiar</a>
            ` : ''}
          </form>

          <!-- Alternar Lista vs Tablero -->
          <div class="flex items-center gap-2 bg-brand-card p-1.5 rounded-2xl border border-brand-border">
            <a
              href="/leads?view=table${filters.search ? '&search=' + filters.search : ''}${filters.segment ? '&segment=' + filters.segment : ''}${filters.status ? '&status=' + filters.status : ''}"
              class="px-4 py-2 rounded-xl text-xs font-bold transition ${currentView === 'table' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white'}"
            >
              📄 Vista Lista
            </a>
            <a
              href="/leads?view=kanban${filters.search ? '&search=' + filters.search : ''}${filters.segment ? '&segment=' + filters.segment : ''}${filters.status ? '&status=' + filters.status : ''}"
              class="px-4 py-2 rounded-xl text-xs font-bold transition ${currentView === 'kanban' ? 'bg-brand-orange text-white shadow-orange-glow' : 'text-zinc-400 hover:text-white'}"
            >
              📋 Vista Tablero
            </a>
          </div>
        </div>

        <!-- Pestañas Rápidas con Botones Claros -->
        <div class="flex items-center gap-2 pt-2 border-t border-brand-border overflow-x-auto">
          ${filterTabs.map((t) => html`
            <a
              href="/leads?view=${currentView}&${t.key}"
              class="px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition ${
                t.active
                  ? 'bg-zinc-100 text-black shadow-md'
                  : 'bg-brand-card text-zinc-400 hover:text-white hover:bg-zinc-800 border border-brand-border'
              }"
            >
              ${t.label}
            </a>
          `)}
        </div>

      </div>

      <!-- Vista 1: Lista Sencilla y Espaciosa -->
      ${currentView === 'table' ? html`
        <div class="space-y-3">
          ${leads.length === 0 ? html`
            <div class="p-12 text-center rounded-3xl bg-brand-surface border border-brand-border space-y-2">
              <span class="text-3xl">🔍</span>
              <p class="text-base font-bold text-white">No encontramos a nadie con ese filtro</p>
              <p class="text-xs text-zinc-400">Intenta buscar con otra palabra o haz clic en "Ver Todos"</p>
              <a href="/leads" class="inline-block mt-2 text-xs font-bold text-brand-orange hover:underline">
                Ver todos los prospectos
              </a>
            </div>
          ` : leads.map((lead) => {
            const cleanPhone = lead.phone.replace(/[\s\-\(\)\+]/g, '');
            const meta = lead.metadata || {};

            const statusSpanish = {
              nuevo: { text: 'Nuevo', color: 'bg-zinc-800 text-zinc-300' },
              contactado: { text: 'En conversación', color: 'bg-blue-950 text-blue-300 border border-blue-800' },
              cita_agendada: { text: 'Cita Agendada', color: 'bg-brand-orange/20 text-brand-orange border border-brand-orange/50' },
              negociacion: { text: 'Evaluando precios', color: 'bg-amber-950 text-amber-300 border border-amber-800' },
              ganado: { text: '¡Cliente Inscrito!', color: 'bg-emerald-950 text-emerald-300 border border-emerald-800' },
              perdido: { text: 'No interesado', color: 'bg-red-950 text-red-300 border border-red-900' },
            }[lead.status] || { text: lead.status, color: 'bg-zinc-800 text-zinc-300' };

            return html`
              <div class="p-5 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-orange/50 transition flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                
                <!-- Datos de la persona -->
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-extrabold text-lg shrink-0">
                    ${lead.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2 flex-wrap">
                      <a href="/leads/${lead.id}" class="text-base font-extrabold text-white group-hover:text-brand-orange transition">
                        ${lead.full_name}
                      </a>
                      <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusSpanish.color}">
                        ${statusSpanish.text}
                      </span>
                      ${lead.segment === 'A' ? html`
                        <span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black">
                          🔥 CALIENTE
                        </span>
                      ` : ''}
                    </div>

                    <p class="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                      <span>📞 ${lead.phone}</span>
                      <span>•</span>
                      <span>🎯 Meta: <strong class="text-zinc-200">${meta.objetivo || 'Fitness'}</strong></span>
                      ${meta.presupuesto ? html`
                        <span>•</span>
                        <span>💰 Presupuesto: <strong class="text-zinc-200">$${meta.presupuesto} USD</strong></span>
                      ` : ''}
                    </p>
                  </div>
                </div>

                <!-- Botones Gigantes de Acción Directa -->
                <div class="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <!-- Botón gigante de WhatsApp -->
                  <a
                    href="https://wa.me/${cleanPhone}"
                    target="_blank"
                    class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold transition shadow-green-glow flex items-center gap-1.5"
                    title="Abrir WhatsApp directo"
                  >
                    <span class="text-base">🟢</span>
                    <span>WhatsApp</span>
                  </a>

                  <!-- Botón de Ver Ficha -->
                  <a
                    href="/leads/${lead.id}"
                    class="px-4 py-2.5 bg-zinc-800 hover:bg-brand-orange hover:text-white text-zinc-200 rounded-2xl text-xs font-bold transition border border-brand-border flex items-center gap-1.5"
                  >
                    <span>Abrir Ficha</span>
                    <span>→</span>
                  </a>
                </div>

              </div>
            `;
          })}
        </div>
      ` : html`
        
        <!-- Vista 2: Tablero Visual de Pasos (Kanban Amigable) -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          ${[
            { key: 'nuevo', title: '1. Nuevos Leads', emoji: '📥' },
            { key: 'contactado', title: '2. En Conversación', emoji: '💬' },
            { key: 'cita_agendada', title: '3. Cita Agendada', emoji: '📅' },
            { key: 'ganado', title: '4. ¡Inscritos!', emoji: '🏆' },
          ].map((col) => {
            const colLeads = leads.filter((l) => l.status === col.key);
            return html`
              <div class="p-4 rounded-3xl bg-brand-surface border border-brand-border space-y-3">
                <div class="flex items-center justify-between pb-2 border-b border-brand-border">
                  <h4 class="font-extrabold text-sm text-white flex items-center gap-2">
                    <span>${col.emoji}</span>
                    <span>${col.title}</span>
                  </h4>
                  <span class="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold">
                    ${colLeads.length}
                  </span>
                </div>

                <div class="space-y-2.5">
                  ${colLeads.length === 0 ? html`
                    <div class="p-6 text-center text-xs text-zinc-500 italic">No hay nadie aquí</div>
                  ` : colLeads.map((lead) => {
                    const cleanPhone = lead.phone.replace(/[\s\-\(\)\+]/g, '');
                    return html`
                      <div class="p-4 rounded-2xl bg-brand-card border border-brand-border hover:border-brand-orange transition space-y-2 group">
                        <div class="flex items-start justify-between gap-2">
                          <a href="/leads/${lead.id}" class="font-bold text-white text-xs group-hover:text-brand-orange">
                            ${lead.full_name}
                          </a>
                          ${lead.segment === 'A' ? html`<span class="text-[10px]">🔥</span>` : ''}
                        </div>
                        <p class="text-[11px] text-zinc-400">${lead.phone}</p>
                        
                        <div class="pt-2 border-t border-zinc-800 flex items-center justify-between">
                          <a
                            href="https://wa.me/${cleanPhone}"
                            target="_blank"
                            class="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <span>🟢 Enviar WA</span>
                          </a>
                          <a href="/leads/${lead.id}" class="text-xs font-bold text-brand-orange hover:underline">
                            Ver Ficha →
                          </a>
                        </div>
                      </div>
                    `;
                  })}
                </div>
              </div>
            `;
          })}
        </div>

      `}

    </div>
  `;
}
