import { html } from 'hono/html';
import { Lead, ActivityLog, SessionData } from '../lib/types';

interface DashboardProps {
  user: SessionData;
  totalLeads: number;
  segmentsCount: { A: number; B: number; C: number; D: number };
  statusCount: Record<string, number>;
  recentActivities: (ActivityLog & { lead_name?: string })[];
  leadsNeedingAttention: Lead[];
}

export function DashboardView({
  user,
  totalLeads,
  segmentsCount,
  statusCount,
  recentActivities,
  leadsNeedingAttention,
}: DashboardProps) {
  const percentA = totalLeads ? Math.round((segmentsCount.A / totalLeads) * 100) : 0;
  const percentB = totalLeads ? Math.round((segmentsCount.B / totalLeads) * 100) : 0;
  const percentC = totalLeads ? Math.round((segmentsCount.C / totalLeads) * 100) : 0;
  const percentD = totalLeads ? Math.round((segmentsCount.D / totalLeads) * 100) : 0;

  return html`
    <div class="space-y-6">
      
      <!-- Welcome Banner -->
      <div class="p-6 rounded-2xl bg-gradient-to-r from-brand-surface via-brand-card to-brand-surface border border-brand-border relative overflow-hidden">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-brand-orange/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-orange-subtle border border-brand-orange/30 text-brand-orange text-xs font-bold mb-2">
              <span>⚡ Panel de Rendimiento Fitness</span>
            </div>
            <h2 class="text-2xl font-black text-white">Hola, ${user.name} 👋</h2>
            <p class="text-sm text-zinc-400 mt-1">
              ${user.role === 'admin'
                ? 'Monitoreo global de prospectos, asignación de agentes y métricas de conversión en tiempo real.'
                : 'Tienes leads asignados activos en tu pipeline. Revisa las citas pendientes y mensajes de hoy.'}
            </p>
          </div>
          
          <div class="flex items-center gap-3">
            <a href="/leads/new" class="px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold rounded-xl transition shadow-orange-sm flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Agregar Prospecto
            </a>
            <a href="/import-export" class="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl border border-brand-border transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Importar CSV
            </a>
          </div>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1 -->
        <div class="p-5 rounded-2xl bg-brand-surface border border-brand-border hover:border-brand-orange/50 transition group">
          <div class="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Leads</span>
            <div class="w-8 h-8 rounded-lg bg-brand-orange/10 text-brand-orange flex items-center justify-center font-bold">
              👥
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-white">${totalLeads}</span>
            <span class="text-xs text-emerald-400 font-semibold">100% en D1</span>
          </div>
          <div class="mt-2 text-xs text-zinc-400">
            ${user.role === 'admin' ? 'Todos los prospectos del gimnasio' : 'Leads asignados a tu cartera'}
          </div>
        </div>

        <!-- Card 2: Segmento A -->
        <div class="p-5 rounded-2xl bg-brand-surface border border-brand-border hover:border-emerald-500/50 transition group">
          <div class="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Segmento A (VIP/Caliente)</span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/80 text-[10px] font-bold">ALTA INTENCIÓN</span>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-emerald-400">${segmentsCount.A}</span>
            <span class="text-xs text-zinc-400 font-medium">(${percentA}%)</span>
          </div>
          <div class="mt-2 text-xs text-zinc-400">
            Citas agendadas o alto presupuesto
          </div>
        </div>

        <!-- Card 3: Citas Agendadas -->
        <div class="p-5 rounded-2xl bg-brand-surface border border-brand-border hover:border-brand-orange/50 transition group">
          <div class="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Citas Agendadas</span>
            <div class="w-8 h-8 rounded-lg bg-brand-orange/10 text-brand-orange flex items-center justify-center font-bold">
              🗓️
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-white">${statusCount['cita_agendada'] || 0}</span>
            <span class="text-xs text-brand-orange font-semibold">Prioridad hoy</span>
          </div>
          <div class="mt-2 text-xs text-zinc-400">
            Evaluaciones y clases de prueba
          </div>
        </div>

        <!-- Card 4: Clientes Ganados -->
        <div class="p-5 rounded-2xl bg-brand-surface border border-brand-border hover:border-purple-500/50 transition group">
          <div class="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            <span>Membresías Cerradas</span>
            <div class="w-8 h-8 rounded-lg bg-purple-950/60 text-purple-400 flex items-center justify-center font-bold">
              🏆
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-white">${statusCount['ganado'] || 0}</span>
            <span class="text-xs text-purple-400 font-semibold">Ganados</span>
          </div>
          <div class="mt-2 text-xs text-zinc-400">
            Inscritos y membresías activas
          </div>
        </div>
      </div>

      <!-- Segment Matrix & Inactive Alert -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <!-- Segment Breakdown (Left 2 cols) -->
        <div class="lg:col-span-2 p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <span>🎯 Matriz de Segmentación Dinámica</span>
              </h3>
              <p class="text-xs text-zinc-400 mt-0.5">Clasificación automática en tiempo real basada en reglas de actividad y valor comercial</p>
            </div>
            <a href="/leads" class="text-xs text-brand-orange hover:underline font-semibold">Ver pipeline completo →</a>
          </div>

          <div class="space-y-4 pt-2">
            <!-- Segmento A -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Segmento A — VIP / Alta Intención (${segmentsCount.A})
                </span>
                <span class="text-zinc-400 font-semibold">${percentA}%</span>
              </div>
              <div class="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full transition-all duration-500" style="width: ${percentA}%"></div>
              </div>
            </div>

            <!-- Segmento B -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-blue-400 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  Segmento B — Seguimiento Regular Activo (${segmentsCount.B})
                </span>
                <span class="text-zinc-400 font-semibold">${percentB}%</span>
              </div>
              <div class="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full transition-all duration-500" style="width: ${percentB}%"></div>
              </div>
            </div>

            <!-- Segmento C -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-amber-400 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Segmento C — Frío / Inactividad > 14 días (${segmentsCount.C})
                </span>
                <span class="text-zinc-400 font-semibold">${percentC}%</span>
              </div>
              <div class="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-amber-500 rounded-full transition-all duration-500" style="width: ${percentC}%"></div>
              </div>
            </div>

            <!-- Segmento D -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-zinc-400 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
                  Segmento D — Descartado / Inactivo > 30 días (${segmentsCount.D})
                </span>
                <span class="text-zinc-400 font-semibold">${percentD}%</span>
              </div>
              <div class="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-zinc-600 rounded-full transition-all duration-500" style="width: ${percentD}%"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Attention / Quick WhatsApp Reactivation (Right 1 col) -->
        <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>⏱️ Requieren Atención Inmediata</span>
              </h3>
              <span class="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 text-[10px] font-bold border border-amber-800">
                ${leadsNeedingAttention.length}
              </span>
            </div>
            <p class="text-xs text-zinc-400 mt-1">Prospectos en Segmento C o sin contacto reciente</p>

            <div class="mt-3 divide-y divide-zinc-800/80">
              ${leadsNeedingAttention.length === 0 ? html`
                <div class="py-6 text-center text-xs text-zinc-500">
                  🎉 ¡Excelente! No tienes prospectos fríos abandonados.
                </div>
              ` : leadsNeedingAttention.slice(0, 3).map((lead) => html`
                <div class="py-2.5 flex items-center justify-between gap-2">
                  <div class="overflow-hidden">
                    <p class="text-xs font-semibold text-white truncate">${lead.full_name}</p>
                    <p class="text-[11px] text-zinc-400 truncate">${lead.phone}</p>
                  </div>
                  <a href="/leads/${lead.id}" class="px-2.5 py-1 bg-brand-orange-subtle hover:bg-brand-orange/20 text-brand-orange rounded-lg text-[11px] font-bold border border-brand-orange/30 shrink-0 transition flex items-center gap-1">
                    <span>💬 Contactar</span>
                  </a>
                </div>
              `)}
            </div>
          </div>

          <a href="/leads?segment=C" class="mt-4 w-full py-2 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold text-center rounded-xl border border-brand-border transition block">
            Ver todos los prospectos en reactivación
          </a>
        </div>

      </div>

      <!-- Recent Activity Feed (Bitácora) -->
      <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>📋 Bitácora de Actividades Recientes</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">Registro cronológico de cambios de estado, notas, reasignaciones y mensajes de WhatsApp</p>
          </div>
          <span class="text-xs text-zinc-400">Actualizado en vivo</span>
        </div>

        <div class="divide-y divide-brand-border">
          ${recentActivities.length === 0 ? html`
            <div class="py-8 text-center text-sm text-zinc-500">
              Aún no hay actividades registradas en la bitácora.
            </div>
          ` : recentActivities.slice(0, 6).map((act) => {
            const actionBadgeColor = 
              act.action_type === 'whatsapp_sent' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
              act.action_type === 'status_change' ? 'bg-blue-950 text-blue-400 border-blue-800' :
              act.action_type === 'segment_change' ? 'bg-purple-950 text-purple-400 border-purple-800' :
              act.action_type === 'ai_generated' ? 'bg-brand-orange-subtle text-brand-orange border-brand-orange/40' :
              'bg-zinc-800 text-zinc-300 border-zinc-700';

            return html`
              <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div class="flex items-start sm:items-center gap-3">
                  <span class="px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0 ${actionBadgeColor}">
                    ${act.action_type.replace('_', ' ')}
                  </span>
                  <div>
                    <span class="font-bold text-white">${act.lead_name || 'Prospecto'}:</span>
                    <span class="text-zinc-300 ml-1">${act.details}</span>
                  </div>
                </div>
                <div class="text-[11px] text-zinc-400 shrink-0">
                  ${act.created_at}
                </div>
              </div>
            `;
          })}
        </div>
      </div>

    </div>
  `;
}
