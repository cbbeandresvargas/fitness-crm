import { For } from 'solid-js';
import { BOLIVIA_CITIES } from '../../lib/locations';
import { LEAD_STATUS_OPTIONS } from '../../lib/leadStatus';

export interface LeadFormFieldsProps {
  firstName: () => string;
  setFirstName: (v: string) => void;
  lastName: () => string;
  setLastName: (v: string) => void;
  phone: () => string;
  setPhone: (v: string) => void;
  email: () => string;
  setEmail: (v: string) => void;
  ci: () => string;
  setCi: (v: string) => void;
  status: () => string;
  setStatus: (v: string) => void;
  city: () => string;
  setCity: (v: string) => void;
}

/**
 * Campos compartidos del prospecto. Una única definición usada tanto por el
 * formulario de Nuevo Prospecto como por el modal de Editar Prospecto:
 * mismos campos, labels, placeholders, opciones y reglas requeridas/opcionales.
 */
export function LeadFormFields(props: LeadFormFieldsProps) {
  const inputClass =
    'w-full px-3 py-1.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent transition';
  const labelClass = 'block text-[11px] font-medium text-body-soft mb-1';

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label for="lead-field-firstname" class={labelClass}>Nombre *</label>
        <input
          id="lead-field-firstname"
          type="text"
          required
          aria-required="true"
          value={props.firstName()}
          onInput={(e) => props.setFirstName(e.currentTarget.value)}
          placeholder="Ej. Sofía"
          class={inputClass}
        />
      </div>

      <div>
        <label for="lead-field-lastname" class={labelClass}>Apellido *</label>
        <input
          id="lead-field-lastname"
          type="text"
          required
          aria-required="true"
          value={props.lastName()}
          onInput={(e) => props.setLastName(e.currentTarget.value)}
          placeholder="Ej. Morales"
          class={inputClass}
        />
      </div>

      <div>
        <label for="lead-field-phone" class={labelClass}>WhatsApp *</label>
        <input
          id="lead-field-phone"
          type="text"
          required
          aria-required="true"
          value={props.phone()}
          onInput={(e) => props.setPhone(e.currentTarget.value)}
          placeholder="+591 70000000"
          class={inputClass}
        />
      </div>

      <div>
        <label for="lead-field-email" class={labelClass}>Correo Electrónico (Opcional)</label>
        <input
          id="lead-field-email"
          type="email"
          value={props.email()}
          onInput={(e) => props.setEmail(e.currentTarget.value)}
          placeholder="sofia@gmail.com"
          class={inputClass}
        />
      </div>

      <div>
        <label for="lead-field-ci" class={labelClass}>CI (Opcional)</label>
        <input
          id="lead-field-ci"
          type="text"
          value={props.ci()}
          onInput={(e) => props.setCi(e.currentTarget.value)}
          placeholder="Ej. 123456789"
          class={inputClass}
        />
      </div>

      <div>
        <label for="lead-field-status" class={labelClass}>Estado del Lead</label>
        <select
          id="lead-field-status"
          value={props.status()}
          onChange={(e) => props.setStatus(e.currentTarget.value)}
          class={inputClass}
        >
          <For each={LEAD_STATUS_OPTIONS}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
          </For>
        </select>
      </div>

      <div class="md:col-span-2">
        <label for="lead-field-city" class={labelClass}>Ciudad (Opcional)</label>
        <select
          id="lead-field-city"
          value={props.city()}
          onChange={(e) => props.setCity(e.currentTarget.value)}
          class={inputClass}
        >
          <option value="">Sin especificar</option>
          <For each={BOLIVIA_CITIES}>
            {(city) => <option value={city}>{city}</option>}
          </For>
        </select>
      </div>
    </div>
  );
}
