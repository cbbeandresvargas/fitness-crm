import { createSignal, onMount, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { DashboardData } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = createSignal<DashboardData | null>(null);
  const [loading, setLoading] = createSignal(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    loadData();
  });

  return (
    <Layout title="Dashboard General">
      <div class="space-y-8 max-w-6xl mx-auto">
        {/* Banner de Bienvenida y Acción Rápida */}
        <div class="p-8 rounded-3xl bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-xl">
          <div class="space-y-1 relative z-10">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold mb-2">
              <span>👋 Hola, {user()?.name.split(' ')[0] || 'Coach'}</span>
            </div>
            <h2 class="text-3xl font-extrabold text-white">¿A quién vamos a inscribir hoy?</h2>
            <p class="text-zinc-400 text-sm max-w-xl">
              Resumen en tiempo real de tus prospectos de gimnasio, organizados por potencial de compra y necesidad de seguimiento.
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0 relative z-10">
            <A
              href="/leads/new"
              class="px-6 py-3.5 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-sm font-bold shadow-orange-glow transition transform hover:scale-105 flex items-center gap-2"
            >
              <span class="text-lg">➕</span>
              <span>Anotar Prospecto</span>
            </A>
          </div>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="flex items-center justify-center p-20 text-zinc-500">
              <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          }
        >
          {/* Tarjetas de Métricas Clave */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total */}
            <A
              href="/leads"
              class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 transition group"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">Total Personas</span>
                <span class="text-2xl">👥</span>
              </div>
              <div class="mt-4">
                <span class="text-4xl font-extrabold text-white">{data()?.totalLeads || 0}</span>
                <p class="text-xs text-zinc-400 mt-1">Interesados registrados</p>
              </div>
            </A>

            {/* Segmento A - VIP */}
            <A
              href="/leads?segment=A"
              class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition group"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">Segmento A (VIP)</span>
                <span class="text-2xl">🔥</span>
              </div>
              <div class="mt-4">
                <span class="text-4xl font-extrabold text-emerald-400">
                  {data()?.segmentsCount.A || 0}
                </span>
                <p class="text-xs text-zinc-400 mt-1">Cierre casi seguro / Alto valor</p>
              </div>
            </A>

            {/* Segmento B - Tibio */}
            <A
              href="/leads?segment=B"
              class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 transition group"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-blue-400">Segmento B (Tibio)</span>
                <span class="text-2xl">⚡</span>
              </div>
              <div class="mt-4">
                <span class="text-4xl font-extrabold text-blue-400">
                  {data()?.segmentsCount.B || 0}
                </span>
                <p class="text-xs text-zinc-400 mt-1">En seguimiento regular</p>
              </div>
            </A>

            {/* Segmento C - Atención */}
            <A
              href="/leads?segment=C"
              class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 transition group"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-amber-400">Segmento C (Atención)</span>
                <span class="text-2xl">⏳</span>
              </div>
              <div class="mt-4">
                <span class="text-4xl font-extrabold text-amber-400">
                  {data()?.segmentsCount.C || 0}
                </span>
                <p class="text-xs text-zinc-400 mt-1">Enfriándose / Reactivar</p>
              </div>
            </A>
          </div>

          {/* Embudo de Ventas / Estados */}
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <span>🎯</span>
                <span>Embudo de Conversión Comercial</span>
              </h3>
              <span class="text-xs text-zinc-400">Progreso en el gimnasio</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { key: 'nuevo', label: 'Nuevo', icon: '🌱', color: 'text-zinc-300' },
                { key: 'contactado', label: 'Contactado', icon: '💬', color: 'text-blue-400' },
                { key: 'cita_agendada', label: 'Cita Agendada', icon: '📅', color: 'text-amber-400' },
                { key: 'negociacion', label: 'Negociación', icon: '🤝', color: 'text-purple-400' },
                { key: 'ganado', label: 'Inscrito / Ganado', icon: '🏆', color: 'text-emerald-400' },
                { key: 'perdido', label: 'No Interesado', icon: '🛑', color: 'text-red-400' },
              ].map((stage) => (
                <A
                  href={`/leads?status=${stage.key}`}
                  class="p-4 rounded-2xl bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 transition text-center space-y-1 block"
                >
                  <div class="text-xl">{stage.icon}</div>
                  <div class={`text-2xl font-black ${stage.color}`}>
                    {data()?.statusCount[stage.key] || 0}
                  </div>
                  <div class="text-[11px] font-semibold text-zinc-400 truncate">{stage.label}</div>
                </A>
              ))}
            </div>
          </div>

          {/* Grid de 2 Columnas: Prospectos Urgentes y Bitácora */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Prospectos que requieren atención */}
            <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-lg">🚨</span>
                  <h3 class="text-base font-bold text-white">Requieren tu atención hoy</h3>
                </div>
                <A href="/leads?segment=C" class="text-xs text-orange-400 hover:underline font-semibold">
                  Ver todos
                </A>
              </div>

              <div class="space-y-3">
                <Show
                  when={(data()?.leadsNeedingAttention || []).length > 0}
                  fallback={
                    <div class="p-8 text-center text-zinc-500 text-xs">
                      🎉 ¡Todo al día! No hay prospectos descuidados o fríos.
                    </div>
                  }
                >
                  <For each={data()?.leadsNeedingAttention}>
                    {(lead) => (
                      <div class="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-800/80 flex items-center justify-between gap-4 hover:border-zinc-700 transition">
                        <div class="space-y-1 overflow-hidden">
                          <div class="flex items-center gap-2">
                            <A
                              href={`/leads/${lead.id}`}
                              class="font-bold text-white hover:text-orange-400 text-sm truncate"
                            >
                              {lead.full_name}
                            </A>
                            <span
                              class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                lead.segment === 'A'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : lead.segment === 'B'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : lead.segment === 'C'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              Seg {lead.segment}
                            </span>
                          </div>
                          <p class="text-xs text-zinc-400 truncate">
                            {lead.notes_summary || lead.metadata.objetivo || 'Sin notas registradas'}
                          </p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                          <a
                            href={`https://wa.me/${lead.phone.replace(/^\+/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="p-2.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-xl transition"
                            title="Abrir WhatsApp directo"
                          >
                            💬
                          </a>
                          <A
                            href={`/leads/${lead.id}`}
                            class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition"
                          >
                            Ver
                          </A>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>

            {/* Actividad Reciente */}
            <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-lg">⚡</span>
                  <h3 class="text-base font-bold text-white">Últimos movimientos del equipo</h3>
                </div>
              </div>

              <div class="space-y-3">
                <Show
                  when={(data()?.recentActivities || []).length > 0}
                  fallback={
                    <div class="p-8 text-center text-zinc-500 text-xs">
                      No hay actividades registradas aún.
                    </div>
                  }
                >
                  <For each={data()?.recentActivities}>
                    {(act) => (
                      <div class="p-3.5 rounded-2xl bg-zinc-800/30 border border-zinc-800/60 flex items-start gap-3">
                        <div class="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0 text-sm mt-0.5">
                          {act.action_type === 'whatsapp_sent'
                            ? '💬'
                            : act.action_type === 'status_change'
                            ? '🔄'
                            : act.action_type === 'ai_generated'
                            ? '✨'
                            : '📝'}
                        </div>
                        <div class="flex-1 overflow-hidden">
                          <p class="text-xs text-zinc-200 line-clamp-2">{act.details}</p>
                          <div class="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                            <span class="font-semibold text-zinc-300">{act.user_name || 'Sistema'}</span>
                            <span>•</span>
                            <A href={`/leads/${act.lead_id}`} class="text-orange-400/80 hover:underline">
                              {act.lead_name || 'Prospecto'}
                            </A>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Layout>
  );
}
