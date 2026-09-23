import { html } from 'hono/html';
import { User, SessionData } from '../lib/types';

interface LeadFormProps {
  user: SessionData;
  agents: User[];
  error?: string | null;
  duplicateWarning?: { id: string; full_name: string; phone: string } | null;
  formData?: {
    full_name?: string;
    phone?: string;
    email?: string;
    status?: string;
    assigned_to?: string;
    tags?: string;
    presupuesto?: string;
    objetivo?: string;
    horario_preferido?: string;
    ciudad?: string;
    sede?: string;
    producto?: string;
    initial_note?: string;
  };
}

export function LeadFormView({
  user,
  agents,
  error,
  duplicateWarning,
  formData = {},
}: LeadFormProps) {
  return html`
    <div class="max-w-4xl mx-auto space-y-6">
      
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <a href="/leads" class="text-xs text-brand-orange hover:underline font-semibold flex items-center gap-1 mb-1">
            ← Volver a Prospectos
          </a>
          <h2 class="text-xl font-black text-white">Registrar Nuevo Prospecto Fitness</h2>
          <p class="text-xs text-zinc-400 mt-0.5">Validación automática de duplicados por WhatsApp y asignación inteligente</p>
        </div>
      </div>

      ${error ? html`
        <div class="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>${error}</span>
        </div>
      ` : ''}

      ${duplicateWarning ? html`
        <div class="p-4 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs space-y-1">
          <div class="font-bold flex items-center gap-2">
            <span>⚠️ ¡Teléfono duplicado detectado!</span>
          </div>
          <p>
            Ya existe un prospecto registrado con el número <strong>${duplicateWarning.phone}</strong>:
            <a href="/leads/${duplicateWarning.id}" class="underline font-bold text-white ml-1">
              ${duplicateWarning.full_name} (Ver Ficha)
            </a>
          </p>
        </div>
      ` : ''}

      <form action="/leads" method="POST" class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-6">
        
        <!-- Section 1: Contacto Principal -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-brand-border">
            <span>👤 Información de Contacto</span>
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Nombre Completo *</label>
              <input
                type="text"
                name="full_name"
                required
                value="${formData.full_name || ''}"
                placeholder="Ej. Sofía Morales"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">
                WhatsApp / Teléfono * 
                <span class="text-[10px] text-brand-orange">(Anti-duplicados)</span>
              </label>
              <input
                type="tel"
                name="phone"
                required
                value="${formData.phone || ''}"
                placeholder="Ej. +52 55 1234 5678"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Correo Electrónico</label>
              <input
                type="email"
                name="email"
                value="${formData.email || ''}"
                placeholder="sofia@gmail.com"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>
          </div>
        </div>

        <!-- Section 2: Pipeline y Asignación -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-brand-border">
            <span>⚙️ Pipeline & Asignación de Responsable</span>
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Etapa Inicial</label>
              <select
                name="status"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
              >
                <option value="nuevo">Nuevo Lead</option>
                <option value="contactado">Contactado</option>
                <option value="cita_agendada">Cita Agendada</option>
                <option value="negociacion">Negociación</option>
                <option value="ganado">Ganado (Cliente)</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">
                Agente Responsable
                <span class="text-[10px] text-zinc-400 font-normal">(o Asignación Automática)</span>
              </label>
              <select
                name="assigned_to"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
              >
                <option value="auto">⚡ Asignación Automática (Round-Robin equilibrado)</option>
                ${agents.map((ag) => html`
                  <option value="${ag.id}" ${formData.assigned_to === ag.id ? 'selected' : ''}>
                    ${ag.name} (${ag.role})
                  </option>
                `)}
              </select>
            </div>
          </div>
        </div>

        <!-- Section 3: Metadatos Flexibles (Fitness Profile) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-2 border-b border-brand-border">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span>🏋️ Perfil Deportivo & Metadatos Flexibles (JSONB)</span>
            </h3>
            <span class="text-[11px] text-brand-orange font-medium">Segmentación y personalización IA</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Presupuesto Estimado ($ USD)</label>
              <input
                type="number"
                name="presupuesto"
                value="${formData.presupuesto || '120'}"
                placeholder="120"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
              <span class="text-[10px] text-zinc-500">≥$150 clasifica a Segmento A</span>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Programa / Producto de Interés</label>
              <input
                type="text"
                name="producto"
                value="${formData.producto || 'CrossFit Pro + Nutrición'}"
                placeholder="Ej. Membresía Anual / Pilates"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Objetivo Fitness Principal</label>
              <input
                type="text"
                name="objetivo"
                value="${formData.objetivo || 'Pérdida de grasa y tonificación'}"
                placeholder="Ej. Hipertrofia / Salud postural"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Ciudad</label>
              <input
                type="text"
                name="ciudad"
                value="${formData.ciudad || 'Ciudad de México'}"
                placeholder="Ciudad"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Sede / Gimnasio</label>
              <input
                type="text"
                name="sede"
                value="${formData.sede || 'Polanco'}"
                placeholder="Ej. Polanco / Roma Norte"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Horario Preferido</label>
              <input
                type="text"
                name="horario_preferido"
                value="${formData.horario_preferido || 'Mañanas 7:00 AM'}"
                placeholder="Mañanas / Noches"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>
          </div>
        </div>

        <!-- Section 4: Tags y Nota Inicial -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-brand-border">
            <span>🏷️ Etiquetas & Bitácora Inicial</span>
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">
                Etiquetas / Tags (separados por coma)
              </label>
              <input
                type="text"
                name="tags"
                value="${formData.tags || 'CrossFit, Nutrición, VIP'}"
                placeholder="Ej. CrossFit, Nutrición, Membresía VIP"
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
              <span class="text-[10px] text-zinc-500">Se convertirán en chips interactivos</span>
            </div>

            <div>
              <label class="block text-xs font-semibold text-zinc-300 mb-1">Nota inicial para bitácora</label>
              <input
                type="text"
                name="initial_note"
                value="${formData.initial_note || 'Prospecto interesado registrado manualmente.'}"
                placeholder="Escribe la primera nota del prospecto..."
                class="w-full px-3.5 py-2.5 bg-brand-card border border-brand-border rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
              />
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-4 border-t border-brand-border flex items-center justify-end gap-3">
          <a href="/leads" class="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition">
            Cancelar
          </a>
          <button
            type="submit"
            class="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-2"
          >
            <span>Guardar y Clasificar Lead</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </button>
        </div>

      </form>
    </div>
  `;
}
