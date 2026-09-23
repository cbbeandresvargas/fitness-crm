import { html } from 'hono/html';
import { MessageTemplate, SessionData } from '../lib/types';

interface TemplatesViewProps {
  user: SessionData;
  templates: MessageTemplate[];
}

export function TemplatesView({ user, templates }: TemplatesViewProps) {
  return html`
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-black text-white">Plantillas de Mensajes para WhatsApp</h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Crea plantillas dinámicas con etiquetas variables tipo <code class="text-brand-orange bg-zinc-900 px-1 py-0.5 rounded">{nombre}</code>, <code class="text-brand-orange bg-zinc-900 px-1 py-0.5 rounded">{producto}</code>, <code class="text-brand-orange bg-zinc-900 px-1 py-0.5 rounded">{ciudad}</code>
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left: Create New Template (1 Col) -->
        <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
          <h3 class="text-sm font-bold text-white pb-2 border-b border-brand-border">
            ➕ Crear Nueva Plantilla
          </h3>

          <form action="/templates" method="POST" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Título de la Plantilla *</label>
              <input
                type="text"
                name="title"
                required
                placeholder="Ej. Promoción Fin de Mes Membresía"
                class="w-full px-3.5 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Categoría</label>
              <select
                name="category"
                class="w-full px-3.5 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
              >
                <option value="primer_contacto">Primer Contacto / Bienvenida</option>
                <option value="seguimiento">Seguimiento / Cita</option>
                <option value="reactivacion">Reactivación Prospecto Frío</option>
                <option value="cierre">Cierre & Promociones</option>
                <option value="general">General</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Cuerpo del Mensaje *</label>
              <div class="flex flex-wrap gap-1 mb-2">
                <span class="text-[10px] text-zinc-500 font-bold mr-1">Variables:</span>
                ${['{nombre}', '{producto}', '{ciudad}', '{agente}', '{presupuesto}'].map((v) => html`
                  <button
                    type="button"
                    onclick="const ta = document.getElementById('newTemplateContent'); ta.value += ' ' + '${v}'; ta.focus();"
                    class="px-1.5 py-0.5 rounded text-[10px] bg-brand-orange-subtle text-brand-orange border border-brand-orange/30 font-mono hover:bg-brand-orange hover:text-white transition"
                  >
                    + ${v}
                  </button>
                `)}
              </div>
              <textarea
                id="newTemplateContent"
                name="content"
                rows="5"
                required
                placeholder="¡Hola {nombre}! 💪 Te saluda {agente} de IronPeak. Vimos tu consulta sobre {producto}..."
                class="w-full p-3 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange leading-relaxed"
              ></textarea>
            </div>

            <button
              type="submit"
              class="w-full py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm"
            >
              Guardar Plantilla
            </button>
          </form>
        </div>

        <!-- Right: Existing Templates List (2 Cols) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-sm font-bold text-white pb-2 border-b border-brand-border flex items-center justify-between">
              <span>📚 Plantillas Activas (${templates.length})</span>
              <span class="text-xs text-zinc-400 font-normal">Listas para usar con 1-click</span>
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${templates.map((tmpl) => html`
                <div class="p-4 rounded-xl bg-brand-card border border-brand-border hover:border-brand-orange/40 transition flex flex-col justify-between space-y-3 group">
                  <div class="space-y-1.5">
                    <div class="flex items-start justify-between gap-2">
                      <h4 class="font-bold text-xs text-white group-hover:text-brand-orange transition">${tmpl.title}</h4>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 capitalize">
                        ${tmpl.category.replace('_', ' ')}
                      </span>
                    </div>
                    <p class="text-xs text-zinc-400 font-mono bg-brand-black/60 p-2.5 rounded-lg border border-zinc-800/80 leading-relaxed whitespace-pre-wrap">
                      ${tmpl.content}
                    </p>
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-brand-border/60 text-[11px] text-zinc-500">
                    <span>Creado: ${tmpl.created_at.slice(0, 10)}</span>
                    <form action="/templates/${tmpl.id}/delete" method="POST" onsubmit="return confirm('¿Eliminar esta plantilla?');">
                      <button type="submit" class="text-red-400 hover:text-red-300 font-semibold">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>
              `)}
            </div>
          </div>
        </div>

      </div>

    </div>
  `;
}
