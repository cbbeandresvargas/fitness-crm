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
    view?: string; // 'table' | 'kanban'
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

  const statuses = [
    { key: 'nuevo', label: 'Nuevo Lead', color: 'border-zinc-700 bg-zinc-900/80 text-zinc-300' },
    { key: 'contactado', label: 'Contactado', color: 'border-blue-800 bg-blue-950/40 text-blue-300' },
    { key: 'cita_agendada', label: 'Cita Agendada', color: 'border-brand-orange/60 bg-brand-orange-subtle text-brand-orange' },
    { key: 'negociacion', label: 'Negociación', color: 'border-amber-800 bg-amber-950/40 text-amber-300' },
    { key: 'ganado', label: 'Ganado (Cliente)', color: 'border-emerald-800 bg-emerald-950/40 text-emerald-300' },
    { key: 'perdido', label: 'Perdido', color: 'border-red-900/60 bg-red-950/30 text-red-400' },
  ];

  return html`
    <div class="space-y-6">

      <!-- Action & Filter Bar -->
      <div class="p-5 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
        
        <!-- Top row: Search, View Switcher & New Lead Button -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <form method="GET" action="/leads" class="flex-1 flex flex-wrap items-center gap-3">
            <input type="hidden" name="view" value="${currentView}"/>
            
            <!-- Search input -->
            <div class="relative min-w-[240px] flex-1">
              <svg class="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input
                type="text"
                name="search"
                value="${filters.search || ''}"
                placeholder="Buscar por nombre, teléfono o email..."
                class="w-full pl-10 pr-4 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange transition"
              />
            </div>

            <!-- Segment filter -->
            <select name="segment" onchange="this.form.submit()" class="px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange">
              <option value="">Todos los Segmentos</option>
              <option value="A" ${filters.segment === 'A' ? 'selected' : ''}>Segmento A (VIP/Caliente)</option>
              <option value="B" ${filters.segment === 'B' ? 'selected' : ''}>Segmento B (Tibio/Regular)</option>
              <option value="C" ${filters.segment === 'C' ? 'selected' : ''}>Segmento C (Frío/Reactivación)</option>
              <option value="D" ${filters.segment === 'D' ? 'selected' : ''}>Segmento D (Descartado)</option>
            </select>

            <!-- Status filter -->
            <select name="status" onchange="this.form.submit()" class="px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange">
              <option value="">Todas las Etapas</option>
              ${statuses.map((s) => html`
                <option value="${s.key}" ${filters.status === s.key ? 'selected' : ''}>${s.label}</option>
              `)}
            </select>

            <!-- Agent filter (Visible for admin) -->
            ${user.role === 'admin' ? html`
              <select name="agentId" onchange="this.form.submit()" class="px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange">
                <option value="">Todos los Agentes</option>
                ${agents.map((ag) => html`
                  <option value="${ag.id}" ${filters.agentId === ag.id ? 'selected' : ''}>${ag.name}</option>
                `)}
              </select>
            ` : ''}

            <button type="submit" class="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-brand-border transition">
              Filtrar
            </button>

            ${filters.search || filters.segment || filters.status || filters.agentId || filters.tag ? html`
              <a href="/leads?view=${currentView}" class="text-xs text-brand-orange hover:underline font-medium">Limpiar</a>
            ` : ''}
          </form>

          <!-- Right: View switchers & Add Lead -->
          <div class="flex items-center gap-2">
            <div class="flex items-center bg-brand-card border border-brand-border p-1 rounded-xl">
              <a
                href="/leads?view=table${filters.search ? '&search=' + filters.search : ''}${filters.segment ? '&segment=' + filters.segment : ''}${filters.status ? '&status=' + filters.status : ''}"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${currentView === 'table' ? 'bg-brand-orange text-white' : 'text-zinc-400 hover:text-white'}"
                title="Vista Tabla"
              >
                Tabla
              </a>
              <a
                href="/leads?view=kanban${filters.search ? '&search=' + filters.search : ''}${filters.segment ? '&segment=' + filters.segment : ''}${filters.status ? '&status=' + filters.status : ''}"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${currentView === 'kanban' ? 'bg-brand-orange text-white' : 'text-zinc-400 hover:text-white'}"
                title="Vista Kanban Pipeline"
              >
                Kanban
              </a>
            </div>

            <a href="/leads/new" class="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Crear Lead
            </a>
          </div>
        </div>

        <!-- Tags quick filter bar -->
        ${allTags.length > 0 ? html`
          <div class="flex items-center gap-2 pt-2 border-t border-brand-border overflow-x-auto text-xs">
            <span class="text-zinc-500 font-semibold shrink-0">Tags fitness:</span>
            ${allTags.map((tag) => html`
              <a
                href="/leads?view=${currentView}&tag=${encodeURIComponent(tag)}"
                class="px-2.5 py-1 rounded-lg border text-[11px] font-medium shrink-0 transition ${
                  filters.tag === tag
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'bg-brand-card border-brand-border text-zinc-400 hover:text-white hover:border-zinc-600'
                }"
              >
                #${tag}
              </a>
            `)}
          </div>
        ` : ''}

      </div>

      <!-- Main Display: Table or Kanban -->
      ${currentView === 'table' ? html`
        
        <!-- Table View -->
        <div class="rounded-2xl bg-brand-surface border border-brand-border overflow-hidden shadow-2xl">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-brand-border bg-brand-card/70 text-zinc-400 uppercase tracking-wider font-bold text-[11px]">
                  <th class="py-3.5 px-4">Prospecto</th>
                  <th class="py-3.5 px-4">Segmento</th>
                  <th class="py-3.5 px-4">Etapa Pipeline</th>
                  <th class="py-3.5 px-4">Asignado</th>
                  <th class="py-3.5 px-4">Tags & Intereses</th>
                  <th class="py-3.5 px-4">Último Contacto</th>
                  <th class="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-brand-border">
                ${leads.length === 0 ? html`
                  <tr>
                    <td colspan="7" class="py-12 text-center text-zinc-500 text-sm">
                      No se encontraron prospectos con los filtros aplicados.
                    </td>
                  </tr>
                ` : leads.map((lead) => {
                  const segmentBadge = 
                    lead.segment === 'A' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                    lead.segment === 'B' ? 'bg-blue-950 text-blue-400 border-blue-800' :
                    lead.segment === 'C' ? 'bg-amber-950 text-amber-400 border-amber-800' :
                    'bg-zinc-800 text-zinc-400 border-zinc-700';

                  const cleanPhone = lead.phone.replace(/[\s\-\(\)\+]/g, '');

                  return html`
                    <tr class="hover:bg-brand-card/50 transition group">
                      <!-- Name & Phone -->
                      <td class="py-3 px-4">
                        <a href="/leads/${lead.id}" class="font-bold text-white hover:text-brand-orange text-sm block">
                          ${lead.full_name}
                        </a>
                        <div class="flex items-center gap-2 mt-0.5">
                          <span class="text-zinc-400">${lead.phone}</span>
                          <a
                            href="https://wa.me/${cleanPhone}"
                            target="_blank"
                            class="text-emerald-500 hover:text-emerald-400 font-bold flex items-center gap-0.5"
                            title="Abrir WhatsApp directo"
                          >
                            <span>🟢 WA</span>
                          </a>
                        </div>
                      </td>

                      <!-- Segment -->
                      <td class="py-3 px-4">
                        <span class="px-2.5 py-1 rounded-full border text-[11px] font-black tracking-wider ${segmentBadge}">
                          SEG ${lead.segment}
                        </span>
                      </td>

                      <!-- Status -->
                      <td class="py-3 px-4">
                        <span class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold capitalize ${
                          statuses.find((s) => s.key === lead.status)?.color || 'border-zinc-700 bg-zinc-900 text-zinc-300'
                        }">
                          ${lead.status.replace('_', ' ')}
                        </span>
                      </td>

                      <!-- Assigned Agent -->
                      <td class="py-3 px-4">
                        <span class="text-zinc-300 font-medium">
                          ${lead.assigned_name || 'Sin asignar'}
                        </span>
                      </td>

                      <!-- Tags -->
                      <td class="py-3 px-4">
                        <div class="flex flex-wrap gap-1 max-w-xs">
                          ${lead.tags && lead.tags.length > 0 ? lead.tags.slice(0, 3).map((tg) => html`
                            <span class="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-[10px] border border-zinc-700">
                              #${tg}
                            </span>
                          `) : html`<span class="text-zinc-600">-</span>`}
                        </div>
                      </td>

                      <!-- Last contact -->
                      <td class="py-3 px-4 text-zinc-400">
                        ${lead.last_contacted_at ? lead.last_contacted_at.slice(0, 16).replace('T', ' ') : 'Sin contacto'}
                      </td>

                      <!-- Actions -->
                      <td class="py-3 px-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                          <a
                            href="/leads/${lead.id}"
                            class="px-3 py-1.5 rounded-xl bg-brand-orange-subtle hover:bg-brand-orange/20 text-brand-orange border border-brand-orange/30 font-bold transition text-[11px]"
                          >
                            Ver Ficha & IA
                          </a>
                        </div>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </div>

      ` : html`
        
        <!-- Kanban Pipeline View -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
          ${statuses.map((st) => {
            const columnLeads = leads.filter((l) => l.status === st.key);
            return html`
              <div class="rounded-2xl bg-brand-surface border border-brand-border flex flex-col min-w-[240px]">
                
                <!-- Column Header -->
                <div class="p-3 border-b border-brand-border flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full ${
                      st.key === 'nuevo' ? 'bg-zinc-400' :
                      st.key === 'contactado' ? 'bg-blue-500' :
                      st.key === 'cita_agendada' ? 'bg-brand-orange' :
                      st.key === 'negociacion' ? 'bg-amber-500' :
                      st.key === 'ganado' ? 'bg-emerald-500' : 'bg-red-500'
                    }"></span>
                    <h4 class="font-bold text-xs text-white">${st.label}</h4>
                  </div>
                  <span class="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-bold">
                    ${columnLeads.length}
                  </span>
                </div>

                <!-- Cards list -->
                <div class="p-2 space-y-2 flex-1 overflow-y-auto max-h-[650px]">
                  ${columnLeads.length === 0 ? html`
                    <div class="p-4 text-center text-[11px] text-zinc-600 italic">
                      Vacío
                    </div>
                  ` : columnLeads.map((lead) => {
                    const segmentColor =
                      lead.segment === 'A' ? 'border-emerald-700 bg-emerald-950/60 text-emerald-400' :
                      lead.segment === 'B' ? 'border-blue-700 bg-blue-950/60 text-blue-400' :
                      lead.segment === 'C' ? 'border-amber-700 bg-amber-950/60 text-amber-400' :
                      'border-zinc-700 bg-zinc-900 text-zinc-400';

                    return html`
                      <div class="p-3 rounded-xl bg-brand-card border border-brand-border hover:border-brand-orange/60 transition shadow-sm space-y-2 group">
                        <div class="flex items-start justify-between gap-1">
                          <a href="/leads/${lead.id}" class="font-bold text-xs text-white hover:text-brand-orange">
                            ${lead.full_name}
                          </a>
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-black border ${segmentColor}">
                            ${lead.segment}
                          </span>
                        </div>

                        <p class="text-[11px] text-zinc-400 truncate">${lead.phone}</p>

                        ${lead.tags && lead.tags.length > 0 ? html`
                          <div class="flex flex-wrap gap-1">
                            ${lead.tags.slice(0, 2).map((t) => html`
                              <span class="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">#${t}</span>
                            `)}
                          </div>
                        ` : ''}

                        <div class="pt-2 border-t border-brand-border/80 flex items-center justify-between text-[10px] text-zinc-500">
                          <span>${lead.assigned_name?.split(' ')[0] || 'Libre'}</span>
                          <a href="/leads/${lead.id}" class="text-brand-orange font-bold hover:underline">Abrir →</a>
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
