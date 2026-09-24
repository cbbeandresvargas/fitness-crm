import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { User, AuditLog } from '../types';

export default function Team() {
  const { user, showToast } = useAuth();
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

  onMount(() => {
    if (user()?.role === 'admin') {
      loadTeamData();
    } else {
      setLoading(false);
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
          <div class="p-16 text-center space-y-3 max-w-md mx-auto">
            <span class="text-4xl block">🛡️</span>
            <h2 class="text-xl font-bold text-white">Acceso Restringido</h2>
            <p class="text-xs text-zinc-400">
              Esta sección requiere permisos de Administrador (Director). Usa el botón inferior del menú lateral para cambiar de rol y explorar.
            </p>
          </div>
        }
      >
        <div class="space-y-8 max-w-6xl mx-auto">
          {/* Cabecera */}
          <div class="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2">
            <h2 class="text-2xl font-black text-white">Gestión de Asesores y Bitácora de Seguridad</h2>
            <p class="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Control de acceso basado en roles (RBAC). Los asesores solo pueden ver sus propios prospectos asignados, mientras que los administradores tienen visibilidad total y auditoría.
            </p>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Formulario Agregar Miembro (1 col) */}
            <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>➕</span>
                <span>Registrar Nuevo Asesor / Admin</span>
              </h3>

              <form onSubmit={handleCreateMember} class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-zinc-400 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="Ej. Sofía Herrera"
                    class="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-zinc-400 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    placeholder="sofia@ironpeak.fit"
                    class="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-zinc-400 mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    value={password()}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    placeholder="••••••••"
                    class="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-zinc-400 mb-1">Rol en el Gimnasio</label>
                  <select
                    value={role()}
                    onChange={(e) => setRole(e.currentTarget.value as any)}
                    class="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="agent">🏋️ Coach / Asesor de Ventas</option>
                    <option value="admin">👑 Administrador / Director</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving()}
                  class="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-2xl transition shadow-orange-glow disabled:opacity-50 cursor-pointer"
                >
                  {saving() ? 'Guardando...' : 'Crear Miembro'}
                </button>
              </form>
            </div>

            {/* Listado de Miembros del Equipo (2 cols) */}
            <div class="lg:col-span-2 space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center justify-between">
                <span>Miembros Registrados ({users().length})</span>
              </h3>

              <Show
                when={!loading()}
                fallback={
                  <div class="flex items-center justify-center p-12 text-zinc-500">
                    <div class="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                }
              >
                <div class="space-y-3">
                  <For each={users()}>
                    {(u) => (
                      <div class="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                            <Show when={u.avatar_url} fallback={u.name.slice(0, 2).toUpperCase()}>
                              <img src={u.avatar_url} alt={u.name} class="w-full h-full object-cover" />
                            </Show>
                          </div>
                          <div>
                            <div class="flex items-center gap-2">
                              <span class="font-bold text-white text-sm">{u.name}</span>
                              <span
                                class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  u.role === 'admin'
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : 'bg-blue-500/20 text-blue-400'
                                }`}
                              >
                                {u.role === 'admin' ? 'Administrador' : 'Coach Ventas'}
                              </span>
                            </div>
                            <span class="text-xs text-zinc-400">{u.email}</span>
                          </div>
                        </div>

                        <div class="flex items-center gap-3">
                          <span
                            class={`px-2.5 py-1 rounded-xl text-xs font-semibold ${
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
                              class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer"
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
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 mt-8">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <span>🔒</span>
                  <span>Bitácora de Auditoría (Audit Logs)</span>
                </h3>

                <div class="overflow-x-auto rounded-2xl border border-zinc-800">
                  <table class="w-full text-left text-xs text-zinc-300">
                    <thead class="bg-zinc-950 text-zinc-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th class="p-3">Acción</th>
                        <th class="p-3">Detalles</th>
                        <th class="p-3">Usuario</th>
                        <th class="p-3">Fecha</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800/60 bg-zinc-950/40">
                      <For each={auditLogs()}>
                        {(log) => (
                          <tr>
                            <td class="p-3 font-mono font-bold text-orange-400">{log.action}</td>
                            <td class="p-3 max-w-xs truncate">{log.details || '-'}</td>
                            <td class="p-3 text-zinc-400">{log.user_name || 'Sistema'}</td>
                            <td class="p-3 text-zinc-500 whitespace-nowrap">
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
