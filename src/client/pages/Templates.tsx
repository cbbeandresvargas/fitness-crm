import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { MessageTemplate } from '../types';
import {
  FileText,
  Plus,
  Trash2,
  Eye,
  MessageSquare,
  RefreshCw,
} from 'lucide-solid';

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
      .replace(/{nombre}/gi, 'Mateo')
      .replace(/{producto}/gi, 'Fitness Club Pass')
      .replace(/{ciudad}/gi, 'Cochabamba')
      .replace(/{agente}/gi, 'Valeria');
  };

  return (
    <Layout title="Plantillas de WhatsApp">
      <div class="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-2">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <h2 class="text-base font-bold text-body">Plantillas Rápidas para WhatsApp</h2>
              <p class="text-xs text-muted max-w-2xl leading-relaxed">
                Estandariza los mensajes de primer contacto, seguimiento, cierre de suscripción y reactivación en Cochabamba. Variables disponibles: <code class="px-1.5 py-0.5 bg-elevate rounded text-accent-text font-mono text-[11px]">{'{nombre}'}</code>, <code class="px-1.5 py-0.5 bg-elevate rounded text-accent-text font-mono text-[11px]">{'{producto}'}</code>, <code class="px-1.5 py-0.5 bg-elevate rounded text-accent-text font-mono text-[11px]">{'{ciudad}'}</code> y <code class="px-1.5 py-0.5 bg-elevate rounded text-accent-text font-mono text-[11px]">{'{agente}'}</code>.
              </p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Formulario Nueva Plantilla (1 col) */}
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5">
            <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
              <Plus size={14} class="text-accent" />
              <span>Crear Nueva Plantilla</span>
            </h3>

            <form onSubmit={handleCreate} class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-muted mb-1">
                  Título de la Plantilla
                </label>
                <input
                  type="text"
                  required
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                  placeholder="Ej. Promo Pase Fit Pro Bs 280"
                  class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-medium text-muted mb-1">
                  Categoría
                </label>
                <select
                  value={category()}
                  onChange={(e) => setCategory(e.currentTarget.value)}
                  class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="primer_contacto">Primer Contacto & Bienvenida</option>
                  <option value="seguimiento">Seguimiento / Explicación App</option>
                  <option value="cierre">Cierre Comercial / QR de Pago</option>
                  <option value="reactivacion">Reactivación Inactivos</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-medium text-muted mb-1">
                  Mensaje
                </label>
                <textarea
                  rows={4}
                  required
                  value={content()}
                  onInput={(e) => setContent(e.currentTarget.value)}
                  placeholder="¡Hola {nombre}! Te saluda {agente} de Fitness Club Pass Cochabamba..."
                  class="w-full p-2.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={saving() || !title().trim() || !content().trim()}
                class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs mt-1"
              >
                <Show when={saving()} fallback={<Plus size={13} />}>
                  <RefreshCw size={13} class="animate-spin" />
                </Show>
                <span>{saving() ? 'Guardando...' : 'Guardar Plantilla'}</span>
              </button>
            </form>
          </div>

          {/* Listado de Plantillas Existentes (2 cols) */}
          <div class="lg:col-span-2 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold text-body uppercase tracking-wider text-muted">
                Plantillas Guardadas ({templates().length})
              </h3>
            </div>

            <Show
              when={!loading()}
              fallback={
                <div class="flex items-center justify-center p-8 text-muted">
                  <RefreshCw size={18} class="animate-spin text-accent" />
                </div>
              }
            >
              <div class="space-y-3">
                <For each={templates()}>
                  {(tmpl) => (
                    <div class="p-3.5 sm:p-4 rounded-xl bg-surface border border-edge hover:border-edge-strong transition space-y-2.5 shadow-xs">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2 flex-wrap">
                          <MessageSquare size={14} class="text-accent" />
                          <h4 class="font-semibold text-body text-xs">{tmpl.title}</h4>
                          <span class="px-2 py-0.5 rounded-md bg-elevate text-[10px] font-medium text-muted uppercase">
                            {tmpl.category}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDelete(tmpl.id)}
                          class="p-1 text-muted hover:text-red-400 transition cursor-pointer"
                          title="Eliminar plantilla"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <p class="text-xs text-body-soft whitespace-pre-wrap leading-relaxed">
                        {tmpl.content}
                      </p>

                      <div class="p-2.5 bg-app rounded-lg border border-edge space-y-1">
                        <span class="text-[10px] font-semibold text-accent-text uppercase tracking-wider flex items-center gap-1">
                          <Eye size={11} />
                          <span>Previsualización:</span>
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
