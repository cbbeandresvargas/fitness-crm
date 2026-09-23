import { html } from 'hono/html';
import { User, AuditLog, SessionData } from '../lib/types';

interface TeamViewProps {
  user: SessionData;
  users: User[];
  auditLogs: AuditLog[];
}

export function TeamView({ user, users, auditLogs }: TeamViewProps) {
  return html`
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <div class="space-y-1">
        <h2 class="text-2xl font-black text-white">Equipo de Asesores y Permisos</h2>
        <p class="text-xs text-zinc-400">
          Controla quién puede entrar al sistema y qué prospectos puede ver cada quien
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- 1. Lista del Equipo (2 Cols) -->
        <div class="lg:col-span-2 space-y-6">
          <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-base font-bold text-white flex items-center justify-between pb-3 border-b border-brand-border">
              <span>👥 Miembros del Equipo (${users.length})</span>
              <span class="text-xs text-zinc-400 font-normal">Los vendedores solo ven sus propios contactos</span>
            </h3>

            <div class="divide-y divide-zinc-800">
              ${users.map((u) => html`
                <div class="py-4 flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3.5">
                    <div class="w-11 h-11 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm text-brand-orange shrink-0">
                      ${u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 class="font-extrabold text-white text-sm">${u.name}</h4>
                      <p class="text-xs text-zinc-400">${u.email}</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${
                      u.role === 'admin'
                        ? 'bg-brand-orange text-white shadow-orange-glow'
                        : 'bg-zinc-800 text-zinc-300'
                    }">
                      ${u.role === 'admin' ? '👑 Admin' : '🏋️ Vendedor'}
                    </span>

                    ${u.id !== user.userId ? html`
                      <form action="/team/${u.id}/toggle-status" method="POST" class="inline">
                        <button
                          type="submit"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            u.is_active
                              ? 'bg-zinc-800 text-red-400 border-zinc-700 hover:bg-red-950'
                              : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          }"
                        >
                          ${u.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </form>
                    ` : html`<span class="text-xs text-zinc-500 font-medium">Tú</span>`}
                  </div>
                </div>
              `)}
            </div>
          </div>

          <!-- Historial de cambios -->
          <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-base font-bold text-white flex items-center justify-between pb-3 border-b border-brand-border">
              <span>📜 Registro de Seguridad</span>
              <span class="text-xs text-zinc-400">Quién hizo qué en el sistema</span>
            </h3>

            <div class="divide-y divide-zinc-800 text-xs">
              ${auditLogs.slice(0, 8).map((log) => html`
                <div class="py-3 flex items-center justify-between gap-3">
                  <div>
                    <strong class="text-white">${log.user_name || 'Sistema'}:</strong>
                    <span class="text-zinc-300 ml-1">${log.details || log.action}</span>
                  </div>
                  <span class="text-[11px] text-zinc-500 shrink-0">${log.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              `)}
            </div>
          </div>
        </div>

        <!-- 2. Registrar Nuevo Compañero (1 Col) -->
        <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-5">
          <div class="pb-3 border-b border-brand-border">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>➕ Agregar Compañero</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">Crea una cuenta para otro vendedor o administrador</p>
          </div>

          <form action="/team/new" method="POST" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">Nombre Completo *</label>
              <input
                type="text"
                name="name"
                required
                placeholder="Ej. Andrés Vargas"
                class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">Correo Electrónico *</label>
              <input
                type="email"
                name="email"
                required
                placeholder="andres@ironpeak.fit"
                class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">Contraseña *</label>
              <input
                type="password"
                name="password"
                required
                placeholder="Mínimo 6 caracteres"
                class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">¿Qué rol tendrá? *</label>
              <select
                name="role"
                class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white focus:outline-none focus:border-brand-orange"
              >
                <option value="agent">🏋️ Vendedor (Solo ve a sus propios prospectos)</option>
                <option value="admin">👑 Administrador (Ve todo y configura el sistema)</option>
              </select>
            </div>

            <button
              type="submit"
              class="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-extrabold transition shadow-orange-glow"
            >
              Crear Usuario
            </button>
          </form>
        </div>

      </div>

    </div>
  `;
}
