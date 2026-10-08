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
      <div class="space-y-5 max-w-6xl mx-auto">
        {/* Cabecera Compacta y Acciones Rápidas */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg sm:text-xl font-bold text-body tracking-tight">
                Hola, {user()?.name.split(' ')[0] || 'Coach'}
              </h2>
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>En vivo</span>
              </span>
            </div>
            <p class="text-xs text-muted mt-0.5">
              Resumen comercial, pipeline activo y prospectos prioritarios
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading()}
              class="min-h-[44px] min-w-[44px] p-2 bg-surface hover:bg-elevate text-body-soft rounded-lg text-xs font-medium transition border border-edge cursor-pointer disabled:opacity-50 flex items-center justify-center"
              title="Refrescar métricas"
              aria-label="Refrescar métricas"
            >
              <RefreshCw class="w-4 h-4" />
            </button>
            <A
              href="/leads/new"
              class="inline-flex items-center justify-center min-h-[44px] gap-1.5 px-3.5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              <Plus class="w-4 h-4" />
              <span>Nuevo Prospecto</span>
            </A>
          </div>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div class="flex flex-col items-center justify-center p-16 text-muted space-y-2.5">
              <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs">Cargando métricas...</span>
            </div>
          }
        >
          {/* Tarjetas de Métricas Clave */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total */}
            <A
              href="/leads"
              class="p-4 rounded-xl bg-surface border border-edge hover:border-edge-strong transition group shadow-xs block"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium uppercase tracking-wider text-muted">Total Prospectos</span>
                <Users class="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
              </div>
              <div class="mt-2 flex items-baseline justify-between">
                <span class="text-2xl sm:text-3xl font-bold text-body">{data()?.totalLeads || 0}</span>
                <span class="text-[11px] text-muted">Cartera total</span>
              </div>
            </A>

            {/* Segmento A — Antiguos pagadores */}
            <A
              href="/leads?segment=A"
              class="p-4 rounded-xl bg-surface border border-edge hover:border-edge-strong transition group shadow-xs block"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium uppercase tracking-wider text-accent-text">A · Antiguos pagadores</span>
                <Flame class="w-4 h-4 text-accent-text group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-2 flex items-baseline justify-between">
                <span class="text-2xl sm:text-3xl font-bold text-accent-text">
                  {data()?.segmentsCount.A || 0}
                </span>
                <span class="text-[11px] text-muted">≥ 1 membresía</span>
              </div>
            </A>

            {/* Segmento B — Registrados que nunca pagaron */}
            <A
              href="/leads?segment=B"
              class="p-4 rounded-xl bg-surface border border-edge hover:border-edge-strong transition group shadow-xs block"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium uppercase tracking-wider text-orange-700 dark:text-orange-400">B · Registrados sin compra</span>
                <Target class="w-4 h-4 text-orange-700 dark:text-orange-400 group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-2 flex items-baseline justify-between">
                <span class="text-2xl sm:text-3xl font-bold text-orange-700 dark:text-orange-400">
                  {data()?.segmentsCount.B || 0}
                </span>
                <span class="text-[11px] text-muted">En FC, sin compras</span>
              </div>
            </A>

            {/* Segmento C — Usuarios con actividad/interés reciente */}
            <A
              href="/leads?segment=C"
              class="p-4 rounded-xl bg-surface border border-edge hover:border-edge-strong transition group shadow-xs block"
            >
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-medium uppercase tracking-wider text-amber-800 dark:text-amber-400">C · Actividad reciente</span>
                <Clock class="w-4 h-4 text-amber-800 dark:text-amber-400 group-hover:scale-110 transition-transform" />
              </div>
              <div class="mt-2 flex items-baseline justify-between">
                <span class="text-2xl sm:text-3xl font-bold text-amber-800 dark:text-amber-400">
                  {data()?.segmentsCount.C || 0}
                </span>
                <span class="text-[11px] text-muted">Últimos 30 días</span>
              </div>
            </A>
          </div>

          {/* Embudo de Ventas / Estados y Barra de Conversión */}
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5 shadow-xs">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 class="text-sm font-semibold text-body flex items-center gap-1.5">
                  <Layers class="w-3.5 h-3.5 text-accent" />
                  <span>Embudo de Conversión Comercial</span>
                </h3>
                <p class="text-[11px] text-muted mt-0.5">Distribución de prospectos por fase en el ciclo de ventas</p>
              </div>

              <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-app border border-edge text-xs">
                <span class="text-muted text-[11px]">Conversión:</span>
                <span class="font-bold text-emerald-700 dark:text-emerald-400">{getConversionRate()}%</span>
              </div>
            </div>

            {/* Fases del Embudo */}
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {[
                { key: 'nuevo', label: 'Nuevo', Icon: UserPlus, color: 'text-body-soft' },
                { key: 'contactado', label: 'Contactado', Icon: MessageCircle, color: 'text-blue-500 dark:text-blue-400' },
                { key: 'negociacion', label: 'Negociación', Icon: Handshake, color: 'text-purple-600 dark:text-purple-400' },
                { key: 'ganado', label: 'Inscrito', Icon: Award, color: 'text-emerald-700 dark:text-emerald-400' },
                { key: 'perdido', label: 'No Interesado', Icon: CircleX, color: 'text-red-600 dark:text-red-400' },
              ].map((stage) => (
                <A
                  href={`/leads?status=${stage.key}`}
                  class="p-3 rounded-lg bg-elevate/40 border border-edge hover:bg-elevate/70 transition text-center space-y-0.5 block"
                >
                  <div class="flex justify-center pb-0.5">
                    <stage.Icon class={`w-4 h-4 ${stage.color}`} />
                  </div>
                  <div class={`text-xl font-bold ${stage.color}`}>
                    {data()?.statusCount[stage.key] || 0}
                  </div>
                  <div class="text-[10px] font-medium text-muted truncate">{stage.label}</div>
                </A>
              ))}
            </div>
          </div>

          {/* Grid de 2 Columnas: Prospectos Urgentes y Bitácora */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Prospectos que requieren atención */}
            <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 shadow-xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <TriangleAlert class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <h3 class="text-sm font-semibold text-body">Requieren atención hoy</h3>
                </div>
                <A href="/leads?segment=C" class="text-xs text-accent-text hover:underline font-medium">
                  Ver todos
                </A>
              </div>

              <div class="space-y-2">
                <Show
                  when={(data()?.leadsNeedingAttention || []).length > 0}
                  fallback={
                    <div class="p-6 text-center text-muted text-xs">
                      <p class="flex items-center justify-center gap-1.5">
                        <CircleCheck class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Todo al día. No hay prospectos fríos.</span>
                      </p>
                    </div>
                  }
                >
                  <For each={data()?.leadsNeedingAttention}>
                    {(lead) => (
                      <div class="p-3 rounded-lg bg-elevate/40 border border-edge flex items-center justify-between gap-3 hover:border-edge-strong transition">
                        <div class="space-y-0.5 overflow-hidden min-w-0">
                          <div class="flex items-center gap-2">
                            <A
                              href={`/leads/${lead.id}`}
                              class="font-semibold text-body hover:text-accent-text text-xs truncate"
                            >
                              {lead.full_name}
                            </A>
                            <SegmentBadge segment={lead.segment} />
                          </div>
                          <p class="text-[11px] text-muted truncate">
                            {lead.notes_summary || lead.metadata.objetivo || 'Sin notas registradas'}
                          </p>
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0">
                          <A
                            href={`/inbox?leadId=${lead.id}`}
                            class="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-md transition flex items-center justify-center border border-emerald-500/20"
                            title="Abrir chat en WhatsApp Inbox"
                          >
                            <MessageSquare class="w-3.5 h-3.5" />
                          </A>
                          <A
                            href={`/leads/${lead.id}`}
                            class="px-2.5 py-1 bg-surface hover:bg-elevate text-body-soft text-xs font-medium rounded-md border border-edge transition"
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
            <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 shadow-xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <Zap class="w-3.5 h-3.5 text-accent" />
                  <h3 class="text-sm font-semibold text-body">Últimos movimientos del equipo</h3>
                </div>
              </div>

              <div class="space-y-2">
                <Show
                  when={(data()?.recentActivities || []).length > 0}
                  fallback={
                    <div class="p-6 text-center text-muted text-xs">
                      No hay actividades registradas aún.
                    </div>
                  }
                >
                  <For each={data()?.recentActivities}>
                    {(act) => (
                      <div class="p-2.5 rounded-lg bg-elevate/30 border border-edge flex items-start gap-2.5">
                        <div class="w-6 h-6 rounded-md bg-accent/10 text-accent-text flex items-center justify-center shrink-0 text-xs mt-0.5">
                          {act.action_type === 'whatsapp_sent' ? (
                            <MessageSquare class="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          ) : act.action_type === 'status_change' ? (
                            <RefreshCw class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          ) : act.action_type === 'ai_generated' ? (
                            <Sparkles class="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                          ) : (
                            <FileText class="w-3.5 h-3.5 text-muted" />
                          )}
                        </div>
                        <div class="flex-1 overflow-hidden min-w-0">
                          <p class="text-xs text-body-soft line-clamp-1">{act.details}</p>
                          <div class="flex items-center gap-1.5 text-[10px] text-muted mt-0.5">
                            <span class="font-medium text-body-soft">{act.user_name || 'Sistema'}</span>
                            <span>•</span>
                            <A href={`/leads/${act.lead_id}`} class="text-accent-text hover:underline truncate">
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
