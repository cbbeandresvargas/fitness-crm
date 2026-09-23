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
  return html`
    <div class="space-y-8 max-w-6xl mx-auto">
      
      <!-- Saludo amigable y directo -->
      <div class="p-8 rounded-3xl bg-gradient-to-r from-brand-surface to-brand-card border border-brand-border flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div class="space-y-1 relative z-10">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange/20 text-brand-orange text-xs font-bold mb-2">
            <span>👋 Hola, ${user.name.split(' ')[0]}</span>
          </div>
          <h2 class="text-3xl font-extrabold text-white">¿A quién vamos a inscribir hoy?</h2>
          <p class="text-zinc-400 text-sm max-w-xl">
            Aquí tienes el resumen fácil de tus prospectos del gimnasio, ordenados de los más listos para comprar a los que necesitan seguimiento.
          </p>
        </div>

        <div class="flex items-center gap-3 shrink-0 relative z-10">
          <a
            href="/leads/new"
            class="px-6 py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-sm font-bold shadow-orange-glow transition transform hover:scale-105 flex items-center gap-2"
          >
            <span class="text-lg">➕</span>
            <span>Anotar Prospecto</span>
          </a>
        </div>
      </div>

      <!-- 4 Números Claves Grandes (Tarjetas Claras) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <!-- Total -->
        <a href="/leads" class="p-6 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-orange/50 transition group">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-zinc-400">Total Personas</span>
            <span class="text-2xl">👥</span>
          </div>
          <div class="mt-4">
            <span class="text-4xl font-extrabold text-white">${totalLeads}</span>
            <p class="text-xs text-zinc-400 mt-1">Interesados en el gimnasio</p>
          </div>
        </a>

        <!-- Calientes (VIP) -->
        <a href="/leads?segment=A" class="p-6 rounded-3xl bg-brand-surface border border-emerald-900/60 hover:border-emerald-500 transition group bg-gradient-to-b from-brand-surface to-emerald-950/20">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-emerald-400">🔥 Muy Interesados</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold border border-emerald-800">LISTOS</span>
          </div>
          <div class="mt-4">
            <span class="text-4xl font-extrabold text-emerald-400">${segmentsCount.A}</span>
            <p class="text-xs text-zinc-400 mt-1">Tienen cita o buen presupuesto</p>
          </div>
        </a>

        <!-- Citas -->
        <a href="/leads?status=cita_agendada" class="p-6 rounded-3xl bg-brand-surface border border-brand-border hover:border-brand-orange transition group">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-brand-orange">📅 Citas Agendadas</span>
            <span class="text-2xl">🗓️</span>
          </div>
          <div class="mt-4">
            <span class="text-4xl font-extrabold text-white">${statusCount['cita_agendada'] || 0}</span>
            <p class="text-xs text-zinc-400 mt-1">Visitas o clases de prueba</p>
          </div>
        </a>

        <!-- Clientes ya Ganados -->
        <a href="/leads?status=ganado" class="p-6 rounded-3xl bg-brand-surface border border-brand-border hover:border-purple-500 transition group">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-purple-400">🏆 Clientes Inscritos</span>
            <span class="text-2xl">🎉</span>
          </div>
          <div class="mt-4">
            <span class="text-4xl font-extrabold text-white">${statusCount['ganado'] || 0}</span>
            <p class="text-xs text-zinc-400 mt-1">Membresías activas</p>
          </div>
        </a>

      </div>

      <!-- Semáforo Sencillo de Clientes -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Semáforo visual (2 Cols) -->
        <div class="lg:col-span-2 p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-6">
          <div>
            <h3 class="text-lg font-bold text-white flex items-center gap-2">
              <span>🚦 Semáforo de Clientes (Fácil de Entender)</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-1">
              El sistema clasifica solo a las personas para que sepas a quién hablarle primero
            </p>
          </div>

          <div class="space-y-4">
            
            <!-- Verde: Calientes -->
            <a href="/leads?segment=A" class="p-4 rounded-2xl bg-brand-card hover:bg-zinc-800/80 border border-emerald-900/40 flex items-center justify-between transition group">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-2xl bg-emerald-950 border border-emerald-700 text-emerald-400 flex items-center justify-center font-bold text-lg">
                  🟢
                </div>
                <div>
                  <h4 class="font-bold text-white text-sm group-hover:text-emerald-400 transition">
                    Calientes / Alta Prioridad (${segmentsCount.A} personas)
                  </h4>
                  <p class="text-xs text-zinc-400">Tienen cita agendada o presupuesto alto. ¡Habla con ellos hoy!</p>
                </div>
              </div>
              <span class="text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition">Ver →</span>
            </a>

            <!-- Azul: En seguimiento -->
            <a href="/leads?segment=B" class="p-4 rounded-2xl bg-brand-card hover:bg-zinc-800/80 border border-blue-900/40 flex items-center justify-between transition group">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-2xl bg-blue-950 border border-blue-700 text-blue-400 flex items-center justify-center font-bold text-lg">
                  🔵
                </div>
                <div>
                  <h4 class="font-bold text-white text-sm group-hover:text-blue-400 transition">
                    En Conversación Activa (${segmentsCount.B} personas)
                  </h4>
                  <p class="text-xs text-zinc-400">Hablamos recientemente. Sigue resolviendo sus dudas.</p>
                </div>
              </div>
              <span class="text-xs font-bold text-blue-400 group-hover:translate-x-1 transition">Ver →</span>
            </a>

            <!-- Amarillo: Fríos -->
            <a href="/leads?segment=C" class="p-4 rounded-2xl bg-brand-card hover:bg-zinc-800/80 border border-amber-900/40 flex items-center justify-between transition group">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-2xl bg-amber-950 border border-amber-700 text-amber-400 flex items-center justify-center font-bold text-lg">
                  🟡
                </div>
                <div>
                  <h4 class="font-bold text-white text-sm group-hover:text-amber-400 transition">
                    Sin Contacto Hace Días (${segmentsCount.C} personas)
                  </h4>
                  <p class="text-xs text-zinc-400">Hace más de 14 días no responden. Mándales un saludo para reactivarlos.</p>
                </div>
              </div>
              <span class="text-xs font-bold text-amber-400 group-hover:translate-x-1 transition">Ver →</span>
            </a>

          </div>
        </div>

        <!-- Personas que esperan mensaje urgente (1 Col) -->
        <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-white flex items-center gap-2">
                <span>⏰ Esperando Mensaje</span>
              </h3>
              <span class="px-2.5 py-1 rounded-full bg-brand-orange/20 text-brand-orange text-xs font-bold">
                ${leadsNeedingAttention.length}
              </span>
            </div>
            <p class="text-xs text-zinc-400 mt-1">Personas que llevan tiempo sin que nadie les hable</p>

            <div class="mt-4 divide-y divide-zinc-800">
              ${leadsNeedingAttention.length === 0 ? html`
                <div class="py-8 text-center text-xs text-zinc-500">
                  🎉 ¡Todo al día! No tienes personas abandonadas.
                </div>
              ` : leadsNeedingAttention.slice(0, 3).map((lead) => html`
                <div class="py-3 flex items-center justify-between gap-3">
                  <div class="overflow-hidden">
                    <p class="font-bold text-white text-xs truncate">${lead.full_name}</p>
                    <p class="text-[11px] text-zinc-400">${lead.phone}</p>
                  </div>
                  <a
                    href="/leads/${lead.id}"
                    class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0"
                  >
                    <span>💬 Contactar</span>
                  </a>
                </div>
              `)}
            </div>
          </div>

          <a href="/leads" class="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold text-center rounded-2xl transition block border border-brand-border">
            Ir a la Lista Completa de Personas →
          </a>
        </div>

      </div>

      <!-- Lo que pasó recientemente (Bitácora humana) -->
      <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-4">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>📋 Últimos Movimientos en el Gimnasio</span>
        </h3>
        
        <div class="divide-y divide-zinc-800">
          ${recentActivities.length === 0 ? html`
            <div class="py-6 text-center text-xs text-zinc-500">Aún no hay notas registradas.</div>
          ` : recentActivities.slice(0, 5).map((act) => html`
            <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-3">
                <span class="text-base">
                  ${act.action_type === 'whatsapp_sent' ? '🟢' : act.action_type === 'status_change' ? '🔄' : '📝'}
                </span>
                <div>
                  <strong class="text-white">${act.lead_name || 'Prospecto'}:</strong>
                  <span class="text-zinc-300 ml-1">${act.details}</span>
                </div>
              </div>
              <span class="text-[11px] text-zinc-500 shrink-0">${act.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
          `)}
        </div>
      </div>

    </div>
  `;
}
