import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { MessageTemplate } from '../types';

export default function Templates() {
  const { showToast } = useAuth();
  const [templates, setTemplates] = createSignal<MessageTemplate[]>([]);
  const [loading, setLoading] = createSignal(true);

  // New template form
  const [title, setTitle] = createSignal('');
  const [category, setCategory] = createSignal('primer_contacto');
  const [content, setContent] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.getTemplates();
      setTemplates(res.templates);
    } catch (err: any) {
      showToast(err.message || 'Error cargando plantillas', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    loadTemplates();
  });

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!title().trim() || !content().trim()) return;

    try {
      setSaving(true);
      const res = await api.createTemplate({
        title: title().trim(),
        category: category(),
        content: content().trim(),
      });
      setTemplates((prev) => [res.template, ...prev]);
      setTitle('');
      setContent('');
      showToast('Plantilla creada correctamente', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error creando plantilla', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta plantilla?')) return;
    try {
      await api.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showToast('Plantilla eliminada', 'info');
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar', 'error');
    }
  };

  const renderSample = (text: string) => {
    return text
      .replace(/{nombre}/gi, 'Sofía')
      .replace(/{producto}/gi, 'CrossFit Pro')
      .replace(/{ciudad}/gi, 'CDMX')
      .replace(/{agente}/gi, 'Carlos');
  };

  return (
    <Layout title="Plantillas de WhatsApp">
      <div class="space-y-8 max-w-6xl mx-auto">
        <div class="p-8 rounded-3xl bg-surface border border-edge space-y-2">
          <h2 class="text-2xl font-black text-body">Plantillas Rápidas para WhatsApp</h2>
          <p class="text-xs text-muted max-w-2xl leading-relaxed">
            Estandariza los mensajes de primer contacto, seguimiento, cierre y reactivación del gimnasio. Puedes usar las variables dinámicas: <code class="px-2 py-0.5 bg-elevate rounded-lg text-accent-text font-bold">{'{nombre}'}</code>, <code class="px-2 py-0.5 bg-elevate rounded-lg text-accent-text font-bold">{'{producto}'}</code>, <code class="px-2 py-0.5 bg-elevate rounded-lg text-accent-text font-bold">{'{ciudad}'}</code> y <code class="px-2 py-0.5 bg-elevate rounded-lg text-accent-text font-bold">{'{agente}'}</code>.
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulario Nueva Plantilla (1 col) */}
          <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4">
            <h3 class="text-sm font-bold text-body flex items-center gap-2">
              <span>➕</span>
              <span>Crear Nueva Plantilla</span>
            </h3>

            <form onSubmit={handleCreate} class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-muted mb-1">
                  Título de la Plantilla
                </label>
                <input
                  type="text"
                  required
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                  placeholder="Ej. Promoción Fin de Mes"
                  class="w-full px-3.5 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-muted mb-1">
                  Categoría
                </label>
                <select
                  value={category()}
                  onChange={(e) => setCategory(e.currentTarget.value)}
                  class="w-full px-3.5 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                >
                  <option value="primer_contacto">Primer Contacto & Bienvenida</option>
                  <option value="seguimiento">Seguimiento / Cita</option>
                  <option value="cierre">Cierre Comercial / Descuento</option>
                  <option value="reactivacion">Reactivación Inactivos</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-muted mb-1">
                  Mensaje
                </label>
                <textarea
                  rows={5}
                  required
                  value={content()}
                  onInput={(e) => setContent(e.currentTarget.value)}
                  placeholder="¡Hola {nombre}! Te saluda {agente} de IronPeak..."
                  class="w-full p-3.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={saving() || !title().trim() || !content().trim()}
                class="w-full py-3 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl transition shadow-accent-glow disabled:opacity-50 cursor-pointer"
              >
                {saving() ? 'Guardando...' : 'Guardar Plantilla'}
              </button>
            </form>
          </div>

          {/* Listado de Plantillas Existentes (2 cols) */}
          <div class="lg:col-span-2 space-y-4">
            <h3 class="text-sm font-bold text-body flex items-center justify-between">
              <span>Plantillas Guardadas ({templates().length})</span>
            </h3>

            <Show
              when={!loading()}
              fallback={
                <div class="flex items-center justify-center p-12 text-muted">
                  <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              }
            >
              <div class="space-y-4">
                <For each={templates()}>
                  {(tmpl) => (
                    <div class="p-6 rounded-3xl bg-surface border border-edge hover:border-edge-strong transition space-y-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="text-lg">💬</span>
                          <h4 class="font-extrabold text-body text-sm">{tmpl.title}</h4>
                          <span class="px-2.5 py-0.5 rounded-full bg-elevate text-[10px] font-bold text-muted uppercase">
                            {tmpl.category}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDelete(tmpl.id)}
                          class="p-2 text-muted hover:text-red-400 transition cursor-pointer"
                          title="Eliminar plantilla"
                        >
                          🗑️
                        </button>
                      </div>

                      <p class="text-xs text-body-soft whitespace-pre-wrap leading-relaxed">
                        {tmpl.content}
                      </p>

                      <div class="p-3 bg-app rounded-2xl border border-edge/80 space-y-1">
                        <span class="text-[10px] font-bold text-accent-text uppercase tracking-wider block">
                          👀 Previsualización con variables de ejemplo:
                        </span>
                        <p class="text-[11px] text-muted italic">
                          "{renderSample(tmpl.content)}"
                        </p>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Layout>
  );
}
