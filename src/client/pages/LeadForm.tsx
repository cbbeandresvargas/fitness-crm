import { createSignal, onMount, For, Show } from 'solid-js';
import { useNavigate, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { User } from '../types';

export default function LeadForm() {
  const navigate = useNavigate();
  const { showToast } = useAuth();

  const [agents, setAgents] = createSignal<User[]>([]);
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal('');

  // Form fields
  const [fullName, setFullName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  const [email, setEmail] = createSignal('');
  const [presupuesto, setPresupuesto] = createSignal('150');
  const [producto, setProducto] = createSignal('CrossFit Pro');
  const [objetivo, setObjetivo] = createSignal('');
  const [sede, setSede] = createSignal('Polanco');
  const [ciudad, setCiudad] = createSignal('Ciudad de México');
  const [horario, setHorario] = createSignal('Mañanas 7:00 AM');
  const [assignedTo, setAssignedTo] = createSignal('auto');
  const [tags, setTags] = createSignal('CrossFit, Nuevo');
  const [notes, setNotes] = createSignal('');

  onMount(async () => {
    try {
      const res = await api.getAgents();
      setAgents(res.agents);
    } catch {}
  });

  const predictedSegment = () => {
    const p = Number(presupuesto()) || 0;
    if (p >= 150) {
      return {
        label: 'Segmento A (VIP)',
        desc: 'Presupuesto alto (≥ $150 USD) - Atención prioritaria',
        color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      };
    }
    if (p > 0 && p < 35) {
      return {
        label: 'Segmento D (Frío)',
        desc: 'Presupuesto por debajo del mínimo',
        color: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      };
    }
    return {
      label: 'Segmento B (Tibio)',
      desc: 'Seguimiento comercial estándar',
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    };
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName().trim() || !phone().trim()) {
      setErrorMessage('El nombre completo y el teléfono son requeridos.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.createLead({
        full_name: fullName().trim(),
        phone: phone().trim(),
        email: email().trim() || undefined,
        assigned_to: assignedTo(),
        tags: tags()
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        metadata: {
          presupuesto: Number(presupuesto()) || 0,
          producto: producto(),
          objetivo: objetivo().trim(),
          sede: sede(),
          ciudad: ciudad(),
          horario_preferido: horario(),
        },
        notes: notes().trim() || undefined,
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
            class="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-2xl transition"
          >
            ⬅️
          </A>
          <div>
            <h2 class="text-2xl font-black text-white">Registro de Nuevo Prospecto</h2>
            <p class="text-xs text-zinc-400">
              El motor evaluará automáticamente el segmento y asignará el asesor de forma balanceada.
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
          class="p-6 sm:p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-6 shadow-2xl"
        >
          {/* Datos Personales */}
          <div class="space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
              1. Datos de Contacto
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={fullName()}
                  onInput={(e) => setFullName(e.currentTarget.value)}
                  placeholder="Ej. Sofía Morales"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Teléfono / WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={phone()}
                  onInput={(e) => setPhone(e.currentTarget.value)}
                  placeholder="+52 55 1234 5678"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div class="md:col-span-2">
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Correo Electrónico (Opcional)
                </label>
                <input
                  type="email"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="sofia@gmail.com"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Interés Deportivo y Presupuesto con Live Segment Badge */}
          <div class="space-y-4 pt-4 border-t border-zinc-800">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
                2. Metas & Presupuesto
              </h3>
              {/* Live Badge Preview */}
              <div class={`px-3 py-1 rounded-full text-[11px] font-bold border ${predictedSegment().color}`}>
                <span>{predictedSegment().label}</span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Presupuesto USD / Mes
                </label>
                <input
                  type="number"
                  value={presupuesto()}
                  onInput={(e) => setPresupuesto(e.currentTarget.value)}
                  placeholder="150"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
                <span class="text-[10px] text-zinc-400 mt-1 block">
                  {predictedSegment().desc}
                </span>
              </div>

              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Programa de Interés
                </label>
                <select
                  value={producto()}
                  onChange={(e) => setProducto(e.currentTarget.value)}
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="CrossFit Pro">CrossFit Pro</option>
                  <option value="Pilates Reformer">Pilates Reformer</option>
                  <option value="Personal Trainer Élite">Personal Trainer Élite</option>
                  <option value="Entrenamiento Funcional">Entrenamiento Funcional</option>
                  <option value="Membresía General">Membresía General Gimnasio</option>
                  <option value="Pase Black Anual">Pase Black Anual</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Sede / Sucursal
                </label>
                <select
                  value={sede()}
                  onChange={(e) => setSede(e.currentTarget.value)}
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="Polanco">Polanco (CDMX)</option>
                  <option value="Roma Norte">Roma Norte (CDMX)</option>
                  <option value="Chapultepec">Chapultepec (Guadalajara)</option>
                  <option value="San Pedro">San Pedro (Monterrey)</option>
                  <option value="Juriquilla">Juriquilla (Querétaro)</option>
                </select>
              </div>

              <div class="md:col-span-3">
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Objetivo Deportivo Principal
                </label>
                <input
                  type="text"
                  value={objetivo()}
                  onInput={(e) => setObjetivo(e.currentTarget.value)}
                  placeholder="Ej. Bajar 6 kilos para su boda, ganar fuerza o rehabilitación de espalda"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Asignación y Notas */}
          <div class="space-y-4 pt-4 border-t border-zinc-800">
            <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
              3. Asignación & Notas
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Asesor / Coach
                </label>
                <select
                  value={assignedTo()}
                  onChange={(e) => setAssignedTo(e.currentTarget.value)}
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="auto">🤖 Balance Automático (Round-Robin)</option>
                  <For each={agents()}>
                    {(agent) => <option value={agent.id}>{agent.name}</option>}
                  </For>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Etiquetas (separadas por comas)
                </label>
                <input
                  type="text"
                  value={tags()}
                  onInput={(e) => setTags(e.currentTarget.value)}
                  placeholder="CrossFit, VIP, Instagram Ads"
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div class="md:col-span-2">
                <label class="block text-xs font-bold text-zinc-300 mb-1">
                  Nota Inicial
                </label>
                <textarea
                  rows={3}
                  value={notes()}
                  onInput={(e) => setNotes(e.currentTarget.value)}
                  placeholder="Detalles de la primera interacción o cómo conoció el gimnasio..."
                  class="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white focus:outline-none focus:border-orange-500"
                ></textarea>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <A
              href="/leads"
              class="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-2xl transition"
            >
              Cancelar
            </A>
            <button
              type="submit"
              disabled={submitting()}
              class="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-2xl transition shadow-orange-glow disabled:opacity-50 cursor-pointer"
            >
              {submitting() ? 'Registrando...' : 'Guardar Prospecto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
