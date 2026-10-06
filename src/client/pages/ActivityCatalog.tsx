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
      <div class="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
        {/* Cabecera */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-1.5">
          <h2 class="text-base font-bold text-body flex items-center gap-2">
            <ActivityIcon class="w-5 h-5 text-accent" />
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
          class="p-3 sm:p-4 rounded-xl bg-surface border border-edge flex flex-col sm:flex-row gap-2.5 shadow-xs"
        >
          <input
            type="text"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            placeholder="Nombre de la actividad (ej. Yoga, Boxeo, Spinning...)"
            maxlength="60"
            class="flex-1 px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName().trim() || saving()}
            class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{saving() ? 'Guardando...' : 'Añadir actividad'}</span>
          </button>
        </form>

        {/* Listado */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5 shadow-xs">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-body uppercase tracking-wider text-muted">Actividades del catálogo</h3>
            <span class="text-[11px] text-muted">
              {activities().filter((a) => a.is_active).length} activas ·{' '}
              {activities().filter((a) => !a.is_active).length} inactivas
            </span>
          </div>

          <Show
            when={!loading() && activities().length > 0}
            fallback={
              <Show
                when={loading()}
                fallback={<p class="text-xs text-muted py-4 text-center">El catálogo está vacío.</p>}
              >
                <div class="flex justify-center py-6">
                  <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              </Show>
            }
          >
            <div class="overflow-x-auto rounded-lg border border-edge">
              <table class="w-full text-left text-xs">
                <thead class="bg-app text-muted font-semibold uppercase text-[10px]">
                  <tr>
                    <th class="py-2 px-3 border-b border-edge">Actividad</th>
                    <th class="py-2 px-3 border-b border-edge">Prospectos interesados</th>
                    <Show when={user()?.role === 'admin'}>
                      <th class="py-2 px-3 border-b border-edge text-right">Acciones</th>
                    </Show>
                  </tr>
                </thead>
                <tbody class="divide-y divide-edge/60 bg-app/40 text-xs">
                  <For each={activities()}>
                    {(activity) => (
                      <tr class={`hover:bg-elevate/40 transition ${activity.is_active ? '' : 'opacity-50'}`}>
                        <td class="py-2 px-3">
                          <Show
                            when={editingId() === activity.id}
                            fallback={
                              <span class="font-medium text-body">
                                {activity.name}
                                <Show when={!activity.is_active}>
                                  <span class="ml-1.5 text-[10px] text-muted font-normal">
                                    (inactiva)
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
                              class="w-full max-w-xs px-2.5 py-1 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                            />
                          </Show>
                        </td>
                        <td class="py-2 px-3">
                          <span class="font-semibold text-accent-text">
                            {activity.prospect_count || 0}
                          </span>
                          <span class="text-muted text-[11px]"> prospecto(s)</span>
                        </td>
                        <Show when={user()?.role === 'admin'}>
                          <td class="py-2 px-3 text-right">
                            <div class="inline-flex items-center gap-1">
                              <Show
                                when={editingId() === activity.id}
                                fallback={
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(activity)}
                                    class="p-1.5 bg-elevate hover:bg-elevate-strong text-body-soft rounded-lg transition cursor-pointer flex items-center justify-center border border-edge"
                                    title="Renombrar"
                                  >
                                    <Pencil class="w-3 h-3" />
                                  </button>
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(activity.id)}
                                  disabled={saving() || !editName().trim()}
                                  class="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  <Check class="w-3 h-3" />
                                  <span>Guardar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  class="px-2.5 py-1 bg-elevate hover:bg-elevate-strong text-body-soft rounded-lg text-xs font-medium transition cursor-pointer border border-edge"
                                >
                                  Cancelar
                                </button>
                              </Show>
                              <Show when={activity.is_active}>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(activity)}
                                  class="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg transition cursor-pointer flex items-center justify-center border border-red-900/40"
                                  title={
                                    (activity.prospect_count || 0) > 0
                                      ? `Asociada a ${activity.prospect_count} prospecto(s)`
                                      : 'Eliminar del catálogo'
                                  }
                                >
                                  <Trash class="w-3 h-3" />
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
