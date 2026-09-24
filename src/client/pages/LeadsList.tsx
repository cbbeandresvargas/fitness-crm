import { createSignal, onMount, Show, For } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Lead, User } from '../types';

export default function LeadsList() {
  const { user, showToast } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [leads, setLeads] = createSignal<Lead[]>([]);
  const [agents, setAgents] = createSignal<User[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Filters from URL
  const [search, setSearch] = createSignal(
    typeof searchParams.search === 'string' ? searchParams.search : ''
  );
  const [segment, setSegment] = createSignal(
    typeof searchParams.segment === 'string' ? searchParams.segment : ''
  );
  const [status, setStatus] = createSignal(
    typeof searchParams.status === 'string' ? searchParams.status : ''
  );
  const [agentId, setAgentId] = createSignal(
    typeof searchParams.agentId === 'string' ? searchParams.agentId : ''
  );
  const [viewMode, setViewMode] = createSignal<'table' | 'cards'>('table');

  const updateUrlParams = (newSearch: string, newSeg: string, newStat: string, newAgent: string) => {
    const params: Record<string, string> = {};
    if (newSearch) params.search = newSearch;
    if (newSeg) params.segment = newSeg;
    if (newStat) params.status = newStat;
    if (newAgent) params.agentId = newAgent;
    setSearchParams(params);
  };

  const loadLeads = async () => {
    try {
      setLoading(true);
      const res = await api.getLeads({
        search: search(),
        segment: segment(),
        status: status(),
        agentId: agentId(),
      });
      setLeads(res.leads);
    } catch (err: any) {
      showToast(err.message || 'Error cargando prospectos', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(async () => {
    try {
      const agentsRes = await api.getAgents();
      setAgents(agentsRes.agents);
    } catch (e) {}
    loadLeads();
  });

  let debounceTimeout: any;
  const onSearchInput = (val: string) => {
    setSearch(val);
    updateUrlParams(val, segment(), status(), agentId());
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadLeads();
    }, 250);
  };

  const setFilterSegment = (seg: string) => {
    setSegment(seg);
    updateUrlParams(search(), seg, status(), agentId());
    loadLeads();
  };

  const setFilterStatus = (stat: string) => {
    setStatus(stat);
    updateUrlParams(search(), segment(), stat, agentId());
    loadLeads();
  };

  const setFilterAgent = (ag: string) => {
    setAgentId(ag);
    updateUrlParams(search(), segment(), status(), ag);
    loadLeads();
  };

  const clearFilters = () => {
    setSearch('');
    setSegment('');
    setStatus('');
    setAgentId('');
    setSearchParams({});
    loadLeads();
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const res = await api.updateLeadStatus(leadId, newStatus);
      showToast(`Estado actualizado a ${newStatus}`, 'success');
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, status: newStatus as any, segment: res.segment as any } : l
        )
      );
    } catch (err: any) {
      showToast(err.message || 'Error actualizando estado', 'error');
    }
  };

  const handleDeleteLead = async (leadId: string, leadName: string) => {
    if (!confirm(`¿Estás seguro de eliminar a ${leadName}? Esta acción borrará sus notas e historial.`)) {
      return;
    }
    try {
      await api.deleteLead(leadId);
      showToast(`Prospecto ${leadName} eliminado`, 'info');
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar prospecto', 'error');
    }
  };

  return (
    <Layout title="Lista de Prospectos">
      <div class="space-y-6 max-w-7xl mx-auto">
        {/* Controles y Filtros */}
        <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
          <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Buscador reactivo */}
            <div class="relative flex-1 max-w-md">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                🔍
              </span>
              <input
                type="text"
                value={search()}
                onInput={(e) => onSearchInput(e.currentTarget.value)}
                placeholder="Buscar por nombre, teléfono o correo..."
                class="w-full pl-10 pr-9 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
              />
              <Show when={search()}>
                <button
                  type="button"
                  onClick={() => onSearchInput('')}
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              </Show>
            </div>

            {/* Alternador de Vista & Botón Nuevo */}
            <div class="flex items-center gap-3 self-end md:self-auto">
              <div class="p-1 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode() === 'table'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  📄 Tabla
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode() === 'cards'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  🗂️ Tarjetas
                </button>
              </div>

              <A
                href="/leads/new"
                class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-2xl transition shadow-orange-glow flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>Nuevo Prospecto</span>
              </A>
            </div>
          </div>

          {/* Filtros rápidos por Segmento y Estado */}
          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-zinc-400 mr-1">Segmento:</span>
              {[
                { id: '', label: 'Todos' },
                { id: 'A', label: '🔥 A (VIP)' },
                { id: 'B', label: '⚡ B (Tibio)' },
                { id: 'C', label: '⏳ C (Atención)' },
                { id: 'D', label: '🛑 D (Inactivo)' },
              ].map((seg) => (
                <button
                  type="button"
                  onClick={() => setFilterSegment(seg.id)}
                  class={`px-3 py-1 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                    segment() === seg.id
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  {seg.label}
                </button>
              ))}
            </div>

            {/* Selectores de Estado y Asesor */}
            <div class="flex flex-wrap items-center gap-2">
              <select
                value={status()}
                onChange={(e) => setFilterStatus(e.currentTarget.value)}
                class="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-orange-500"
              >
                <option value="">Todos los Estados</option>
                <option value="nuevo">🌱 Nuevo</option>
                <option value="contactado">💬 Contactado</option>
                <option value="cita_agendada">📅 Cita Agendada</option>
                <option value="negociacion">🤝 Negociación</option>
                <option value="ganado">🏆 Ganado</option>
                <option value="perdido">🛑 Perdido</option>
              </select>

              <Show when={user()?.role === 'admin'}>
                <select
                  value={agentId()}
                  onChange={(e) => setFilterAgent(e.currentTarget.value)}
                  class="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-orange-500"
                >
                  <option value="">Todos los Asesores</option>
                  <For each={agents()}>
                    {(agent) => <option value={agent.id}>{agent.name}</option>}
                  </For>
                </select>
              </Show>

              <Show when={search() || segment() || status() || agentId()}>
                <button
                  type="button"
                  onClick={clearFilters}
                  class="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-red-400 transition"
                  title="Restablecer todos los filtros"
                >
                  ✕ Limpiar
                </button>
              </Show>
            </div>
          </div>
        </div>

        {/* Resumen de Resultados */}
        <div class="flex items-center justify-between text-xs text-zinc-400 px-2">
          <span>
            Mostrando <strong class="text-white">{leads().length}</strong> prospectos registrados
          </span>
        </div>

        {/* Listado de Prospectos */}
        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-col items-center justify-center p-20 text-zinc-500 space-y-3">
              <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Cargando prospectos...</span>
            </div>
          }
        >
          <Show
            when={leads().length > 0}
            fallback={
              <div class="p-16 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-4 shadow-xl">
                <span class="text-4xl block">🔍</span>
                <p class="text-base font-bold text-white">No se encontraron prospectos con esos criterios</p>
                <p class="text-xs text-zinc-400 max-w-sm mx-auto">
                  Prueba ajustando los filtros de búsqueda o registra un nuevo prospecto.
                </p>
                <div class="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
                  >
                    Restablecer Filtros
                  </button>
                  <A
                    href="/leads/new"
                    class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition shadow-orange-glow"
                  >
                    ➕ Anotar Prospecto
                  </A>
                </div>
              </div>
            }
          >
            {/* Vista Tabla */}
            <Show when={viewMode() === 'table'}>
              <div class="rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase font-bold tracking-wider">
                      <tr>
                        <th class="p-4">Prospecto</th>
                        <th class="p-4">Segmento</th>
                        <th class="p-4">Estado</th>
                        <th class="p-4">Interés / Meta</th>
                        <th class="p-4">Asesor</th>
                        <th class="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800/60">
                      <For each={leads()}>
                        {(lead) => (
                          <tr class="hover:bg-zinc-800/40 transition">
                            <td class="p-4">
                              <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-orange-400 text-xs shrink-0">
                                  {lead.full_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div class="space-y-0.5 min-w-0">
                                  <A
                                    href={`/leads/${lead.id}`}
                                    class="font-bold text-white hover:text-orange-400 transition truncate block"
                                  >
                                    {lead.full_name}
                                  </A>
                                  <div class="text-[11px] text-zinc-400 flex items-center gap-2">
                                    <span>{lead.phone}</span>
                                    <Show when={lead.email}>
                                      <span>•</span>
                                      <span class="truncate max-w-[140px]">{lead.email}</span>
                                    </Show>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td class="p-4">
                              <span
                                class={`px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block ${
                                  lead.segment === 'A'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : lead.segment === 'B'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : lead.segment === 'C'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                }`}
                              >
                                Segmento {lead.segment}
                              </span>
                            </td>

                            <td class="p-4">
                              <select
                                value={lead.status}
                                onChange={(e) => handleStatusChange(lead.id, e.currentTarget.value)}
                                class="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 cursor-pointer"
                              >
                                <option value="nuevo">🌱 Nuevo</option>
                                <option value="contactado">💬 Contactado</option>
                                <option value="cita_agendada">📅 Cita Agendada</option>
                                <option value="negociacion">🤝 Negociación</option>
                                <option value="ganado">🏆 Ganado</option>
                                <option value="perdido">🛑 Perdido</option>
                              </select>
                            </td>

                            <td class="p-4">
                              <div class="space-y-1">
                                <p class="font-medium text-zinc-200">
                                  {lead.metadata.producto || lead.metadata.objetivo || 'Fitness General'}
                                </p>
                                <div class="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                  <Show when={lead.metadata.presupuesto}>
                                    <span class="text-emerald-400 font-bold">
                                      ${lead.metadata.presupuesto} USD
                                    </span>
                                    <span>•</span>
                                  </Show>
                                  <span>{lead.metadata.sede || lead.metadata.ciudad || 'Principal'}</span>
                                </div>
                              </div>
                            </td>

                            <td class="p-4 text-zinc-300">
                              {lead.assigned_name || 'Sin asignar'}
                            </td>

                            <td class="p-4 text-right">
                              <div class="inline-flex items-center gap-1.5">
                                <a
                                  href={`https://wa.me/${lead.phone.replace(/^\+/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-xl transition"
                                  title="Abrir WhatsApp directo"
                                >
                                  💬
                                </a>
                                <A
                                  href={`/leads/${lead.id}`}
                                  class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-semibold transition"
                                >
                                  Ficha
                                </A>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLead(lead.id, lead.full_name)}
                                  class="p-2 text-zinc-500 hover:text-red-400 rounded-xl hover:bg-red-950/40 transition cursor-pointer"
                                  title="Eliminar prospecto"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            {/* Vista Tarjetas (Pipeline Cards) */}
            <Show when={viewMode() === 'cards'}>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <For each={leads()}>
                  {(lead) => (
                    <div class="p-5 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition space-y-4 shadow-xl flex flex-col justify-between">
                      <div class="space-y-3">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-orange-400 text-xs shrink-0">
                              {lead.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <A
                                href={`/leads/${lead.id}`}
                                class="font-bold text-white text-base hover:text-orange-400 transition block truncate"
                              >
                                {lead.full_name}
                              </A>
                              <p class="text-xs text-zinc-400">{lead.phone}</p>
                            </div>
                          </div>

                          <span
                            class={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 ${
                              lead.segment === 'A'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : lead.segment === 'B'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : lead.segment === 'C'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            Seg {lead.segment}
                          </span>
                        </div>

                        <div class="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1">
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-zinc-400">Programa:</span>
                            <span class="font-semibold text-zinc-200">
                              {lead.metadata.producto || 'Gimnasio'}
                            </span>
                          </div>
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-zinc-400">Presupuesto:</span>
                            <span class="font-bold text-emerald-400">
                              ${lead.metadata.presupuesto || 0} USD
                            </span>
                          </div>
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-zinc-400">Sede:</span>
                            <span class="text-zinc-300">
                              {lead.metadata.sede || lead.metadata.ciudad || 'No especificada'}
                            </span>
                          </div>
                        </div>

                        {/* Tags */}
                        <div class="flex flex-wrap gap-1.5">
                          <For each={lead.tags}>
                            {(t) => (
                              <span class="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[10px] font-medium">
                                #{t}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>

                      <div class="pt-3 border-t border-zinc-800 flex items-center justify-between gap-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.currentTarget.value)}
                          class="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-orange-500 cursor-pointer"
                        >
                          <option value="nuevo">🌱 Nuevo</option>
                          <option value="contactado">💬 Contactado</option>
                          <option value="cita_agendada">📅 Cita Agendada</option>
                          <option value="negociacion">🤝 Negociación</option>
                          <option value="ganado">🏆 Ganado</option>
                          <option value="perdido">🛑 Perdido</option>
                        </select>

                        <div class="flex items-center gap-1.5">
                          <a
                            href={`https://wa.me/${lead.phone.replace(/^\+/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-xl transition"
                            title="WhatsApp"
                          >
                            💬
                          </a>
                          <A
                            href={`/leads/${lead.id}`}
                            class="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition shadow-orange-glow"
                          >
                            Ver Ficha
                          </A>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </Layout>
  );
}
