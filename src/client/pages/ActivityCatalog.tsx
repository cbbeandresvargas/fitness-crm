import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Activity } from '../types';
import { Activity as ActivityIcon, Plus, Pencil, Check, Trash } from 'lucide-solid';

/**
 * Catálogo de Actividades de interés — fuente de verdad central de nombres.
 * Ver/añadir: todos los usuarios autenticados (el catálogo crece orgánicamente).
 * Editar/eliminar: sólo administradores (afecta globalmente a todos los prospectos).
 */
export default function ActivityCatalog() {
  const { user, showToast } = useAuth();

  const [loading, setLoading] = createSignal(true);
  const [activities, setActivities] = createSignal<Activity[]>([]);
  const [newName, setNewName] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  // Edición inline
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.getActivities();
      setActivities(res.activities || []);
    } catch (err: any) {
      showToast(err.message || 'Error cargando el catálogo', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(load);

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    const name = newName().trim();
    if (!name || saving()) return;
    try {
      setSaving(true);
      const res = await api.createActivity(name);
      setNewName('');
      showToast(
        res.reactivated
          ? `Se reactivó la actividad "${res.activity.name}" del catálogo`
          : `Actividad "${res.activity.name}" añadida al catálogo`,
        'success'
      );
      load();
    } catch (err: any) {
      showToast(err.message || 'Error creando actividad', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (activity: Activity) => {
    setEditingId(activity.id);
    setEditName(activity.name);
  };

  const handleSaveEdit = async (activityId: string) => {
    const name = editName().trim();
    if (!name || saving()) return;
    try {
      setSaving(true);
      await api.updateActivity(activityId, name);
      setEditingId(null);
      showToast('Actividad renombrada (los prospectos mantienen la misma referencia)', 'success');
      load();
    } catch (err: any) {
      showToast(err.message || 'Error renombrando actividad', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (activity: Activity) => {
    const count = activity.prospect_count || 0;
    const message = count > 0
      ? `La actividad "${activity.name}" está asociada a ${count} prospecto(s).\n\n¿Seguro que quieres eliminarla del catálogo? Las asociaciones se conservan (atenuadas) y la actividad puede reactivarse creándola de nuevo.`
      : `¿Eliminar la actividad "${activity.name}" del catálogo?`;

    if (!confirm(message)) return;
    try {
      await api.deleteActivity(activity.id);
      showToast(`Actividad "${activity.name}" eliminada del catálogo`, 'info');
      load();
    } catch (err: any) {
      showToast(err.message || 'Error eliminando actividad', 'error');
    }
  };

  return (
    <Layout title="Catálogo de Actividades">
      <div class="space-y-6 max-w-4xl mx-auto">
        {/* Cabecera */}
        <div class="p-8 rounded-3xl bg-surface border border-edge space-y-3">
          <h2 class="text-2xl font-black text-body flex items-center gap-2.5">
            <ActivityIcon class="w-6 h-6 text-accent" />
            <span>Catálogo de Actividades</span>
          </h2>
          <p class="text-xs text-muted max-w-2xl leading-relaxed">
            Fuente de verdad de las actividades de interés de los prospectos. Crece orgánicamente:
            también puedes crear actividades directamente desde la Ficha de un prospecto. Renombrar
            una actividad mantiene la referencia de todos los prospectos asociados.
          </p>
        </div>

        {/* Añadir actividad */}
        <form
          onSubmit={handleCreate}
          class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge flex flex-col sm:flex-row gap-3 shadow-xl"
        >
          <input
            type="text"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            placeholder="Nombre de la actividad (ej. Yoga, Boxeo, Spinning...)"
            maxlength="60"
            class="flex-1 px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName().trim() || saving()}
            class="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl transition shadow-accent-glow disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <Plus class="w-4 h-4" />
            <span>{saving() ? 'Guardando...' : 'Añadir actividad'}</span>
          </button>
        </form>

        {/* Listado */}
        <div class="p-5 sm:p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-body">Actividades del catálogo</h3>
            <span class="text-xs text-muted">
              {activities().filter((a) => a.is_active).length} activas ·{' '}
              {activities().filter((a) => !a.is_active).length} eliminadas
            </span>
          </div>

          <Show
            when={!loading() && activities().length > 0}
            fallback={
              <Show
                when={loading()}
                fallback={<p class="text-xs text-muted">El catálogo está vacío.</p>}
              >
                <div class="flex justify-center py-6">
                  <div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              </Show>
            }
          >
            <div class="overflow-x-auto rounded-2xl border border-edge">
              <table class="w-full text-left text-xs">
                <thead class="bg-app text-muted font-bold uppercase text-[10px]">
                  <tr>
                    <th class="p-3 border-b border-edge">Actividad</th>
                    <th class="p-3 border-b border-edge">Prospectos interesados</th>
                    <Show when={user()?.role === 'admin'}>
                      <th class="p-3 border-b border-edge text-right">Acciones</th>
                    </Show>
                  </tr>
                </thead>
                <tbody class="divide-y divide-edge/60 bg-app/40">
                  <For each={activities()}>
                    {(activity) => (
                      <tr class={activity.is_active ? '' : 'opacity-50'}>
                        <td class="p-3">
                          <Show
                            when={editingId() === activity.id}
                            fallback={
                              <span class="font-bold text-body">
                                {activity.name}
                                <Show when={!activity.is_active}>
                                  <span class="ml-2 text-[10px] font-semibold text-muted">
                                    (eliminada)
                                  </span>
                                </Show>
                              </span>
                            }
                          >
                            <input
                              type="text"
                              value={editName()}
                              onInput={(e) => setEditName(e.currentTarget.value)}
                              maxlength="60"
                              class="w-full max-w-xs px-3 py-1.5 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                            />
                          </Show>
                        </td>
                        <td class="p-3">
                          <span class="font-bold text-accent-text">
                            {activity.prospect_count || 0}
                          </span>
                          <span class="text-muted"> prospecto(s)</span>
                        </td>
                        <Show when={user()?.role === 'admin'}>
                          <td class="p-3 text-right">
                            <div class="inline-flex items-center gap-1.5">
                              <Show
                                when={editingId() === activity.id}
                                fallback={
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(activity)}
                                    class="p-2 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl font-semibold transition cursor-pointer flex items-center justify-center"
                                    title="Renombrar"
                                  >
                                    <Pencil class="w-3.5 h-3.5" />
                                  </button>
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(activity.id)}
                                  disabled={saving() || !editName().trim()}
                                  class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  <Check class="w-3.5 h-3.5" />
                                  <span>Guardar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  class="px-3 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl font-semibold transition cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </Show>
                              <Show when={activity.is_active}>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(activity)}
                                  class="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-xl font-semibold transition cursor-pointer flex items-center justify-center"
                                  title={
                                    (activity.prospect_count || 0) > 0
                                      ? `Asociada a ${activity.prospect_count} prospecto(s)`
                                      : 'Eliminar del catálogo'
                                  }
                                >
                                  <Trash class="w-3.5 h-3.5" />
                                </button>
                              </Show>
                            </div>
                          </td>
                        </Show>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </div>
    </Layout>
  );
}
