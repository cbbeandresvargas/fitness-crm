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

  const getConversionRate = () => {
    const total = data()?.totalLeads || 0;
    const won = data()?.statusCount.ganado || 0;
    if (total === 0) return 0;
    return Math.round((won / total) * 100);
  };

  return (
    <Layout title="Dashboard General">
      <div class="space-y-8 max-w-6xl mx-auto">
        {/* Banner de Bienvenida y Acción Rápida */}
        <div class="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
          <div class="space-y-1 relative z-10">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold mb-1 border border-orange-500/30">
              <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              <span>Hola, {user()?.name.split(' ')[0] || 'Coach'} • Panel de Rendimiento</span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">¿A quién vamos a inscribir hoy?</h2>
            <p class="text-zinc-400 text-xs sm:text-sm max-w-xl leading-relaxed">
              Monitoreo en tiempo real de tus prospectos de gimnasio, clasificación por potencial de compra y atención urgente.
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0 relative z-10">
            <button
              type="button"
              onClick={loadData}
              disabled={loading()}
              class="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl text-xs font-bold transition border border-zinc-700 cursor-pointer disabled:opacity-50"
              title="Refrescar métricas"
            >
              🔄
            </button>
            <A
              href="/leads/new"
              class="px-5 sm:px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-orange-glow transition transform hover:scale-105 flex items-center gap-2 cursor-pointer"
            >
              <span class="text-base">➕</span>
              <span>Anotar Prospecto</span>
            </A>
          </div>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-col items-center justify-center p-20 text-zinc-500 space-y-3">
              <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Cargando métricas en vivo...</span>
            </div>
          }
        >
          {/* Tarjetas de Métricas Clave */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Total */}
            <A
              href="/leads"
              class="p-5 sm:p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Prospectos</span>
                <span class="text-2xl group-hover:scale-110 transition-transform">👥</span>
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-white">{data()?.totalLeads || 0}</span>
                <span class="text-xs text-zinc-400">Cartera total</span>
              </div>
            </A>

            {/* Segmento A - VIP */}
            <A
              href="/leads?segment=A"
              class="p-5 sm:p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Segmento A (VIP)</span>
                <span class="text-2xl group-hover:scale-110 transition-transform">🔥</span>
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-emerald-400">
                  {data()?.segmentsCount.A || 0}
                </span>
                <span class="text-[11px] text-emerald-500/80 font-semibold">Alta Intención</span>
              </div>
            </A>

            {/* Segmento B - Tibio */}
            <A
              href="/leads?segment=B"
              class="p-5 sm:p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-blue-400">Segmento B (Tibio)</span>
                <span class="text-2xl group-hover:scale-110 transition-transform">⚡</span>
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-blue-400">
                  {data()?.segmentsCount.B || 0}
                </span>
                <span class="text-[11px] text-blue-400/80 font-semibold">Seguimiento Regular</span>
              </div>
            </A>

            {/* Segmento C - Atención */}
            <A
              href="/leads?segment=C"
              class="p-5 sm:p-6 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400">Segmento C (Atención)</span>
                <span class="text-2xl group-hover:scale-110 transition-transform">⏳</span>
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-amber-400">
                  {data()?.segmentsCount.C || 0}
                </span>
                <span class="text-[11px] text-amber-400/80 font-semibold">Reactivar &gt; 14d</span>
              </div>
            </A>
          </div>

          {/* Embudo de Ventas / Estados y Barra de Conversión */}
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-5 shadow-xl">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-extrabold text-white flex items-center gap-2">
                  <span>🎯</span>
                  <span>Embudo de Conversión Comercial</span>
                </h3>
                <p class="text-xs text-zinc-400 mt-0.5">Distribución de prospectos por fase en el ciclo de inscripción</p>
              </div>

              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                <span class="text-zinc-400 font-medium">Tasa de Conversión:</span>
                <span class="font-extrabold text-emerald-400">{getConversionRate()}%</span>
              </div>
            </div>

            {/* Tarjetas de Fases del Embudo */}
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { key: 'nuevo', label: 'Nuevo', icon: '🌱', color: 'text-zinc-300', border: 'hover:border-zinc-500' },
                { key: 'contactado', label: 'Contactado', icon: '💬', color: 'text-blue-400', border: 'hover:border-blue-500' },
                { key: 'cita_agendada', label: 'Cita Agendada', icon: '📅', color: 'text-amber-400', border: 'hover:border-amber-500' },
                { key: 'negociacion', label: 'Negociación', icon: '🤝', color: 'text-purple-400', border: 'hover:border-purple-500' },
                { key: 'ganado', label: 'Inscrito', icon: '🏆', color: 'text-emerald-400', border: 'hover:border-emerald-500' },
                { key: 'perdido', label: 'No Interesado', icon: '🛑', color: 'text-red-400', border: 'hover:border-red-500' },
              ].map((stage) => (
                <A
                  href={`/leads?status=${stage.key}`}
                  class={`p-4 rounded-2xl bg-zinc-800/40 border border-zinc-800/90 hover:bg-zinc-800/80 ${stage.border} transition text-center space-y-1 block`}
                >
                  <div class="text-xl">{stage.icon}</div>
                  <div class={`text-2xl font-black ${stage.color}`}>
                    {data()?.statusCount[stage.key] || 0}
                  </div>
                  <div class="text-[11px] font-bold text-zinc-400 truncate">{stage.label}</div>
                </A>
              ))}
            </div>
          </div>

          {/* Grid de 2 Columnas: Prospectos Urgentes y Bitácora */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Prospectos que requieren atención */}
            <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-lg">🚨</span>
                  <h3 class="text-base font-bold text-white">Requieren atención hoy</h3>
                </div>
                <A href="/leads?segment=C" class="text-xs text-orange-400 hover:underline font-semibold">
                  Ver todos los inactivos
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
                        <div class="space-y-1 overflow-hidden min-w-0">
                          <div class="flex items-center gap-2">
                            <A
                              href={`/leads/${lead.id}`}
                              class="font-bold text-white hover:text-orange-400 text-sm truncate"
                            >
                              {lead.full_name}
                            </A>
                            <span
                              class={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
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
            <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
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
                        <div class="flex-1 overflow-hidden min-w-0">
                          <p class="text-xs text-zinc-200 line-clamp-2">{act.details}</p>
                          <div class="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                            <span class="font-semibold text-zinc-300">{act.user_name || 'Sistema'}</span>
                            <span>•</span>
                            <A href={`/leads/${act.lead_id}`} class="text-orange-400/80 hover:underline truncate">
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
