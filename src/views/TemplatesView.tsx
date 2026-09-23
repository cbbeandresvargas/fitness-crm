import { html } from 'hono/html';
import { MessageTemplate, SessionData } from '../lib/types';

interface TemplatesViewProps {
  user: SessionData;
  templates: MessageTemplate[];
}

export function TemplatesView({ user, templates }: TemplatesViewProps) {
  return html`
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <div class="space-y-1">
        <h2 class="text-2xl font-black text-white">Plantillas de Mensajes para WhatsApp</h2>
        <p class="text-xs text-zinc-400">
          Mensajes frecuentes para saludar, invitar a clases de prueba o cerrar ventas en un solo clic
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- 1. Crear Nueva Plantilla (1 Col) -->
        <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-5">
          <div class="pb-3 border-b border-brand-border">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>➕ Crear Nuevo Mensaje</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">Escribe un texto que envíes frecuentemente</p>
          </div>

          <form action="/templates" method="POST" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">Título o Nombre del Mensaje *</label>
              <input
                type="text"
                name="title"
                required
                placeholder="Ej. Invitación a Clase Gratis"
                class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-white">¿Qué debe decir el mensaje? *</label>
              <p class="text-[11px] text-zinc-400">
                Usa <code class="text-brand-orange font-bold">{nombre}</code> para que el sistema ponga el nombre del cliente solo.
              </p>
              
              <div class="flex flex-wrap gap-1.5 py-1">
                ${['{nombre}', '{producto}', '{ciudad}'].map((v) => html`
                  <button
                    type="button"
                    onclick="const ta = document.getElementById('newTemplateContent'); ta.value += ' ' + '${v}'; ta.focus();"
                    class="px-2 py-1 rounded-lg text-[11px] bg-brand-orange/20 text-brand-orange border border-brand-orange/40 font-bold hover:bg-brand-orange hover:text-white transition"
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
                placeholder="¡Hola {nombre}! 💪 Te saluda el equipo de IronPeak..."
                class="w-full p-4 bg-brand-card border border-brand-border rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange leading-relaxed"
              ></textarea>
            </div>

            <input type="hidden" name="category" value="general"/>

            <button
              type="submit"
              class="w-full py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-extrabold transition shadow-orange-glow"
            >
              Guardar Mensaje
            </button>
          </form>
        </div>

        <!-- 2. Lista de Mensajes Activos (2 Cols) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="p-7 rounded-3xl bg-brand-surface border border-brand-border space-y-4">
            <h3 class="text-base font-bold text-white flex items-center justify-between pb-3 border-b border-brand-border">
              <span>Tus Mensajes Guardados (${templates.length})</span>
              <span class="text-xs text-zinc-400 font-normal">Aparecen automáticamente en la ficha de cada persona</span>
            </h3>

            <div class="space-y-4">
              ${templates.map((tmpl) => html`
                <div class="p-5 rounded-2xl bg-brand-card border border-brand-border hover:border-brand-orange/40 transition space-y-3">
                  <div class="flex items-center justify-between">
                    <h4 class="font-extrabold text-sm text-white">${tmpl.title}</h4>
                    <form action="/templates/${tmpl.id}/delete" method="POST" onsubmit="return confirm('¿Seguro que deseas borrar este mensaje?');">
                      <button type="submit" class="text-xs text-red-400 hover:text-red-300 font-semibold">
                        Borrar
                      </button>
                    </form>
                  </div>

                  <p class="text-xs text-zinc-300 bg-brand-black p-4 rounded-xl border border-zinc-800 leading-relaxed font-sans whitespace-pre-wrap">
                    ${tmpl.content}
                  </p>
                </div>
              `)}
            </div>
          </div>
        </div>

      </div>

    </div>
  `;
}
