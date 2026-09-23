import { html } from 'hono/html';
import { User, AuditLog, SessionData } from '../lib/types';

interface TeamViewProps {
  user: SessionData;
  users: User[];
  auditLogs: AuditLog[];
}

export function TeamView({ user, users, auditLogs }: TeamViewProps) {
  return html`
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-orange-subtle border border-brand-orange/30 text-brand-orange text-xs font-bold mb-2">
            <span>🛡️ Seguridad y Control de Acceso (RBAC)</span>
          </div>
          <h2 class="text-xl font-black text-white">Equipo, Permisos & Registro de Auditoría</h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Los Agentes solo tienen visibilidad y edición de sus prospectos asignados. Los Administradores gestionan la cartera global.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left: Create New Agent & Existing Team (2 cols) -->
        <div class="lg:col-span-2 space-y-6">

          <!-- Team Table -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-sm font-bold text-white pb-2 border-b border-brand-border flex items-center justify-between">
              <span>👥 Miembros del Equipo (${users.length})</span>
              <span class="text-xs text-zinc-400">Control de roles y cuentas activas</span>
            </h3>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-brand-card text-zinc-400 text-[10px] uppercase font-bold border-b border-brand-border">
                  <tr>
                    <th class="p-3">Usuario</th>
                    <th class="p-3">Rol RBAC</th>
                    <th class="p-3">Estado</th>
                    <th class="p-3">Fecha Alta</th>
                    <th class="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-brand-border">
                  ${users.map((u) => html`
                    <tr class="hover:bg-brand-card/30">
                      <td class="p-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-7 h-7 rounded-full bg-zinc-800 text-brand-orange flex items-center justify-center font-bold text-xs shrink-0">
                            ${u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span class="font-bold text-white block">${u.name}</span>
                            <span class="text-[11px] text-zinc-400">${u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td class="p-3">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin'
                            ? 'bg-brand-orange text-white'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }">
                          ${u.role}
                        </span>
                      </td>

                      <td class="p-3">
                        <span class="inline-flex items-center gap-1.5 text-xs font-semibold ${u.is_active ? 'text-emerald-400' : 'text-zinc-500'}">
                          <span class="w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}"></span>
                          ${u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      <td class="p-3 text-zinc-400">
                        ${u.created_at.slice(0, 10)}
                      </td>

                      <td class="p-3 text-right">
                        ${u.id !== user.userId ? html`
                          <form action="/team/${u.id}/toggle-status" method="POST" class="inline">
                            <button
                              type="submit"
                              class="text-[11px] font-semibold ${u.is_active ? 'text-red-400 hover:underline' : 'text-emerald-400 hover:underline'}"
                            >
                              ${u.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          </form>
                        ` : html`<span class="text-[10px] text-zinc-500 italic">Sesión actual</span>`}
                      </td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Audit Logs Feed -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-brand-border">
              <div>
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span>📜 Registro de Auditoría de Seguridad</span>
                </h3>
                <p class="text-xs text-zinc-400 mt-0.5">Trazabilidad con created_by, updated_by y timestamps de operaciones sensibles</p>
              </div>
              <span class="text-xs text-zinc-500">${auditLogs.length} eventos</span>
            </div>

            <div class="space-y-2.5 max-h-80 overflow-y-auto">
              ${auditLogs.length === 0 ? html`
                <div class="py-6 text-center text-xs text-zinc-500">
                  Sin registros de auditoría aún.
                </div>
              ` : auditLogs.map((log) => html`
                <div class="p-3 rounded-xl bg-brand-card border border-brand-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div class="space-y-0.5">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.2 rounded text-[9px] font-bold bg-zinc-800 text-zinc-300 uppercase border border-zinc-700">
                        ${log.entity_type}
                      </span>
                      <strong class="text-white">${log.action}</strong>
                      <span class="text-zinc-400">por ${log.user_name || 'Sistema'}</span>
                    </div>
                    <p class="text-[11px] text-zinc-400">${log.details || ''}</p>
                  </div>
                  <span class="text-[10px] text-zinc-500 shrink-0">${log.created_at}</span>
                </div>
              `)}
            </div>
          </div>

        </div>

        <!-- Right: Register New User Form (1 col) -->
        <div class="space-y-6">
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-sm font-bold text-white pb-2 border-b border-brand-border">
              ➕ Registrar Nuevo Agente
            </h3>

            <form action="/team/new" method="POST" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ej. Andrés Vargas"
                  class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="andres@ironpeak.fit"
                  class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Contraseña Inicial *</label>
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Rol en el CRM *</label>
                <select
                  name="role"
                  class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
                >
                  <option value="agent">Agente de Ventas (Solo ve sus leads asignados)</option>
                  <option value="admin">Administrador (Acceso total)</option>
                </select>
              </div>

              <button
                type="submit"
                class="w-full py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm"
              >
                Crear Usuario
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  `;
}
