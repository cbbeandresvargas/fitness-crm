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
    <div class="max-w-2xl mx-auto space-y-6">
      
      <!-- Volver atrás -->
      <div>
        <a href="/leads" class="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1.5">
          <span>← Volver a la lista de personas</span>
        </a>
      </div>

      <div class="space-y-1">
        <h2 class="text-2xl font-black text-white">Anotar una Persona Interesada</h2>
        <p class="text-xs text-zinc-400">
          Solo llena los datos básicos para que no se te olvide contactarla
        </p>
      </div>

      <!-- Alerta si hay error -->
      ${error ? html`
        <div class="p-4 rounded-2xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-3">
          <span class="text-xl">⚠️</span>
          <span>${error}</span>
        </div>
      ` : ''}

      <!-- Alerta si ya existe el teléfono -->
      ${duplicateWarning ? html`
        <div class="p-5 rounded-2xl bg-amber-950/60 border border-amber-700 text-amber-200 text-xs space-y-2">
          <div class="flex items-center gap-2 font-bold text-sm">
            <span>⚠️</span>
            <span>¡Ese teléfono ya está registrado!</span>
          </div>
          <p>
            Ya tienes anotada a <strong>${duplicateWarning.full_name}</strong> con el número <strong>${duplicateWarning.phone}</strong>.
          </p>
          <a
            href="/leads/${duplicateWarning.id}"
            class="inline-block mt-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
          >
            Abrir la ficha de ${duplicateWarning.full_name} →
          </a>
        </div>
      ` : ''}

      <!-- Formulario Fácil y Espacioso -->
      <form action="/leads" method="POST" class="p-8 rounded-3xl bg-brand-surface border border-brand-border space-y-6 shadow-xl">
        
        <!-- Nombre -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-white uppercase tracking-wider">
            1. ¿Cómo se llama? *
          </label>
          <input
            type="text"
            name="full_name"
            required
            value="${formData.full_name || ''}"
            placeholder="Ej. Sofía Morales"
            class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
        </div>

        <!-- WhatsApp -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-white uppercase tracking-wider">
            2. Su número de WhatsApp o Teléfono *
          </label>
          <input
            type="tel"
            name="phone"
            required
            value="${formData.phone || ''}"
            placeholder="Ej. +52 55 1234 5678"
            class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
          <p class="text-[11px] text-zinc-500">El sistema te avisará si ya lo tenías registrado para no duplicarlo.</p>
        </div>

        <!-- Meta Fitness -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-white uppercase tracking-wider">
            3. ¿Qué meta u objetivo tiene?
          </label>
          <input
            type="text"
            name="objetivo"
            value="${formData.objetivo || 'Pérdida de peso y tonificación'}"
            placeholder="Ej. Bajar de peso, aumentar masa muscular, clases de CrossFit..."
            class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Presupuesto -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-white uppercase tracking-wider">
              4. Presupuesto estimado ($ USD)
            </label>
            <input
              type="number"
              name="presupuesto"
              value="${formData.presupuesto || '120'}"
              placeholder="120"
              class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
            />
          </div>

          <!-- Sede -->
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-white uppercase tracking-wider">
              5. Sede / Sucursal preferida
            </label>
            <input
              type="text"
              name="sede"
              value="${formData.sede || 'Polanco'}"
              placeholder="Ej. Polanco / Roma"
              class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
            />
          </div>
        </div>

        <!-- Asignar responsable -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-white uppercase tracking-wider">
            6. ¿Quién la va a atender?
          </label>
          <select
            name="assigned_to"
            class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
          >
            <option value="auto">⚡ Repartir automáticamente al asesor con menos trabajo</option>
            ${agents.map((ag) => html`
              <option value="${ag.id}" ${formData.assigned_to === ag.id ? 'selected' : ''}>
                Asignar directamente a: ${ag.name}
              </option>
            `)}
          </select>
        </div>

        <!-- Campos ocultos estándar para mantener compatibilidad -->
        <input type="hidden" name="status" value="nuevo"/>
        <input type="hidden" name="tags" value="Fitness, Nuevo"/>
        <input type="hidden" name="initial_note" value="Registrado para primer contacto."/>

        <!-- Botón Gigante de Guardado -->
        <div class="pt-4 border-t border-brand-border flex items-center justify-between gap-4">
          <a href="/leads" class="text-xs font-bold text-zinc-400 hover:text-white">
            Cancelar
          </a>
          <button
            type="submit"
            class="px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-sm font-extrabold transition shadow-orange-glow transform hover:scale-105"
          >
            ✅ Guardar y Abrir Ficha
          </button>
        </div>

      </form>
    </div>
  `;
}
