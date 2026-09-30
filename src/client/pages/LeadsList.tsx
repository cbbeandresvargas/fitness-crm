import { createSignal, onMount, Show, For } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Lead, User } from '../types';
import { cityFromMetadata } from '../../lib/locations';

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
        <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
          <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Buscador reactivo */}
            <div class="relative flex-1 max-w-md">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                🔍
              </span>
              <input
                type="text"
                value={search()}
                onInput={(e) => onSearchInput(e.currentTarget.value)}
                placeholder="Buscar por nombre, teléfono o correo..."
                class="w-full pl-10 pr-9 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body placeholder-muted focus:outline-none focus:border-accent transition"
              />
              <Show when={search()}>
                <button
                  type="button"
                  onClick={() => onSearchInput('')}
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-body"
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              </Show>
            </div>

            {/* Alternador de Vista & Botón Nuevo */}
            <div class="flex items-center gap-3 self-end md:self-auto">
              <div class="p-1 bg-app border border-edge rounded-xl flex items-center">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode() === 'table'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted hover:text-body'
                  }`}
                >
                  📄 Tabla
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    viewMode() === 'cards'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted hover:text-body'
                  }`}
                >
                  🗂️ Tarjetas
                </button>
              </div>

              <A
                href="/leads/new"
                class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl transition shadow-accent-glow flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>Nuevo Prospecto</span>
              </A>
            </div>
          </div>

          {/* Filtros rápidos por Segmento y Estado */}
          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-edge/80">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-muted mr-1">Segmento:</span>
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
                      ? 'bg-accent/20 border-accent text-accent-text'
                      : 'bg-app border-edge text-muted hover:text-body hover:border-edge-strong'
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
                class="px-3 py-1.5 bg-app border border-edge rounded-xl text-xs text-body-soft focus:outline-none focus:border-accent"
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
                  class="px-3 py-1.5 bg-app border border-edge rounded-xl text-xs text-body-soft focus:outline-none focus:border-accent"
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
                  class="px-2.5 py-1.5 text-xs text-muted hover:text-red-400 transition"
                  title="Restablecer todos los filtros"
                >
                  ✕ Limpiar
                </button>
              </Show>
            </div>
          </div>
        </div>

        {/* Resumen de Resultados */}
        <div class="flex items-center justify-between text-xs text-muted px-2">
          <span>
            Mostrando <strong class="text-body">{leads().length}</strong> prospectos registrados
          </span>
        </div>

        {/* Listado de Prospectos */}
        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-col items-center justify-center p-20 text-muted space-y-3">
              <div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Cargando prospectos...</span>
            </div>
          }
        >
          <Show
            when={leads().length > 0}
            fallback={
              <div class="p-16 rounded-3xl bg-surface border border-edge text-center space-y-4 shadow-xl">
                <span class="text-4xl block">🔍</span>
                <p class="text-base font-bold text-body">No se encontraron prospectos con esos criterios</p>
                <p class="text-xs text-muted max-w-sm mx-auto">
                  Prueba ajustando los filtros de búsqueda o registra un nuevo prospecto.
                </p>
                <div class="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    class="px-4 py-2 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-semibold rounded-xl transition"
                  >
                    Restablecer Filtros
                  </button>
                  <A
                    href="/leads/new"
                    class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition shadow-accent-glow"
                  >
                    ➕ Anotar Prospecto
                  </A>
                </div>
              </div>
            }
          >
            {/* Vista Tabla */}
            <Show when={viewMode() === 'table'}>
              <div class="rounded-3xl bg-surface border border-edge overflow-hidden shadow-2xl">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-app/80 border-b border-edge text-muted uppercase font-bold tracking-wider">
                      <tr>
                        <th class="p-4">Prospecto</th>
                        <th class="p-4">Ciudad</th>
                        <th class="p-4">Segmento</th>
                        <th class="p-4">Estado del Lead</th>
                        <th class="p-4">Membresía</th>
                        <th class="p-4">Interés / Meta</th>
                        <th class="p-4">Asesor</th>
                        <th class="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-edge/60">
                      <For each={leads()}>
                        {(lead) => (
                          <tr class="hover:bg-elevate/40 transition">
                            <td class="p-4">
                              <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-elevate border border-edge-strong flex items-center justify-center font-bold text-accent-text text-xs shrink-0">
                                  {lead.full_name.slice(0, 2).toUpperCase()}
                                </div>
                                <div class="space-y-0.5 min-w-0">
                                  <A
                                    href={`/leads/${lead.id}`}
                                    class="font-bold text-body hover:text-accent-text transition truncate block"
                                  >
                                    {lead.full_name}
                                  </A>
                                  <div class="text-[11px] text-muted flex items-center gap-2">
                                    <span>{lead.phone}</span>
                                    <Show when={lead.email}>
                                      <span>•</span>
                                      <span class="truncate max-w-[140px]">{lead.email}</span>
                                    </Show>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td class="p-4 text-xs font-semibold text-body-soft whitespace-nowrap">
                              {cityFromMetadata(lead.metadata) || (
                                <span class="text-muted font-normal">—</span>
                              )}
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
                                    : 'bg-elevate text-muted border border-edge-strong'
                                }`}
                              >
                                Segmento {lead.segment}
                              </span>
                            </td>

                            <td class="p-4">
                              <select
                                value={lead.status}
                                onChange={(e) => handleStatusChange(lead.id, e.currentTarget.value)}
                                class="bg-app border border-edge rounded-xl px-2.5 py-1 text-xs text-body-soft focus:outline-none focus:border-accent cursor-pointer"
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
                              <Show
                                when={lead.metadata.estado_membresia}
                                fallback={<span class="text-muted text-xs">—</span>}
                              >
                                <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold inline-block bg-violet-500/20 text-violet-400 border border-violet-500/40">
                                  {lead.metadata.estado_membresia}
                                </span>
                              </Show>
                              <Show when={lead.metadata.cantidad_membresias !== undefined}>
                                <span class="block text-[10px] text-muted mt-1">
                                  Cantidad: {lead.metadata.cantidad_membresias}
                                </span>
                              </Show>
                            </td>

                            <td class="p-4">
                              <div class="space-y-1">
                                <p class="font-medium text-body-soft">
                                  {lead.metadata.producto || lead.metadata.objetivo || 'Fitness General'}
                                </p>
                                <Show when={lead.metadata.presupuesto}>
                                  <div class="flex items-center gap-1.5 text-[11px] text-muted">
                                    <span class="text-emerald-400 font-bold">
                                      ${lead.metadata.presupuesto} USD
                                    </span>
                                  </div>
                                </Show>
                              </div>
                            </td>

                            <td class="p-4 text-body-soft">
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
                                  class="px-3 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl font-semibold transition"
                                >
                                  Ficha
                                </A>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLead(lead.id, lead.full_name)}
                                  class="p-2 text-muted hover:text-red-400 rounded-xl hover:bg-red-950/40 transition cursor-pointer"
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
                    <div class="p-5 rounded-3xl bg-surface border border-edge hover:border-edge-strong transition space-y-4 shadow-xl flex flex-col justify-between">
                      <div class="space-y-3">
                        <div class="flex items-start justify-between gap-3">
                          <div class="flex items-center gap-3">
                            <div class="w-9 h-9 rounded-2xl bg-elevate border border-edge-strong flex items-center justify-center font-bold text-accent-text text-xs shrink-0">
                              {lead.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <A
                                href={`/leads/${lead.id}`}
                                class="font-bold text-body text-base hover:text-accent-text transition block truncate"
                              >
                                {lead.full_name}
                              </A>
                              <p class="text-xs text-muted">{lead.phone}</p>
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
                                : 'bg-elevate text-muted border border-edge-strong'
                            }`}
                          >
                            Seg {lead.segment}
                          </span>
                        </div>

                        <div class="p-3 rounded-2xl bg-app/70 border border-edge/80 space-y-1">
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-muted">Programa:</span>
                            <span class="font-semibold text-body-soft">
                              {lead.metadata.producto || 'Gimnasio'}
                            </span>
                          </div>
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-muted">Presupuesto:</span>
                            <span class="font-bold text-emerald-400">
                              ${lead.metadata.presupuesto || 0} USD
                            </span>
                          </div>
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-muted">Ciudad:</span>
                            <span class="text-body-soft">
                              {cityFromMetadata(lead.metadata) || 'Sin especificar'}
                            </span>
                          </div>
                          <div class="flex items-center justify-between text-xs">
                            <span class="text-muted">Membresía:</span>
                            <Show
                              when={lead.metadata.estado_membresia}
                              fallback={<span class="text-muted">Sin dato</span>}
                            >
                              <span class="px-2 py-0.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-400 text-[10px] font-bold">
                                {lead.metadata.estado_membresia}
                                <Show when={lead.metadata.cantidad_membresias !== undefined}>
                                  <span class="text-violet-400/80"> · {lead.metadata.cantidad_membresias}</span>
                                </Show>
                              </span>
                            </Show>
                          </div>
                        </div>

                        {/* Tags */}
                        <div class="flex flex-wrap gap-1.5">
                          <For each={lead.tags}>
                            {(t) => (
                              <span class="px-2 py-0.5 rounded-lg bg-elevate text-muted text-[10px] font-medium">
                                #{t}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>

                      <div class="pt-3 border-t border-edge flex items-center justify-between gap-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.currentTarget.value)}
                          class="bg-app border border-edge rounded-xl px-2.5 py-1 text-[11px] text-body-soft focus:outline-none focus:border-accent cursor-pointer"
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
                            class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-bold transition shadow-accent-glow"
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
