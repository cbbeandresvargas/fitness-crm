import { createSignal, onMount, Show, For } from 'solid-js';
import { useParams, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Lead, ActivityLog, User } from '../types';

export default function LeadDetail() {
  const params = useParams();
  const { user, showToast } = useAuth();

  const [lead, setLead] = createSignal<Lead | null>(null);
  const [activities, setActivities] = createSignal<ActivityLog[]>([]);
  const [agents, setAgents] = createSignal<User[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Note form
  const [newNote, setNewNote] = createSignal('');
  const [savingNote, setSavingNote] = createSignal(false);

  // AI WhatsApp generator
  const [aiTone, setAiTone] = createSignal('bienvenida');
  const [aiMessage, setAiMessage] = createSignal('');
  const [generatingAi, setGeneratingAi] = createSignal(false);

  // AI Briefing
  const [aiBriefing, setAiBriefing] = createSignal('');
  const [generatingBriefing, setGeneratingBriefing] = createSignal(false);

  // AI Suggested Tags
  const [suggestedTags, setSuggestedTags] = createSignal<string[]>([]);
  const [generatingTags, setGeneratingTags] = createSignal(false);
  const [newTagInput, setNewTagInput] = createSignal('');

  const loadLead = async () => {
    try {
      setLoading(true);
      if (!params.id) return;
      const res = await api.getLead(params.id);
      setLead(res.lead);
      setActivities(res.activities);
    } catch (err: any) {
      showToast(err.message || 'Error cargando prospecto', 'error');
    } finally {
      setLoading(false);
    }
  };

  onMount(async () => {
    try {
      const a = await api.getAgents();
      setAgents(a.agents);
    } catch {}
    loadLead();
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!lead()) return;
    try {
      const res = await api.updateLeadStatus(lead()!.id, newStatus);
      showToast(`Estado actualizado a ${newStatus}`, 'success');
      setLead((prev) => (prev ? { ...prev, status: newStatus as any, segment: res.segment as any } : null));
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al cambiar estado', 'error');
    }
  };

  const handleAssignAgent = async (agentId: string) => {
    if (!lead()) return;
    try {
      const res = await api.assignLead(lead()!.id, agentId);
      showToast(`Reasignado a ${res.assigned_name || 'nuevo asesor'}`, 'success');
      setLead((prev) => (prev ? { ...prev, assigned_to: res.assigned_to, assigned_name: res.assigned_name } : null));
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al asignar asesor', 'error');
    }
  };

  const handleRecalculateSegment = async () => {
    if (!lead()) return;
    try {
      const res = await api.recalculateSegment(lead()!.id);
      showToast(`Segmento recalculado: ${res.segment} (${res.reason})`, 'info');
      setLead((prev) => (prev ? { ...prev, segment: res.segment as any } : null));
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al recalcular segmento', 'error');
    }
  };

  const handleAddNote = async (e: Event) => {
    e.preventDefault();
    if (!newNote().trim() || !lead()) return;
    try {
      setSavingNote(true);
      await api.addNote(lead()!.id, newNote().trim());
      showToast('Nota registrada en la bitácora', 'success');
      setNewNote('');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar nota', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleGenerateAiMessage = async () => {
    if (!lead()) return;
    try {
      setGeneratingAi(true);
      const res = await api.generateAiMessage(lead()!.id, aiTone());
      setAiMessage(res.message);
      showToast('Mensaje generado con Cloudflare Workers AI', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error generando mensaje con IA', 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!lead() || !aiMessage().trim()) return;
    try {
      const res = await api.sendWhatsApp(lead()!.id, aiMessage().trim());
      window.open(res.deepLink, '_blank');
      showToast('WhatsApp registrado en la bitácora', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al enviar WhatsApp', 'error');
    }
  };

  const handleGenerateBriefing = async () => {
    if (!lead()) return;
    try {
      setGeneratingBriefing(true);
      const res = await api.generateAiBriefing(lead()!.id);
      setAiBriefing(res.briefing);
      showToast('Resumen ejecutivo generado', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error generando briefing', 'error');
    } finally {
      setGeneratingBriefing(false);
    }
  };

  const handleSuggestTags = async () => {
    if (!lead()) return;
    try {
      setGeneratingTags(true);
      const res = await api.suggestAiTags(lead()!.id);
      setSuggestedTags(res.suggestedTags || []);
      showToast('Etiquetas inteligentes sugeridas', 'info');
    } catch (err: any) {
      showToast(err.message || 'Error sugiriendo tags', 'error');
    } finally {
      setGeneratingTags(false);
    }
  };

  const handleAddTag = async (tag: string) => {
    if (!lead() || !tag.trim()) return;
    try {
      const res = await api.addTag(lead()!.id, tag.trim());
      setLead((prev) => (prev ? { ...prev, tags: res.tags } : null));
      setSuggestedTags((prev) => prev.filter((t) => t !== tag));
      setNewTagInput('');
      showToast(`Etiqueta #${tag} añadida`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error añadiendo tag', 'error');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!lead()) return;
    try {
      const res = await api.removeTag(lead()!.id, tag);
      setLead((prev) => (prev ? { ...prev, tags: res.tags } : null));
      showToast(`Etiqueta #${tag} eliminada`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Error eliminando tag', 'error');
    }
  };

  return (
    <Layout title={lead() ? `Ficha: ${lead()?.full_name}` : 'Detalle de Prospecto'}>
      <Show
        when={!loading() && lead()}
        fallback={
          <div class="flex items-center justify-center p-20 text-zinc-500">
            <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }
      >
        <div class="space-y-8 max-w-6xl mx-auto">
          {/* Header con botón para volver y resumen superior */}
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <A
                href="/leads"
                class="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-2xl transition"
              >
                ⬅️
              </A>
              <div>
                <div class="flex items-center gap-3">
                  <h2 class="text-2xl font-black text-white">{lead()?.full_name}</h2>
                  <span
                    class={`px-3 py-1 rounded-full text-xs font-black border ${
                      lead()?.segment === 'A'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : lead()?.segment === 'B'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                        : lead()?.segment === 'C'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    Segmento {lead()?.segment}
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">
                  Registrado el {new Date(lead()?.created_at || '').toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>

            {/* Acciones Rápidas Superior */}
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRecalculateSegment}
                class="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold border border-zinc-800 transition cursor-pointer"
                title="Evaluar presupuesto, inactividad y estado con reglas dinámicas"
              >
                🔄 Recalcular Segmento
              </button>

              <a
                href={`https://wa.me/${lead()?.phone.replace(/^\+/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <span>💬</span>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Grid de 2 Columnas: Datos y Asistente de IA */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Columna Izquierda: Información y Metadatos (1 col) */}
            <div class="space-y-6">
              {/* Tarjeta de Contacto y Estado */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
                <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Estado & Asignación
                </h3>

                <div class="space-y-3">
                  <div>
                    <label class="block text-[11px] text-zinc-400 mb-1 font-semibold">
                      Estado en el Gimnasio
                    </label>
                    <select
                      value={lead()?.status}
                      onChange={(e) => handleStatusChange(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="nuevo">🌱 Nuevo</option>
                      <option value="contactado">💬 Contactado</option>
                      <option value="cita_agendada">📅 Cita Agendada</option>
                      <option value="negociacion">🤝 Negociación</option>
                      <option value="ganado">🏆 Ganado / Inscrito</option>
                      <option value="perdido">🛑 Perdido</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-[11px] text-zinc-400 mb-1 font-semibold">
                      Coach / Asesor Asignado
                    </label>
                    <select
                      value={lead()?.assigned_to || ''}
                      onChange={(e) => handleAssignAgent(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    >
                      <option value="">Sin Asignar</option>
                      <option value="auto">🤖 Balance Automático (Round-Robin)</option>
                      <For each={agents()}>
                        {(agent) => <option value={agent.id}>{agent.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>

                <div class="pt-3 border-t border-zinc-800 space-y-2 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="text-zinc-400">Teléfono:</span>
                    <span class="font-bold text-white">{lead()?.phone}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-zinc-400">Correo:</span>
                    <span class="text-zinc-200">{lead()?.email || 'No proporcionado'}</span>
                  </div>
                </div>
              </div>

              {/* Metadatos Deportivos y Presupuesto */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Perfil Deportivo & Metas
                </h3>

                <div class="space-y-2 text-xs">
                  <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                    <span class="text-[11px] text-zinc-400">Presupuesto Mensual:</span>
                    <p class="text-lg font-black text-emerald-400">
                      ${lead()?.metadata.presupuesto || 0} USD
                    </p>
                  </div>

                  <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                    <span class="text-[11px] text-zinc-400">Programa de Interés:</span>
                    <p class="font-bold text-white">
                      {lead()?.metadata.producto || 'Membresía General'}
                    </p>
                  </div>

                  <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                    <span class="text-[11px] text-zinc-400">Objetivo del Prospecto:</span>
                    <p class="text-zinc-200">
                      {lead()?.metadata.objetivo || 'Acondicionamiento físico general'}
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80">
                      <span class="text-[11px] text-zinc-400 block">Sede:</span>
                      <span class="font-bold text-zinc-200">{lead()?.metadata.sede || 'Principal'}</span>
                    </div>
                    <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80">
                      <span class="text-[11px] text-zinc-400 block">Horario:</span>
                      <span class="font-bold text-zinc-200">
                        {lead()?.metadata.horario_preferido || 'Flexible'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Etiquetas / Tags */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Etiquetas
                  </h3>
                  <button
                    type="button"
                    onClick={handleSuggestTags}
                    disabled={generatingTags()}
                    class="text-xs text-orange-400 hover:underline font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {generatingTags() ? 'Analizando...' : '✨ Sugerir con IA'}
                  </button>
                </div>

                <div class="flex flex-wrap gap-2">
                  <For each={lead()?.tags}>
                    {(t) => (
                      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200">
                        <span>#{t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          class="hover:text-red-400 transition cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </For>
                </div>

                {/* Sugerencias de IA si las hay */}
                <Show when={suggestedTags().length > 0}>
                  <div class="p-3 bg-zinc-950 rounded-2xl border border-orange-500/20 space-y-2">
                    <span class="text-[11px] text-orange-400 font-bold block">
                      💡 Sugerencias de Llama 3:
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={suggestedTags()}>
                        {(st) => (
                          <button
                            type="button"
                            onClick={() => handleAddTag(st)}
                            class="px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs font-medium border border-orange-500/30 transition cursor-pointer"
                          >
                            + #{st}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Agregar tag manual */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTag(newTagInput());
                  }}
                  class="flex items-center gap-2 pt-2"
                >
                  <input
                    type="text"
                    value={newTagInput()}
                    onInput={(e) => setNewTagInput(e.currentTarget.value)}
                    placeholder="Nueva etiqueta..."
                    class="flex-1 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition"
                  >
                    Añadir
                  </button>
                </form>
              </div>
            </div>

            {/* Columna Derecha: IA + Bitácora (2 cols) */}
            <div class="lg:col-span-2 space-y-6">
              {/* Asistente de IA: Redactor de WhatsApp */}
              <div class="p-6 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-orange-950/20 border border-orange-500/30 space-y-4 shadow-xl">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="text-xl">🤖</span>
                    <div>
                      <h3 class="text-base font-extrabold text-white">
                        Generador de WhatsApp con IA
                      </h3>
                      <p class="text-xs text-zinc-400">
                        Redacta mensajes irresistibles usando Cloudflare Workers AI (Llama 3.1)
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateBriefing}
                    disabled={generatingBriefing()}
                    class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl transition border border-zinc-700 disabled:opacity-50 cursor-pointer"
                  >
                    {generatingBriefing() ? 'Generando...' : '📄 Resumen Ejecutivo IA'}
                  </button>
                </div>

                {/* Briefing expandible */}
                <Show when={aiBriefing()}>
                  <div class="p-4 rounded-2xl bg-zinc-950/80 border border-orange-500/40 text-xs space-y-1.5 animate-fade-in">
                    <span class="font-extrabold text-orange-400 block">
                      📌 Resumen Ejecutivo del Prospecto:
                    </span>
                    <p class="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {aiBriefing()}
                    </p>
                  </div>
                </Show>

                {/* Selector de Tono */}
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs text-zinc-400 font-bold">Tono del mensaje:</span>
                  {[
                    { id: 'bienvenida', label: '👋 Bienvenida & Cortesía' },
                    { id: 'seguimiento', label: '🏋️ Recordatorio / Cita' },
                    { id: 'cierre', label: '🔥 Urgencia & Cierre' },
                    { id: 'reactivacion', label: '⏳ Reactivación Inactivo' },
                  ].map((t) => (
                    <button
                      type="button"
                      onClick={() => setAiTone(t.id)}
                      class={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                        aiTone() === t.id
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Botón de Generación y Textarea */}
                <div class="space-y-3">
                  <button
                    type="button"
                    onClick={handleGenerateAiMessage}
                    disabled={generatingAi()}
                    class="w-full py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold text-xs rounded-2xl shadow-orange-glow transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>✨</span>
                    <span>
                      {generatingAi()
                        ? 'Redactando con Cloudflare Workers AI...'
                        : 'Generar Mensaje Personalizado'}
                    </span>
                  </button>

                  <textarea
                    rows={4}
                    value={aiMessage()}
                    onInput={(e) => setAiMessage(e.currentTarget.value)}
                    placeholder="El mensaje generado aparecerá aquí. Puedes editarlo libremente antes de enviar..."
                    class="w-full p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
                  ></textarea>

                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={!aiMessage().trim()}
                    class="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm rounded-2xl shadow-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>🚀</span>
                    <span>Enviar a WhatsApp ({lead()?.phone}) y Registrar Bitácora</span>
                  </button>
                </div>
              </div>

              {/* Bitácora de Actividades y Notas */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">📜</span>
                    <h3 class="text-base font-bold text-white">Historial y Bitácora</h3>
                  </div>
                  <span class="text-xs text-zinc-400">
                    {activities().length} registros
                  </span>
                </div>

                {/* Formulario para Agregar Nota Rápida */}
                <form onSubmit={handleAddNote} class="space-y-3">
                  <textarea
                    rows={2}
                    value={newNote()}
                    onInput={(e) => setNewNote(e.currentTarget.value)}
                    placeholder="Escribe una nota rápida (ej: Vino a clase muestra, le gustó el CrossFit)..."
                    class="w-full p-3.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
                  ></textarea>
                  <div class="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNote() || !newNote().trim()}
                      class="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                    >
                      {savingNote() ? 'Guardando...' : '➕ Anotar en Bitácora'}
                    </button>
                  </div>
                </form>

                {/* Feed de Actividades */}
                <div class="space-y-3 pt-4 border-t border-zinc-800/80">
                  <Show
                    when={activities().length > 0}
                    fallback={
                      <div class="p-8 text-center text-zinc-500 text-xs">
                        No hay actividades previas registradas.
                      </div>
                    }
                  >
                    <For each={activities()}>
                      {(act) => (
                        <div class="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                          <div class="flex items-center justify-between">
                            <span class="px-2 py-0.5 rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-300 uppercase tracking-wide">
                              {act.action_type === 'whatsapp_sent'
                                ? '💬 WhatsApp Enviado'
                                : act.action_type === 'status_change'
                                ? '🔄 Estado'
                                : act.action_type === 'segment_change'
                                ? '📊 Segmento'
                                : act.action_type === 'ai_generated'
                                ? '✨ Asistente IA'
                                : '📝 Nota'}
                            </span>
                            <span class="text-[10px] text-zinc-500">
                              {new Date(act.created_at).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>
                          <p class="text-xs text-zinc-200 whitespace-pre-wrap">{act.details}</p>
                          <div class="text-[10px] text-zinc-400 font-medium">
                            Por: {act.user_name || 'Sistema'}
                          </div>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Layout>
  );
}
