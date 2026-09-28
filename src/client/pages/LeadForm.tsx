import { createSignal, Show } from 'solid-js';
import { useNavigate, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function LeadForm() {
  const navigate = useNavigate();
  const { showToast } = useAuth();

  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

  // Form fields (FC workflow)
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [ci, setCi] = createSignal('');
  const [status, setStatus] = createSignal('nuevo');

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName().trim() || !lastName().trim() || !phone().trim()) {
      setErrorMessage('El nombre, el apellido y el WhatsApp son obligatorios.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.createLead({
        first_name: firstName().trim(),
        last_name: lastName().trim(),
        phone: phone().trim(),
        email: email().trim() || undefined,
        ci: ci().trim() || undefined,
        status: status(),
      });

      showToast(`¡Prospecto ${res.lead.full_name} registrado con éxito!`, 'success');
      navigate(`/leads/${res.lead.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al registrar prospecto');
      showToast(err.message || 'Error al registrar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Anotar Nuevo Prospecto">
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="flex items-center gap-3">
          <A
            href="/leads"
            class="p-2.5 bg-surface border border-edge hover:bg-elevate text-body-soft rounded-2xl transition"
          >
            ⬅️
          </A>
          <div>
            <h2 class="text-2xl font-black text-body">Registro de Nuevo Prospecto</h2>
            <p class="text-xs text-muted">
              El asesor se asigna automáticamente (Round-Robin) y el segmento lo calcula el motor de reglas.
            </p>
          </div>
        </div>

        <Show when={errorMessage()}>
          <div class="p-4 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs font-semibold flex items-center gap-3">
            <span class="text-base">⚠️</span>
            <span>{errorMessage()}</span>
          </div>
        </Show>

        <form
          onSubmit={handleSubmit}
          class="p-6 sm:p-8 rounded-3xl bg-surface border border-edge space-y-6 shadow-2xl"
        >
          {/* Datos del Prospecto */}
          <div class="space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-accent-text">
              Datos del Prospecto
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={firstName()}
                  onInput={(e) => setFirstName(e.currentTarget.value)}
                  placeholder="Ej. Sofía"
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  Apellido *
                </label>
                <input
                  type="text"
                  required
                  value={lastName()}
                  onInput={(e) => setLastName(e.currentTarget.value)}
                  placeholder="Ej. Morales"
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={phone()}
                  onInput={(e) => setPhone(e.currentTarget.value)}
                  placeholder="+52 55 1234 5678"
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  Correo Electrónico (Opcional)
                </label>
                <input
                  type="email"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="sofia@gmail.com"
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  CI (Opcional)
                </label>
                <input
                  type="text"
                  value={ci()}
                  onInput={(e) => setCi(e.currentTarget.value)}
                  placeholder="Ej. 123456789"
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-body-soft mb-1">
                  Estado
                </label>
                <select
                  value={status()}
                  onChange={(e) => setStatus(e.currentTarget.value)}
                  class="w-full px-4 py-2.5 bg-app border border-edge rounded-2xl text-xs text-body focus:outline-none focus:border-accent"
                >
                  <option value="nuevo">🌱 Nuevo</option>
                  <option value="contactado">💬 Contactado</option>
                  <option value="cita_agendada">📅 Cita Agendada</option>
                  <option value="negociacion">🤝 Negociación</option>
                  <option value="ganado">🏆 Ganado</option>
                  <option value="perdido">🛑 Perdido</option>
                </select>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-edge">
            <A
              href="/leads"
              class="px-5 py-2.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-bold rounded-2xl transition"
            >
              Cancelar
            </A>
            <button
              type="submit"
              disabled={submitting()}
              class="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl transition shadow-accent-glow disabled:opacity-50 cursor-pointer"
            >
              {submitting() ? 'Registrando...' : 'Guardar Prospecto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
