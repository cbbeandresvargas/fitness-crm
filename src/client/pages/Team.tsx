import { createSignal, createEffect, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { User, AuditLog } from '../types';
import { ShieldAlert, ShieldCheck, UserPlus } from 'lucide-solid';

export default function Team() {
  const { user, loading: loadingAuth, showToast } = useAuth();
  const [users, setUsers] = createSignal<User[]>([]);
  const [auditLogs, setAuditLogs] = createSignal<AuditLog[]>([]);
  const [loading, setLoading] = createSignal(true);

  // New member form
  const [name, setName] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [role, setRole] = createSignal<'admin' | 'agent'>('agent');
  const [saving, setSaving] = createSignal(false);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      const res = await api.getTeam();
      setUsers(res.users);
      setAuditLogs(res.auditLogs);
    } catch (err: any) {
      showToast(err.message || 'Error cargando equipo', 'error');
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (!loadingAuth()) {
      if (user()?.role === 'admin') {
        loadTeamData();
      } else {
        setLoading(false);
      }
    }
  });

  const handleCreateMember = async (e: Event) => {
    e.preventDefault();
    if (!name().trim() || !email().trim() || !password()) return;

    try {
      setSaving(true);
      const res = await api.createTeamMember({
        name: name().trim(),
        email: email().trim(),
        password: password(),
        role: role(),
      });
      setUsers((prev) => [...prev, res.user]);
      setName('');
      setEmail('');
      setPassword('');
      showToast(`Usuario ${res.user.name} registrado con éxito`, 'success');
      loadTeamData();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar miembro', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await api.toggleUserStatus(id);
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, is_active: res.is_active } : u))
      );
      showToast('Estado del usuario actualizado', 'info');
      loadTeamData();
    } catch (err: any) {
      showToast(err.message || 'Error al cambiar estado', 'error');
    }
  };

  return (
    <Layout title="Equipo & Auditoría RBAC">
      <Show
        when={user()?.role === 'admin'}
        fallback={
          <div class="p-8 sm:p-12 text-center space-y-3 max-w-md mx-auto rounded-xl bg-surface border border-edge">
            <div class="w-12 h-12 mx-auto rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ShieldAlert class="w-6 h-6" />
            </div>
            <h2 class="text-base font-bold text-body">Acceso Restringido</h2>
            <p class="text-xs text-muted">
              Esta sección requiere permisos de Administrador (Director). Usa el botón inferior del menú lateral para cambiar de rol y explorar.
            </p>
          </div>
        }
      >
        <div class="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
          {/* Cabecera */}
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-1">
            <h2 class="text-base font-bold text-body">Gestión de Asesores y Bitácora de Seguridad</h2>
            <p class="text-xs text-muted max-w-2xl leading-relaxed">
              Control de acceso basado en roles (RBAC). Los asesores solo pueden ver sus propios prospectos asignados, mientras que los administradores tienen visibilidad total y auditoría.
            </p>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Formulario Agregar Miembro (1 col) */}
            <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5">
              <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
                <UserPlus class="w-3.5 h-3.5 text-accent" />
                <span>Registrar Nuevo Miembro</span>
              </h3>

              <form onSubmit={handleCreateMember} class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-muted mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="Ej. Sofía Herrera"
                    class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-muted mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    placeholder="sofia@fitnessclub.fit"
                    class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-muted mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    placeholder="••••••••"
                    class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-muted mb-1">Rol en el Gimnasio</label>
                  <select
                    value={role()}
                    onChange={(e) => setRole(e.currentTarget.value as any)}
                    class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="agent">Coach / Asesor de Ventas</option>
                    <option value="admin">Administrador / Director</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving()}
                  class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer shadow-xs mt-1"
                >
                  {saving() ? 'Guardando...' : 'Crear Miembro'}
                </button>
              </form>
            </div>

            {/* Listado de Miembros del Equipo (2 cols) */}
            <div class="lg:col-span-2 space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold text-body uppercase tracking-wider text-muted">
                  Miembros Registrados ({users().length})
                </h3>
              </div>

              <Show
                when={!loading()}
                fallback={
                  <div class="flex items-center justify-center p-8 text-muted">
                    <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  </div>
                }
              >
                <div class="space-y-2.5">
                  <For each={users()}>
                    {(u) => (
                      <div class="p-3 sm:p-3.5 rounded-xl bg-surface border border-edge flex items-center justify-between gap-3 shadow-xs">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <div class="w-8 h-8 rounded-lg bg-accent/20 text-accent-text border border-accent/30 flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                            <Show when={u.avatar_url} fallback={u.name.slice(0, 2).toUpperCase()}>
                              <img src={u.avatar_url} alt={u.name} class="w-full h-full object-cover" />
                            </Show>
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="font-semibold text-body text-xs truncate">{u.name}</span>
                              <span
                                class={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                  u.role === 'admin'
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : 'bg-blue-500/20 text-blue-400'
                                }`}
                              >
                                {u.role === 'admin' ? 'Admin' : 'Coach'}
                              </span>
                            </div>
                            <span class="text-[11px] text-muted truncate block">{u.email}</span>
                          </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                          <span
                            class={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                              u.is_active
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </span>

                          <Show when={u.id !== user()?.userId}>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u.id)}
                              class="px-2.5 py-1 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-medium rounded-lg transition cursor-pointer border border-edge"
                            >
                              {u.is_active ? 'Suspender' : 'Activar'}
                            </button>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              {/* Bitácora de Auditoría */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 mt-4 sm:mt-6">
                <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
                  <ShieldCheck class="w-3.5 h-3.5 text-accent" />
                  <span>Bitácora de Auditoría</span>
                </h3>

                <div class="overflow-x-auto rounded-lg border border-edge">
                  <table class="w-full text-left text-xs text-body-soft">
                    <thead class="bg-app text-muted font-semibold uppercase text-[10px]">
                      <tr>
                        <th class="py-2 px-3">Acción</th>
                        <th class="py-2 px-3">Detalles</th>
                        <th class="py-2 px-3">Usuario</th>
                        <th class="py-2 px-3">Fecha</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-edge/60 bg-app/40 text-xs">
                      <For each={auditLogs()}>
                        {(log) => (
                          <tr class="hover:bg-elevate/40 transition">
                            <td class="py-2 px-3 font-mono font-semibold text-accent-text text-[11px]">{log.action}</td>
                            <td class="py-2 px-3 max-w-xs truncate">{log.details || '-'}</td>
                            <td class="py-2 px-3 text-muted">{log.user_name || 'Sistema'}</td>
                            <td class="py-2 px-3 text-muted whitespace-nowrap text-[11px]">
                              {new Date(log.created_at).toLocaleDateString('es-ES')}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Layout>
  );
}
