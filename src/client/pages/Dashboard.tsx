import { createSignal, onMount, Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { DashboardData } from '../types';
import { SegmentBadge } from '../components/SegmentBadge';
import {
  RefreshCw,
  Plus,
  Users,
  Flame,
  Target,
  Clock,
  Layers,
  UserPlus,
  MessageCircle,
  Handshake,
  Award,
  CircleX,
  TriangleAlert,
  CircleCheck,
  MessageSquare,
  Zap,
  Sparkles,
  FileText,
} from 'lucide-solid';

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
        <div class="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-surface via-surface to-elevate border border-edge flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
          <div class="space-y-1 relative z-10">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent-text text-xs font-bold mb-1 border border-accent/30">
              <span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              <span>Hola, {user()?.name.split(' ')[0] || 'Coach'} • Panel de Rendimiento</span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-body tracking-tight">¿A quién vamos a inscribir hoy?</h2>
            <p class="text-muted text-xs sm:text-sm max-w-xl leading-relaxed">
              Monitoreo en tiempo real de tus prospectos de gimnasio, clasificación por potencial de compra y atención urgente.
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0 relative z-10">
            <button
              type="button"
              onClick={loadData}
              disabled={loading()}
              class="p-3 bg-elevate hover:bg-elevate-strong text-body-soft rounded-2xl text-xs font-bold transition border border-edge-strong cursor-pointer disabled:opacity-50 flex items-center justify-center"
              title="Refrescar métricas"
            >
              <RefreshCw class="w-4 h-4" />
            </button>
            <A
              href="/leads/new"
              class="px-5 sm:px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-2xl text-xs sm:text-sm font-bold shadow-accent-glow transition transform hover:scale-105 flex items-center gap-2 cursor-pointer"
            >
              <Plus class="w-4 h-4" />
              <span>Anotar Prospecto</span>
            </A>
          </div>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-col items-center justify-center p-20 text-muted space-y-3">
              <div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Cargando métricas en vivo...</span>
            </div>
          }
        >
          {/* Tarjetas de Métricas Clave */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Total */}
            <A
              href="/leads"
              class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge hover:border-accent/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-muted">Total Prospectos</span>
                <Users class="w-6 h-6 text-accent group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-body">{data()?.totalLeads || 0}</span>
                <span class="text-xs text-muted">Cartera total</span>
              </div>
            </A>

            {/* Segmento A — Antiguos pagadores */}
            <A
              href="/leads?segment=A"
              class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge hover:border-accent/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-accent-text">A · Antiguos pagadores</span>
                <Flame class="w-6 h-6 text-accent-text group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-accent-text">
                  {data()?.segmentsCount.A || 0}
                </span>
                <span class="text-[11px] text-accent-text/80 font-semibold">Ya compraron ≥ 1 membresía</span>
              </div>
            </A>

            {/* Segmento B — Registrados que nunca pagaron */}
            <A
              href="/leads?segment=B"
              class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge hover:border-orange-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-orange-400">B · Registrados que nunca pagaron</span>
                <Target class="w-6 h-6 text-orange-400 group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-orange-400">
                  {data()?.segmentsCount.B || 0}
                </span>
                <span class="text-[11px] text-orange-400/80 font-semibold">Registrados en FC, sin compras</span>
              </div>
            </A>

            {/* Segmento C — Usuarios con actividad/interés reciente */}
            <A
              href="/leads?segment=C"
              class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge hover:border-amber-500/50 transition group shadow-lg"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-amber-400">C · Usuarios con interés reciente</span>
                <Clock class="w-6 h-6 text-amber-400 group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-4 flex items-baseline justify-between">
                <span class="text-4xl font-black text-amber-400">
                  {data()?.segmentsCount.C || 0}
                </span>
                <span class="text-[11px] text-amber-400/80 font-semibold">Actividad en los últimos 30 días</span>
              </div>
            </A>
          </div>

          {/* Embudo de Ventas / Estados y Barra de Conversión */}
          <div class="p-6 rounded-3xl bg-surface border border-edge space-y-5 shadow-xl">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-extrabold text-body flex items-center gap-2">
                  <Layers class="w-4 h-4 text-accent" />
                  <span>Embudo de Conversión Comercial</span>
                </h3>
                <p class="text-xs text-muted mt-0.5">Distribución de prospectos por fase en el ciclo de inscripción</p>
              </div>

              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-app border border-edge text-xs">
                <span class="text-muted font-medium">Tasa de Conversión:</span>
                <span class="font-extrabold text-emerald-400">{getConversionRate()}%</span>
              </div>
            </div>

            {/* Tarjetas de Fases del Embudo */}
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { key: 'nuevo', label: 'Nuevo', Icon: UserPlus, color: 'text-body-soft', border: 'hover:border-edge-strong' },
                { key: 'contactado', label: 'Contactado', Icon: MessageCircle, color: 'text-blue-400', border: 'hover:border-blue-500' },
                { key: 'negociacion', label: 'Negociación', Icon: Handshake, color: 'text-purple-400', border: 'hover:border-purple-500' },
                { key: 'ganado', label: 'Inscrito', Icon: Award, color: 'text-emerald-400', border: 'hover:border-emerald-500' },
                { key: 'perdido', label: 'No Interesado', Icon: CircleX, color: 'text-red-400', border: 'hover:border-red-500' },
              ].map((stage) => (
                <A
                  href={`/leads?status=${stage.key}`}
                  class={`p-4 rounded-2xl bg-elevate/40 border border-edge/90 hover:bg-elevate/80 ${stage.border} transition text-center space-y-1 block`}
                >
                  <div class="flex justify-center pb-1">
                    <stage.Icon class={`w-5 h-5 ${stage.color}`} />
                  </div>
                  <div class={`text-2xl font-black ${stage.color}`}>
                    {data()?.statusCount[stage.key] || 0}
                  </div>
                  <div class="text-[11px] font-bold text-muted truncate">{stage.label}</div>
                </A>
              ))}
            </div>
          </div>

          {/* Grid de 2 Columnas: Prospectos Urgentes y Bitácora */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Prospectos que requieren atención */}
            <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <TriangleAlert class="w-4 h-4 text-amber-400" />
                  <h3 class="text-base font-bold text-body">Requieren atención hoy</h3>
                </div>
                <A href="/leads?segment=C" class="text-xs text-accent-text hover:underline font-semibold">
                  Ver todos
                </A>
              </div>

              <div class="space-y-3">
                <Show
                  when={(data()?.leadsNeedingAttention || []).length > 0}
                  fallback={
                    <div class="p-8 text-center text-muted text-xs">
                      <p class="flex items-center justify-center gap-2">
                        <CircleCheck class="w-4 h-4 text-emerald-400" />
                        <span>¡Todo al día! No hay prospectos descuidados o fríos.</span>
                      </p>
                    </div>
                  }
                >
                  <For each={data()?.leadsNeedingAttention}>
                    {(lead) => (
                      <div class="p-4 rounded-2xl bg-elevate/50 border border-edge/80 flex items-center justify-between gap-4 hover:border-edge-strong transition">
                        <div class="space-y-1 overflow-hidden min-w-0">
                          <div class="flex items-center gap-2">
                            <A
                              href={`/leads/${lead.id}`}
                              class="font-bold text-body hover:text-accent-text text-sm truncate"
                            >
                              {lead.full_name}
                            </A>
                            <SegmentBadge segment={lead.segment} />
                          </div>
                          <p class="text-xs text-muted truncate">
                            {lead.notes_summary || lead.metadata.objetivo || 'Sin notas registradas'}
                          </p>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                          <a
                            href={`https://wa.me/${lead.phone.replace(/^\+/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="p-2.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-xl transition flex items-center justify-center"
                            title="Abrir WhatsApp directo"
                          >
                            <MessageSquare class="w-4 h-4" />
                          </a>
                          <A
                            href={`/leads/${lead.id}`}
                            class="px-3 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-semibold rounded-xl transition"
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
            <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Zap class="w-4 h-4 text-accent" />
                  <h3 class="text-base font-bold text-body">Últimos movimientos del equipo</h3>
                </div>
              </div>

              <div class="space-y-3">
                <Show
                  when={(data()?.recentActivities || []).length > 0}
                  fallback={
                    <div class="p-8 text-center text-muted text-xs">
                      No hay actividades registradas aún.
                    </div>
                  }
                >
                  <For each={data()?.recentActivities}>
                    {(act) => (
                      <div class="p-3.5 rounded-2xl bg-elevate/30 border border-edge/60 flex items-start gap-3">
                        <div class="w-8 h-8 rounded-xl bg-accent/10 text-accent-text flex items-center justify-center shrink-0 text-sm mt-0.5">
                          {act.action_type === 'whatsapp_sent' ? (
                            <MessageSquare class="w-4 h-4 text-emerald-400" />
                          ) : act.action_type === 'status_change' ? (
                            <RefreshCw class="w-4 h-4 text-blue-400" />
                          ) : act.action_type === 'ai_generated' ? (
                            <Sparkles class="w-4 h-4 text-amber-400" />
                          ) : (
                            <FileText class="w-4 h-4 text-muted" />
                          )}
                        </div>
                        <div class="flex-1 overflow-hidden min-w-0">
                          <p class="text-xs text-body-soft line-clamp-2">{act.details}</p>
                          <div class="flex items-center gap-2 text-[10px] text-muted mt-1">
                            <span class="font-semibold text-body-soft">{act.user_name || 'Sistema'}</span>
                            <span>•</span>
                            <A href={`/leads/${act.lead_id}`} class="text-accent-text/80 hover:underline truncate">
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
