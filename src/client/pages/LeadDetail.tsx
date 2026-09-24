import { createSignal, onMount, Show, For } from 'solid-js';
import { useParams, useNavigate, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Lead, ActivityLog, User, WhatsAppMessage, MessageTemplate } from '../types';

export default function LeadDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const { user, showToast } = useAuth();

  const [lead, setLead] = createSignal<Lead | null>(null);
  const [activities, setActivities] = createSignal<ActivityLog[]>([]);
  const [agents, setAgents] = createSignal<User[]>([]);
  const [templates, setTemplates] = createSignal<MessageTemplate[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);

  // Active Tab: 'chat' | 'history' | 'ai'
  const [activeTab, setActiveTab] = createSignal<'chat' | 'history' | 'ai'>('chat');

  // WhatsApp Chat State
  const [messages, setMessages] = createSignal<WhatsAppMessage[]>([]);
  const [chatInput, setChatInput] = createSignal('');
  const [sendingMsg, setSendingMsg] = createSignal(false);
  const [selectedImage, setSelectedImage] = createSignal<File | null>(null);
  const [imagePreview, setImagePreview] = createSignal<string | null>(null);
  const [previewZoomUrl, setPreviewZoomUrl] = createSignal<string | null>(null);

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

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = createSignal(false);
  const [editFullName, setEditFullName] = createSignal('');
  const [editPhone, setEditPhone] = createSignal('');
  const [editEmail, setEditEmail] = createSignal('');
  const [editPresupuesto, setEditPresupuesto] = createSignal('0');
  const [editProducto, setEditProducto] = createSignal('');
  const [editObjetivo, setEditObjetivo] = createSignal('');
  const [editSede, setEditSede] = createSignal('');
  const [editCiudad, setEditCiudad] = createSignal('');
  const [editHorario, setEditHorario] = createSignal('');
  const [savingEdit, setSavingEdit] = createSignal(false);

  const loadLead = async () => {
    try {
      setLoading(true);
      setNotFound(false);
      if (!params.id) return;

      const res = await api.getLead(params.id);
      setLead(res.lead);
      setActivities(res.activities);

      // Populate edit fields
      setEditFullName(res.lead.full_name);
      setEditPhone(res.lead.phone);
      setEditEmail(res.lead.email || '');
      setEditPresupuesto(String(res.lead.metadata.presupuesto || '0'));
      setEditProducto(res.lead.metadata.producto || '');
      setEditObjetivo(res.lead.metadata.objetivo || '');
      setEditSede(res.lead.metadata.sede || '');
      setEditCiudad(res.lead.metadata.ciudad || '');
      setEditHorario(res.lead.metadata.horario_preferido || '');

      // Load WhatsApp messages
      loadMessages();
    } catch (err: any) {
      setNotFound(true);
      showToast(err.message || 'Error cargando prospecto', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!params.id) return;
    try {
      const res = await api.getWhatsAppMessages(params.id);
      setMessages(res.messages || []);
    } catch (e) {
      console.warn('Error cargando mensajes de chat:', e);
    }
  };

  onMount(async () => {
    try {
      const [a, t] = await Promise.all([api.getAgents(), api.getTemplates()]);
      setAgents(a.agents);
      setTemplates(t.templates);
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
      setChatInput(res.message);
      showToast('Mensaje generado con Cloudflare Workers AI', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error generando mensaje con IA', 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSendChatMessage = async (e?: Event) => {
    if (e) e.preventDefault();
    const currentLead = lead();
    const text = chatInput().trim();
    const imageFile = selectedImage();

    if (!currentLead || (!text && !imageFile)) return;

    try {
      setSendingMsg(true);
      let mediaUrl: string | undefined = undefined;
      let messageType: 'text' | 'image' = 'text';

      if (imageFile) {
        messageType = 'image';
        const uploadRes = await api.uploadImage(imageFile);
        mediaUrl = uploadRes.media_url;
      }

      const res = await api.sendChatMessage(currentLead.id, {
        content: text || (imageFile ? 'Foto enviada' : ''),
        message_type: messageType,
        media_url: mediaUrl,
        sender: 'agent',
      });

      setMessages((prev) => [...prev, res.message]);
      setChatInput('');
      setSelectedImage(null);
      setImagePreview(null);
      showToast('Mensaje registrado en WhatsApp', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al enviar mensaje', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleImageSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleApplyTemplate = (content: string) => {
    const currentLead = lead();
    if (!currentLead) return;
    const parsed = content
      .replace(/{nombre}/gi, currentLead.full_name.split(' ')[0])
      .replace(/{producto}/gi, currentLead.metadata.producto || 'CrossFit Pro')
      .replace(/{ciudad}/gi, currentLead.metadata.ciudad || currentLead.metadata.sede || 'nuestro gimnasio')
      .replace(/{agente}/gi, user()?.name || 'Tu Coach');
    setChatInput(parsed);
  };

  const handleSaveEdit = async (e: Event) => {
    e.preventDefault();
    if (!lead()) return;

    try {
      setSavingEdit(true);
      const res = await api.updateLead(lead()!.id, {
        full_name: editFullName().trim(),
        phone: editPhone().trim(),
        email: editEmail().trim() || null,
        metadata: {
          ...lead()!.metadata,
          presupuesto: Number(editPresupuesto()) || 0,
          producto: editProducto(),
          objetivo: editObjetivo().trim(),
          sede: editSede(),
          ciudad: editCiudad(),
          horario_preferido: editHorario(),
        },
      });

      setLead(res.lead);
      setIsEditModalOpen(false);
      showToast('Datos del prospecto actualizados correctamente', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar datos', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteLead = async () => {
    const currentLead = lead();
    if (!currentLead) return;
    if (!confirm(`¿Eliminar a ${currentLead.full_name}? Se borrará el historial de WhatsApp y notas.`)) {
      return;
    }
    try {
      await api.deleteLead(currentLead.id);
      showToast('Prospecto eliminado con éxito', 'info');
      navigate('/leads', { replace: true });
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar prospecto', 'error');
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
      {/* Zoom Image Modal */}
      <Show when={previewZoomUrl()}>
        <div
          onClick={() => setPreviewZoomUrl(null)}
          class="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <div class="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewZoomUrl()!}
              alt="Visualización ampliada"
              class="w-full h-full object-contain rounded-2xl shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewZoomUrl(null)}
              class="absolute top-4 right-4 p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      </Show>

      {/* Edit Lead Modal */}
      <Show when={isEditModalOpen()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
              <h3 class="text-lg font-bold text-white flex items-center gap-2">
                <span>✏️</span>
                <span>Editar Información del Prospecto</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                class="text-zinc-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} class="space-y-4 text-xs">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={editFullName()}
                    onInput={(e) => setEditFullName(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Teléfono / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={editPhone()}
                    onInput={(e) => setEditPhone(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={editEmail()}
                    onInput={(e) => setEditEmail(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Presupuesto Mensual (USD)</label>
                  <input
                    type="number"
                    value={editPresupuesto()}
                    onInput={(e) => setEditPresupuesto(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Programa de Interés</label>
                  <input
                    type="text"
                    value={editProducto()}
                    onInput={(e) => setEditProducto(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-300 font-bold mb-1">Sede</label>
                  <input
                    type="text"
                    value={editSede()}
                    onInput={(e) => setEditSede(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label class="block text-zinc-300 font-bold mb-1">Objetivo del Prospecto</label>
                <textarea
                  rows={2}
                  value={editObjetivo()}
                  onInput={(e) => setEditObjetivo(e.currentTarget.value)}
                  class="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
                ></textarea>
              </div>

              <div class="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit()}
                  class="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition shadow-orange-glow disabled:opacity-50"
                >
                  {savingEdit() ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>

      {/* Loading state */}
      <Show when={loading()}>
        <div class="flex flex-col items-center justify-center p-24 text-zinc-500 space-y-3">
          <div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs">Cargando expediente del prospecto...</span>
        </div>
      </Show>

      {/* Not found state */}
      <Show when={!loading() && (notFound() || !lead())}>
        <div class="p-16 rounded-3xl bg-zinc-900 border border-zinc-800 text-center space-y-4 max-w-lg mx-auto shadow-2xl">
          <span class="text-4xl block">🔍</span>
          <h2 class="text-xl font-black text-white">Prospecto no encontrado</h2>
          <p class="text-xs text-zinc-400">
            El prospecto no existe o no tienes los permisos suficientes asignados para consultarlo.
          </p>
          <A
            href="/leads"
            class="inline-block px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition shadow-orange-glow"
          >
            ⬅️ Volver a la lista
          </A>
        </div>
      </Show>

      {/* Main Content */}
      <Show when={!loading() && lead()}>
        <div class="space-y-6 max-w-6xl mx-auto">
          {/* Header Bar */}
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div class="flex items-center gap-3.5">
              <A
                href="/leads"
                class="p-2.5 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-2xl transition"
                title="Volver a la lista"
              >
                ⬅️
              </A>
              <div>
                <div class="flex items-center gap-3">
                  <h2 class="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {lead()?.full_name}
                  </h2>
                  <span
                    class={`px-3 py-1 rounded-full text-xs font-extrabold border ${
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
                  Teléfono: <strong class="text-white">{lead()?.phone}</strong> • Registrado el{' '}
                  {new Date(lead()?.created_at || '').toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-zinc-700 transition cursor-pointer"
              >
                ✏️ Editar
              </button>

              <button
                type="button"
                onClick={handleRecalculateSegment}
                class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold border border-zinc-700 transition cursor-pointer"
                title="Recalcular segmento con reglas dinámicas"
              >
                🔄 Segmento
              </button>

              <a
                href={`https://wa.me/${lead()?.phone.replace(/^\+/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg"
              >
                <span>💬</span>
                <span>WhatsApp App</span>
              </a>

              <button
                type="button"
                onClick={handleDeleteLead}
                class="p-2 text-zinc-500 hover:text-red-400 rounded-xl hover:bg-red-950/40 transition cursor-pointer"
                title="Eliminar prospecto"
              >
                🗑️
              </button>
            </div>
          </div>

          {/* Grid de 2 Columnas */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Perfil y Metadatos (1 col) */}
            <div class="space-y-6">
              {/* Tarjeta de Estado y Asignación */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
                <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
                  Estado & Coach Asignado
                </h3>

                <div class="space-y-3">
                  <div>
                    <label class="block text-[11px] text-zinc-400 mb-1 font-semibold">
                      Fase en el Gimnasio
                    </label>
                    <select
                      value={lead()?.status}
                      onChange={(e) => handleStatusChange(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
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
                      Coach / Asesor
                    </label>
                    <select
                      value={lead()?.assigned_to || ''}
                      onChange={(e) => handleAssignAgent(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
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

              {/* Metadatos Deportivos */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-xl">
                <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
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
                      <span class="font-bold text-zinc-200 truncate block">
                        {lead()?.metadata.horario_preferido || 'Flexible'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Etiquetas / Tags */}
              <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-xl">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-orange-400">
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

                <div class="flex flex-wrap gap-1.5">
                  <For each={lead()?.tags}>
                    {(t) => (
                      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200">
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

                {/* Sugerencias de IA */}
                <Show when={suggestedTags().length > 0}>
                  <div class="p-3 bg-zinc-950 rounded-2xl border border-orange-500/20 space-y-2">
                    <span class="text-[11px] text-orange-400 font-bold block">
                      💡 Sugerencias de Workers AI:
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={suggestedTags()}>
                        {(st) => (
                          <button
                            type="button"
                            onClick={() => handleAddTag(st)}
                            class="px-2 py-0.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-xs font-medium border border-orange-500/30 transition cursor-pointer"
                          >
                            + #{st}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Formulario agregar tag */}
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

            {/* Columna Derecha: Pestañas de Chat WhatsApp, IA y Bitácora (2 cols) */}
            <div class="lg:col-span-2 space-y-6">
              {/* Tab Selector */}
              <div class="p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  class={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab() === 'chat'
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>💬</span>
                  <span>Chat WhatsApp ({messages().length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('ai')}
                  class={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab() === 'ai'
                      ? 'bg-orange-500 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>✨</span>
                  <span>Redactor IA Llama 3</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  class={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab() === 'history'
                      ? 'bg-zinc-800 text-white shadow-lg'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>📜</span>
                  <span>Bitácora ({activities().length})</span>
                </button>
              </div>

              {/* TAB 1: CHAT WHATSAPP EN VIVO (Texto e Imágenes) */}
              <Show when={activeTab() === 'chat'}>
                <div class="rounded-3xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col h-[600px] shadow-2xl">
                  {/* Chat Header */}
                  <div class="p-4 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center">
                        💬
                      </div>
                      <div>
                        <h4 class="font-bold text-white text-sm">{lead()?.full_name}</h4>
                        <p class="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                          <span>WhatsApp Conectado ({lead()?.phone})</span>
                        </p>
                      </div>
                    </div>

                    <a
                      href={`https://wa.me/${lead()?.phone.replace(/^\+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition"
                    >
                      Abrir en WhatsApp
                    </a>
                  </div>

                  {/* Messages Feed */}
                  <div class="flex-1 p-4 overflow-y-auto space-y-3 bg-zinc-950/40">
                    <Show
                      when={messages().length > 0}
                      fallback={
                        <div class="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 p-8 text-center">
                          <span class="text-3xl">💬</span>
                          <p class="text-xs font-semibold">Aún no hay mensajes en esta conversación.</p>
                          <p class="text-[11px] text-zinc-500">
                            Escribe abajo para enviar un mensaje o adjuntar una foto (comprobante, plan nutricional o de entrenamiento).
                          </p>
                        </div>
                      }
                    >
                      <For each={messages()}>
                        {(msg) => {
                          const isMe = msg.sender === 'agent';
                          return (
                            <div class={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div
                                class={`max-w-md p-3.5 rounded-2xl text-xs space-y-2 shadow-md ${
                                  isMe
                                    ? 'bg-emerald-700 text-white rounded-br-none'
                                    : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
                                }`}
                              >
                                {/* Image display if message_type is image */}
                                <Show when={msg.message_type === 'image' && msg.media_url}>
                                  <div class="rounded-xl overflow-hidden border border-black/20 bg-black/40">
                                    <img
                                      src={msg.media_url!}
                                      alt="Adjunto WhatsApp"
                                      onClick={() => setPreviewZoomUrl(msg.media_url!)}
                                      class="w-full max-h-56 object-cover cursor-pointer hover:opacity-90 transition"
                                    />
                                  </div>
                                </Show>

                                <p class="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                                <div class="flex items-center justify-end gap-1.5 text-[10px] opacity-80 pt-1">
                                  <span>
                                    {new Date(msg.created_at).toLocaleTimeString('es-ES', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  <Show when={isMe}>
                                    <span>
                                      {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                    </span>
                                  </Show>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </Show>
                  </div>

                  {/* Image attachment preview bar */}
                  <Show when={imagePreview()}>
                    <div class="px-4 py-2 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <img
                          src={imagePreview()!}
                          alt="Previsualización"
                          class="w-12 h-12 object-cover rounded-xl border border-zinc-700"
                        />
                        <div class="text-xs">
                          <p class="font-bold text-white truncate max-w-xs">{selectedImage()?.name}</p>
                          <p class="text-[10px] text-emerald-400">Listo para enviar como imagen</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        class="text-zinc-400 hover:text-white text-xs font-bold"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  </Show>

                  {/* Chat Input & Fast Actions */}
                  <div class="p-3 bg-zinc-950/95 border-t border-zinc-800 space-y-2">
                    {/* Quick Plantillas Dropdown / Chips */}
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                      <span class="text-zinc-500 shrink-0 font-bold">Plantillas:</span>
                      <For each={templates().slice(0, 3)}>
                        {(tmpl) => (
                          <button
                            type="button"
                            onClick={() => handleApplyTemplate(tmpl.content)}
                            class="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-800 shrink-0 truncate max-w-[150px] transition cursor-pointer"
                            title={tmpl.content}
                          >
                            {tmpl.title}
                          </button>
                        )}
                      </For>
                    </div>

                    <form onSubmit={handleSendChatMessage} class="flex items-center gap-2">
                      {/* Image Attachment Button */}
                      <label
                        class="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition cursor-pointer shrink-0"
                        title="Adjuntar imagen (comprobante, plan, etc.)"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          class="hidden"
                        />
                        📷
                      </label>

                      <input
                        type="text"
                        value={chatInput()}
                        onInput={(e) => setChatInput(e.currentTarget.value)}
                        placeholder="Escribe un mensaje de WhatsApp..."
                        class="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                      />

                      <button
                        type="submit"
                        disabled={sendingMsg() || (!chatInput().trim() && !selectedImage())}
                        class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition shadow-lg disabled:opacity-40 cursor-pointer shrink-0 flex items-center gap-1.5"
                      >
                        <span>{sendingMsg() ? 'Enviando...' : 'Enviar'}</span>
                        <span>🚀</span>
                      </button>
                    </form>
                  </div>
                </div>
              </Show>

              {/* TAB 2: REDACTOR DE WHATSAPP CON IA */}
              <Show when={activeTab() === 'ai'}>
                <div class="p-6 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-orange-950/20 border border-orange-500/30 space-y-4 shadow-xl">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <span class="text-xl">🤖</span>
                      <div>
                        <h3 class="text-base font-extrabold text-white">
                          Generador de WhatsApp con IA
                        </h3>
                        <p class="text-xs text-zinc-400">
                          Redacta mensajes persuasivos usando Cloudflare Workers AI (Llama 3.1)
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
                      onInput={(e) => {
                        setAiMessage(e.currentTarget.value);
                        setChatInput(e.currentTarget.value);
                      }}
                      placeholder="El mensaje generado aparecerá aquí..."
                      class="w-full p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
                    ></textarea>

                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('chat');
                          setChatInput(aiMessage());
                        }}
                        disabled={!aiMessage().trim()}
                        class="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer"
                      >
                        💬 Pegar en Chat en Vivo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const deepLink = `https://wa.me/${lead()?.phone.replace(/^\+/, '')}?text=${encodeURIComponent(aiMessage())}`;
                          window.open(deepLink, '_blank');
                        }}
                        disabled={!aiMessage().trim()}
                        class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition disabled:opacity-50 cursor-pointer"
                      >
                        🚀 Abrir en WhatsApp App
                      </button>
                    </div>
                  </div>
                </div>
              </Show>

              {/* TAB 3: BITÁCORA Y HISTORIAL */}
              <Show when={activeTab() === 'history'}>
                <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 shadow-xl">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">📜</span>
                      <h3 class="text-base font-bold text-white">Historial y Bitácora</h3>
                    </div>
                    <span class="text-xs text-zinc-400">
                      {activities().length} registros
                    </span>
                  </div>

                  {/* Formulario Nota */}
                  <form onSubmit={handleAddNote} class="space-y-3">
                    <textarea
                      rows={2}
                      value={newNote()}
                      onInput={(e) => setNewNote(e.currentTarget.value)}
                      placeholder="Escribe una nota rápida (ej: Vino a clase muestra, interesado en membresía anual)..."
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

                  {/* Feed */}
                  <div class="space-y-3 pt-4 border-t border-zinc-800/80 max-h-96 overflow-y-auto">
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
                                  ? '💬 WhatsApp'
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
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </Layout>
  );
}
