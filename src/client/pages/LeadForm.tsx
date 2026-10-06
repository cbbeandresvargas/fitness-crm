import { createSignal, Show } from 'solid-js';
import { useNavigate, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { LeadFormFields } from '../components/LeadFormFields';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { ArrowLeft, TriangleAlert } from 'lucide-solid';

export default function LeadForm() {
  const navigate = useNavigate();
  const { showToast } = useAuth();

  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

  // Form fields (FC workflow — misma definición compartida con Editar Prospecto)
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [ci, setCi] = createSignal('');
  const [status, setStatus] = createSignal('nuevo');
  const [city, setCity] = createSignal('');

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
        ciudad: city().trim() || undefined,
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
      <div class="max-w-2xl mx-auto space-y-4">
        <div class="flex items-center gap-3">
          <A
            href="/leads"
            class="p-2 bg-surface border border-edge hover:bg-elevate text-body-soft rounded-lg transition flex items-center justify-center"
            title="Volver a la lista"
          >
            <ArrowLeft class="w-4 h-4" />
          </A>
          <div>
            <h2 class="text-lg font-bold text-body">Registro de Nuevo Prospecto</h2>
            <p class="text-xs text-muted">
              El asesor se asigna automáticamente (Round-Robin) y el segmento lo calcula el motor de reglas.
            </p>
          </div>
        </div>

        <Show when={errorMessage()}>
          <div class="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium flex items-center gap-2.5">
            <TriangleAlert class="w-4 h-4 shrink-0 text-red-300" />
            <span>{errorMessage()}</span>
          </div>
        </Show>

        <form
          onSubmit={handleSubmit}
          class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-4"
        >
          {/* Datos del Prospecto (campos compartidos con Editar Prospecto) */}
          <div class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-accent-text">
              Datos del Prospecto
            </h3>

            <LeadFormFields
              firstName={firstName}
              setFirstName={setFirstName}
              lastName={lastName}
              setLastName={setLastName}
              phone={phone}
              setPhone={setPhone}
              email={email}
              setEmail={setEmail}
              ci={ci}
              setCi={setCi}
              status={status}
              setStatus={setStatus}
              city={city}
              setCity={setCity}
            />
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-edge">
            <A
              href="/leads"
              class="px-4 py-2 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-medium rounded-lg transition"
            >
              Cancelar
            </A>
            <button
              type="submit"
              disabled={submitting()}
              class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 cursor-pointer"
            >
              {submitting() ? 'Registrando...' : 'Guardar Prospecto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
