import { createSignal, onMount, Show, For } from 'solid-js';
import { useParams, useNavigate, A } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { LeadFormFields } from '../components/LeadFormFields';
import { SegmentBadge } from '../components/SegmentBadge';
import { cityFromMetadata } from '../../lib/locations';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Lead, ActivityLog, User, WhatsAppMessage, MessageTemplate, Activity, LeadInterest } from '../types';
import {
  Send,
  Bot,
  Image as ImageIcon,
  Sparkles,
  MessageSquare,
  Plus,
  FileText,
  Check,
  CheckCheck,
  RefreshCw,
  ExternalLink,
  History,
  Activity as ActivityIcon,
} from 'lucide-solid';

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

  // Edit Modal State (mismos campos compartidos que el formulario de Nuevo Prospecto)
  const [isEditModalOpen, setIsEditModalOpen] = createSignal(false);
  const [editFirstName, setEditFirstName] = createSignal('');
  const [editLastName, setEditLastName] = createSignal('');
  const [editPhone, setEditPhone] = createSignal('');
  const [editEmail, setEditEmail] = createSignal('');
  const [editCi, setEditCi] = createSignal('');
  const [editStatus, setEditStatus] = createSignal('nuevo');
  const [editCity, setEditCity] = createSignal('');
  const [savingEdit, setSavingEdit] = createSignal(false);

  const loadLead = async () => {
    try {
      setLoading(true);
      setNotFound(false);
      if (!params.id) return;

      const res = await api.getLead(params.id);
      setLead(res.lead);
      setActivities(res.activities);
      setInterests(res.interests || []);

      // Populate edit fields (mismos campos que el formulario de nuevo prospecto)
      const meta = res.lead.metadata || {};
      const nameParts = res.lead.full_name.trim().split(/\s+/);
      setEditFirstName(meta.first_name || nameParts[0] || '');
      setEditLastName(meta.last_name || nameParts.slice(1).join(' ') || '');
      setEditPhone(res.lead.phone);
      setEditEmail(res.lead.email || '');
      setEditCi(meta.ci !== undefined && meta.ci !== null ? String(meta.ci) : '');
      setEditStatus(res.lead.status);
      setEditCity(cityFromMetadata(meta));

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

      try {
        await api.sendWhatsAppDirect(currentLead.id, text, mediaUrl);
      } catch {
        await api.sendChatMessage(currentLead.id, {
          content: text || (imageFile ? 'Foto enviada' : ''),
          message_type: messageType,
          media_url: mediaUrl,
          sender: 'agent',
        });
      }

      const chatRes = await api.getWhatsAppChat(currentLead.id);
      setMessages(chatRes.messages || []);
      setChatInput('');
      setSelectedImage(null);
      setImagePreview(null);
      showToast('Mensaje enviado por WhatsApp Cloud API v25.0', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error al enviar mensaje', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleToggleLeadAi = async (resumeHandoff = false) => {
    const currentLead = lead();
    if (!currentLead) return;
    try {
      const res = await api.toggleLeadAi(currentLead.id, {
        enabled: resumeHandoff ? true : !(currentLead.ai_enabled === 1),
        resumeHandoff,
      });
      setLead({
        ...currentLead,
        ai_enabled: res.ai_enabled ? 1 : 0,
        handoff_at: res.is_handoff ? new Date().toISOString() : null,
      });
      showToast(res.ai_enabled ? 'IA de ventas activada para este chat' : 'IA pausada, control manual tomado', 'success');
      loadLead();
    } catch (err: any) {
      showToast(err.message || 'Error alternando IA', 'error');
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
      .replace(/{ciudad}/gi, cityFromMetadata(currentLead.metadata) || 'nuestro gimnasio')
      .replace(/{agente}/gi, user()?.name || 'Tu Coach');
    setChatInput(parsed);
  };

  const handleSaveEdit = async (e: Event) => {
    e.preventDefault();
    const currentLead = lead();
    if (!currentLead) return;

    if (!editFirstName().trim() || !editLastName().trim() || !editPhone().trim()) {
      showToast('El nombre, el apellido y el WhatsApp son obligatorios.', 'error');
      return;
    }

    try {
      setSavingEdit(true);

      // Estado del Lead por el mecanismo existente (recalcula segmento + bitácora)
      if (editStatus() !== currentLead.status) {
        await api.updateLeadStatus(currentLead.id, editStatus());
      }

      const res = await api.updateLead(currentLead.id, {
        first_name: editFirstName().trim(),
        last_name: editLastName().trim(),
        phone: editPhone().trim(),
        email: editEmail().trim() || null,
        ci: editCi().trim(),
        ciudad: editCity().trim(),
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

  // Actividades de interés (catálogo central, relación N:M con el prospecto)
  const [interests, setInterests] = createSignal<LeadInterest[]>([]);
  const [activityCatalog, setActivityCatalog] = createSignal<Activity[]>([]);
  const [showActivityPicker, setShowActivityPicker] = createSignal(false);
  const [activitySearch, setActivitySearch] = createSignal('');
  const [activityBusy, setActivityBusy] = createSignal(false);

  const loadActivities = async () => {
    try {
      const res = await api.getActivities();
      setActivityCatalog(res.activities || []);
    } catch {}
  };

  const handleToggleActivityPicker = async () => {
    const next = !showActivityPicker();
    setShowActivityPicker(next);
    setActivitySearch('');
    if (next && activityCatalog().length === 0) {
      await loadActivities();
    }
  };

  const handleAddInterest = async (activityId: string) => {
    if (!lead() || activityBusy()) return;
    try {
      setActivityBusy(true);
      const res = await api.addLeadActivity(lead()!.id, { activity_id: activityId });
      setInterests((prev) => [...prev, res.interest]);
      showToast(`Actividad "${res.interest.name}" añadida`, 'success');
      loadActivities();
    } catch (err: any) {
      showToast(err.message || 'Error añadiendo actividad', 'error');
    } finally {
      setActivityBusy(false);
    }
  };

  // Flujo único: si no existe, se crea en el catálogo y se asocia de una vez
  const handleCreateAndAssignInterest = async (name: string) => {
    if (!lead() || !name.trim() || activityBusy()) return;
    try {
      setActivityBusy(true);
      const res = await api.addLeadActivity(lead()!.id, { name: name.trim() });
      setInterests((prev) => [...prev, res.interest]);
      setActivitySearch('');
      showToast(
        res.createdNew
          ? `Actividad "${res.interest.name}" creada en el catálogo y asociada`
          : `Se asoció la actividad existente "${res.interest.name}"`,
        'success'
      );
      loadActivities();
    } catch (err: any) {
      showToast(err.message || 'Error creando actividad', 'error');
    } finally {
      setActivityBusy(false);
    }
  };

  const handleRemoveInterest = async (activityId: string) => {
    if (!lead() || activityBusy()) return;
    try {
      setActivityBusy(true);
      const res = await api.removeLeadActivity(lead()!.id, activityId);
      setInterests((prev) => prev.filter((i) => i.id !== res.removedActivityId));
      showToast('Actividad retirada de este prospecto', 'info');
      loadActivities();
    } catch (err: any) {
      showToast(err.message || 'Error retirando actividad', 'error');
    } finally {
      setActivityBusy(false);
    }
  };

  const filteredActivities = () => {
    const q = activitySearch().trim().toLowerCase();
    const assigned = new Set(interests().map((i) => i.id));
    return activityCatalog()
      .filter((a) => a.is_active && (!q || a.name.toLowerCase().includes(q)))
      .map((a) => ({ ...a, alreadyAssigned: assigned.has(a.id) }));
  };

  // "+ Crear" sólo cuando la búsqueda no coincide exactamente con algo del catálogo
  const canCreateFromSearch = () => {
    const q = activitySearch().trim();
    if (!q) return false;
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    return !activityCatalog().some((a) => norm(a.name) === norm(q));
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
              class="absolute top-4 right-4 p-2.5 rounded-full bg-surface/80 hover:bg-elevate text-body font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      </Show>

      {/* Edit Lead Modal */}
      <Show when={isEditModalOpen()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-surface border border-edge rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl">
            <div class="flex items-center justify-between border-b border-edge pb-4">
              <h3 class="text-lg font-bold text-body flex items-center gap-2">
                <span>✏️</span>
                <span>Editar Información del Prospecto</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                class="text-muted hover:text-body p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} class="space-y-4 text-xs">
              {/* Campos compartidos con el formulario de Nuevo Prospecto
                  (mismos fields, labels, opciones y reglas de validación) */}
              <LeadFormFields
                firstName={editFirstName}
                setFirstName={setEditFirstName}
                lastName={editLastName}
                setLastName={setEditLastName}
                phone={editPhone}
                setPhone={setEditPhone}
                email={editEmail}
                setEmail={setEditEmail}
                ci={editCi}
                setCi={setEditCi}
                status={editStatus}
                setStatus={setEditStatus}
                city={editCity}
                setCity={setEditCity}
              />

              <div class="flex justify-end gap-3 pt-3 border-t border-edge">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  class="px-4 py-2 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit()}
                  class="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold transition shadow-accent-glow disabled:opacity-50"
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
        <div class="flex flex-col items-center justify-center p-24 text-muted space-y-3">
          <div class="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs">Cargando expediente del prospecto...</span>
        </div>
      </Show>

      {/* Not found state */}
      <Show when={!loading() && (notFound() || !lead())}>
        <div class="p-16 rounded-3xl bg-surface border border-edge text-center space-y-4 max-w-lg mx-auto shadow-2xl">
          <span class="text-4xl block">🔍</span>
          <h2 class="text-xl font-black text-body">Prospecto no encontrado</h2>
          <p class="text-xs text-muted">
            El prospecto no existe o no tienes los permisos suficientes asignados para consultarlo.
          </p>
          <A
            href="/leads"
            class="inline-block px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition shadow-accent-glow"
          >
            ⬅️ Volver a la lista
          </A>
        </div>
      </Show>

      {/* Main Content */}
      <Show when={!loading() && lead()}>
        <div class="space-y-6 max-w-6xl mx-auto">
          {/* Header Bar */}
          <div class="p-6 rounded-3xl bg-surface border border-edge flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div class="flex items-center gap-3.5">
              <A
                href="/leads"
                class="p-2.5 bg-app border border-edge hover:bg-elevate text-body-soft rounded-2xl transition"
                title="Volver a la lista"
              >
                ⬅️
              </A>
              <div>
                <div class="flex items-center gap-3 flex-wrap">
                  <h2 class="text-xl sm:text-2xl font-black text-body tracking-tight">
                    {lead()?.full_name}
                  </h2>
                  <SegmentBadge segment={lead()?.segment} />
                </div>
                <p class="text-xs text-muted mt-0.5">
                  Teléfono: <strong class="text-body">{lead()?.phone}</strong> • Registrado el{' '}
                  {new Date(lead()?.created_at || '').toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(true)}
                class="px-3 py-2 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl text-xs font-semibold border border-edge-strong transition cursor-pointer"
              >
                ✏️ Editar
              </button>

              <button
                type="button"
                onClick={handleRecalculateSegment}
                class="px-3 py-2 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl text-xs font-semibold border border-edge-strong transition cursor-pointer"
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
                class="p-2 text-muted hover:text-red-400 rounded-xl hover:bg-red-950/40 transition cursor-pointer"
                title="Eliminar prospecto"
              >
                🗑️
              </button>
            </div>
          </div>

          {/* Grid de 2 Columnas */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Estado, contacto y actividades (1 col) */}
            <div class="space-y-6">
              {/* Tarjeta de Estado y Asignación */}
              <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
                <h3 class="text-xs font-bold uppercase tracking-wider text-accent-text">
                  Estado & Coach Asignado
                </h3>

                <div class="space-y-3">
                  <div>
                    <label class="block text-[11px] text-muted mb-1 font-semibold">
                      Fase en el Gimnasio
                    </label>
                    <select
                      value={lead()?.status}
                      onChange={(e) => handleStatusChange(e.currentTarget.value)}
                      class="w-full bg-app border border-edge rounded-xl px-3 py-2 text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="nuevo">🌱 Nuevo</option>
                      <option value="contactado">💬 Contactado</option>
                      <option value="negociacion">🤝 Negociación</option>
                      <option value="ganado">🏆 Ganado / Inscrito</option>
                      <option value="perdido">🛑 Perdido</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-[11px] text-muted mb-1 font-semibold">
                      Coach / Asesor
                    </label>
                    <select
                      value={lead()?.assigned_to || ''}
                      onChange={(e) => handleAssignAgent(e.currentTarget.value)}
                      class="w-full bg-app border border-edge rounded-xl px-3 py-2 text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                    >
                      <option value="">Sin Asignar</option>
                      <option value="auto">🤖 Balance Automático (Round-Robin)</option>
                      <For each={agents()}>
                        {(agent) => <option value={agent.id}>{agent.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>

                <div class="pt-3 border-t border-edge space-y-2 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="text-muted">Teléfono:</span>
                    <span class="font-bold text-body">{lead()?.phone}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted">Correo:</span>
                    <span class="text-body-soft">{lead()?.email || 'No proporcionado'}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted">Ciudad:</span>
                    <span class="text-body-soft">
                      {cityFromMetadata(lead()?.metadata) || (
                        <span class="text-muted">—</span>
                      )}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-muted">Estado de Membresía:</span>
                    <Show
                      when={lead()?.metadata?.estado_membresia}
                      fallback={<span class="text-muted">Sin dato</span>}
                    >
                      <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-violet-500/20 text-violet-400 border border-violet-500/40">
                        {lead()?.metadata?.estado_membresia}
                        <Show when={lead()?.metadata?.cantidad_membresias !== undefined}>
                          <span class="text-violet-400/80"> · {lead()?.metadata?.cantidad_membresias}</span>
                        </Show>
                      </span>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Actividades de interés (catálogo central N:M) */}
              <div class="p-6 rounded-3xl bg-surface border border-edge space-y-3 shadow-xl">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-accent-text">
                    Actividades de interés
                  </h3>
                  <button
                    type="button"
                    onClick={handleToggleActivityPicker}
                    class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-[11px] font-bold rounded-xl transition cursor-pointer"
                  >
                    {showActivityPicker() ? '✕ Cerrar' : '+ Agregar actividad'}
                  </button>
                </div>

                <Show
                  when={interests().length > 0}
                  fallback={
                    <p class="text-xs text-muted">Sin actividades de interés registradas.</p>
                  }
                >
                  <div class="flex flex-wrap gap-1.5">
                    <For each={interests()}>
                      {(interest) => (
                        <span
                          class={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold transition ${
                            interest.is_active
                              ? 'bg-accent/20 border-accent/40 text-accent-text'
                              : 'bg-elevate border-edge-strong text-muted'
                          }`}
                          title={
                            interest.is_active
                              ? 'Quitar de este prospecto (la actividad permanece en el catálogo)'
                              : 'Eliminada del catálogo (atenuada)'
                          }
                        >
                          <span>{interest.name}</span>
                          <Show when={interest.is_active}>
                            <button
                              type="button"
                              onClick={() => handleRemoveInterest(interest.id)}
                              disabled={activityBusy()}
                              class="hover:text-red-400 transition cursor-pointer disabled:opacity-50"
                            >
                              ✕
                            </button>
                          </Show>
                        </span>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Selector y creador en un solo flujo */}
                <Show when={showActivityPicker()}>
                  <div class="p-3 bg-app rounded-2xl border border-edge space-y-2">
                    <input
                      type="text"
                      value={activitySearch()}
                      onInput={(e) => setActivitySearch(e.currentTarget.value)}
                      placeholder="Buscar actividad... (ej. Yoga)"
                      class="w-full px-3 py-2 bg-surface border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                    />

                    <div class="max-h-44 overflow-y-auto space-y-1">
                      <For each={filteredActivities()}>
                        {(act) => (
                          <button
                            type="button"
                            onClick={() => handleAddInterest(act.id)}
                            disabled={act.alreadyAssigned || activityBusy()}
                            class={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                              act.alreadyAssigned
                                ? 'bg-elevate/60 text-muted cursor-not-allowed'
                                : 'bg-surface border border-edge hover:border-accent/50 text-body-soft cursor-pointer'
                            }`}
                          >
                            <span class="font-semibold">{act.name}</span>
                            <span class="text-[10px] text-muted">
                              {act.alreadyAssigned
                                ? '✓ ya asociada'
                                : `${act.prospect_count || 0} prospectos`}
                            </span>
                          </button>
                        )}
                      </For>

                      <Show when={canCreateFromSearch()}>
                        <button
                          type="button"
                          onClick={() => handleCreateAndAssignInterest(activitySearch().trim())}
                          disabled={activityBusy()}
                          class="w-full text-left px-3 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent-text text-xs font-bold transition cursor-pointer"
                        >
                          + Crear "{activitySearch().trim()}" y asociarla a este prospecto
                        </button>
                      </Show>

                      <Show when={filteredActivities().length === 0 && !canCreateFromSearch()}>
                        <p class="text-[11px] text-muted px-1">Sin resultados en el catálogo.</p>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>

              {/* Etiquetas / Tags */}
              <div class="p-6 rounded-3xl bg-surface border border-edge space-y-3 shadow-xl">
                <div class="flex items-center justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-accent-text">
                    Etiquetas
                  </h3>
                  <button
                    type="button"
                    onClick={handleSuggestTags}
                    disabled={generatingTags()}
                    class="text-xs text-accent-text hover:underline font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {generatingTags() ? 'Analizando...' : '✨ Sugerir con IA'}
                  </button>
                </div>

                <div class="flex flex-wrap gap-1.5">
                  <For each={lead()?.tags}>
                    {(t) => (
                      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-elevate border border-edge-strong text-xs font-semibold text-body-soft">
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
                  <div class="p-3 bg-app rounded-2xl border border-accent/20 space-y-2">
                    <span class="text-[11px] text-accent-text font-bold block">
                      💡 Sugerencias de Workers AI:
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={suggestedTags()}>
                        {(st) => (
                          <button
                            type="button"
                            onClick={() => handleAddTag(st)}
                            class="px-2 py-0.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent-text text-xs font-medium border border-accent/30 transition cursor-pointer"
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
                    class="flex-1 px-3 py-1.5 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    class="px-3 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl text-xs font-bold transition"
                  >
                    Añadir
                  </button>
                </form>
              </div>
            </div>

            {/* Columna Derecha: Pestañas de Chat WhatsApp, IA y Bitácora (2 cols) */}
            <div class="lg:col-span-2 space-y-6">
              {/* Tab Selector */}
              <div class="p-1.5 bg-surface border border-edge rounded-2xl flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  class={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab() === 'chat'
                      ? 'bg-emerald-600 text-white shadow-lg'
                      : 'text-muted hover:text-body'
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
                      ? 'bg-accent text-white shadow-lg'
                      : 'text-muted hover:text-body'
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
                      ? 'bg-elevate text-body shadow-lg'
                      : 'text-muted hover:text-body'
                  }`}
                >
                  <span>📜</span>
                  <span>Bitácora ({activities().length})</span>
                </button>
              </div>

              {/* TAB 1: CHAT WHATSAPP EN VIVO (Texto e Imágenes) */}
              <Show when={activeTab() === 'chat'}>
                <div class="rounded-3xl bg-surface border border-edge overflow-hidden flex flex-col h-[600px] shadow-2xl">
                  {/* Chat Header */}
                  <div class="p-4 bg-app/80 border-b border-edge flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold flex items-center justify-center">
                        💬
                      </div>
                      <div>
                        <h4 class="font-bold text-body text-sm flex items-center gap-2">
                          <span>{lead()?.full_name}</span>
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Meta v25.0
                          </span>
                        </h4>
                        <p class="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                          <span>WhatsApp Conectado ({lead()?.phone})</span>
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      {/* AI Status / Toggle */}
                      <Show
                        when={lead()?.handoff_at}
                        fallback={
                          <button
                            type="button"
                            onClick={() => handleToggleLeadAi(false)}
                            class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                              lead()?.ai_enabled === 1
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-elevate text-muted border-edge hover:text-body'
                            }`}
                            title="Alternar atención automática con IA"
                          >
                            <span>🤖</span>
                            <span>{lead()?.ai_enabled === 1 ? 'IA Ventas Activa' : 'IA Pausada'}</span>
                          </button>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleLeadAi(true)}
                          class="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl transition cursor-pointer"
                        >
                          ⚠️ Reactivar IA (Fin Handoff)
                        </button>
                      </Show>

                      <A
                        href={`/inbox?leadId=${lead()?.id}`}
                        class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition flex items-center gap-1"
                      >
                        <span>Abrir en Live Inbox</span>
                        <span>↗</span>
                      </A>
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div class="flex-1 p-4 overflow-y-auto space-y-3 bg-app/40">
                    <Show
                      when={messages().length > 0}
                      fallback={
                        <div class="h-full flex flex-col items-center justify-center text-muted space-y-2 p-8 text-center">
                          <span class="text-3xl">💬</span>
                          <p class="text-xs font-semibold">Aún no hay mensajes en esta conversación.</p>
                          <p class="text-[11px] text-muted">
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
                                    : 'bg-elevate text-body rounded-bl-none'
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

                                {/* Sender Badge */}
                                <div class="flex items-center justify-between gap-2 text-[10px] opacity-80 pb-0.5">
                                  <span class="font-bold">
                                    {isMe
                                      ? msg.ai_generated === 1
                                        ? '🤖 IA Ventas (Workers AI)'
                                        : msg.user_name || 'Asesor Comercial'
                                      : lead()?.full_name || 'Prospecto'}
                                  </span>
                                </div>

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
                    <div class="px-4 py-2 bg-app/90 border-t border-edge flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <img
                          src={imagePreview()!}
                          alt="Previsualización"
                          class="w-12 h-12 object-cover rounded-xl border border-edge-strong"
                        />
                        <div class="text-xs">
                          <p class="font-bold text-body truncate max-w-xs">{selectedImage()?.name}</p>
                          <p class="text-[10px] text-emerald-400">Listo para enviar como imagen</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setImagePreview(null);
                        }}
                        class="text-muted hover:text-body text-xs font-bold"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  </Show>

                  {/* Chat Input & Fast Actions */}
                  <div class="p-3 bg-app/95 border-t border-edge space-y-2">
                    {/* Quick Plantillas Dropdown / Chips */}
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                      <span class="text-muted shrink-0 font-bold">Plantillas:</span>
                      <For each={templates().slice(0, 3)}>
                        {(tmpl) => (
                          <button
                            type="button"
                            onClick={() => handleApplyTemplate(tmpl.content)}
                            class="px-2.5 py-1 bg-surface hover:bg-elevate text-body-soft rounded-lg border border-edge shrink-0 truncate max-w-[150px] transition cursor-pointer"
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
                        class="p-2.5 rounded-xl bg-surface hover:bg-elevate text-muted hover:text-body border border-edge transition cursor-pointer shrink-0 flex items-center justify-center"
                        title="Adjuntar imagen (comprobante, plan, etc.)"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelect}
                          class="hidden"
                        />
                        <ImageIcon size={16} />
                      </label>

                      <input
                        type="text"
                        value={chatInput()}
                        onInput={(e) => setChatInput(e.currentTarget.value)}
                        placeholder="Escribe un mensaje de WhatsApp..."
                        class="flex-1 px-4 py-2.5 bg-surface border border-edge rounded-xl text-xs text-body placeholder-muted focus:outline-none focus:border-emerald-500 transition"
                      />

                      <button
                        type="submit"
                        disabled={sendingMsg() || (!chatInput().trim() && !selectedImage())}
                        class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition shadow-lg disabled:opacity-40 cursor-pointer shrink-0 flex items-center gap-1.5"
                      >
                        <Send size={13} />
                        <span>{sendingMsg() ? 'Enviando...' : 'Enviar'}</span>
                      </button>
                    </form>
                  </div>
                </div>
              </Show>

              {/* TAB 2: REDACTOR DE WHATSAPP CON IA */}
              <Show when={activeTab() === 'ai'}>
                <div class="p-6 rounded-3xl bg-gradient-to-br from-surface via-surface to-accent-deep/20 border border-accent/30 space-y-4 shadow-xl">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <span class="text-xl">🤖</span>
                      <div>
                        <h3 class="text-base font-extrabold text-body">
                          Generador de WhatsApp con IA
                        </h3>
                        <p class="text-xs text-muted">
                          Redacta mensajes persuasivos usando Cloudflare Workers AI (Llama 3.1)
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateBriefing}
                      disabled={generatingBriefing()}
                      class="px-3 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-semibold rounded-xl transition border border-edge-strong disabled:opacity-50 cursor-pointer"
                    >
                      {generatingBriefing() ? 'Generando...' : '📄 Resumen Ejecutivo IA'}
                    </button>
                  </div>

                  {/* Briefing expandible */}
                  <Show when={aiBriefing()}>
                    <div class="p-4 rounded-2xl bg-app/80 border border-accent/40 text-xs space-y-1.5 animate-fade-in">
                      <span class="font-extrabold text-accent-text block">
                        📌 Resumen Ejecutivo del Prospecto:
                      </span>
                      <p class="text-body-soft whitespace-pre-wrap leading-relaxed">
                        {aiBriefing()}
                      </p>
                    </div>
                  </Show>

                  {/* Selector de Tono */}
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-muted font-bold">Tono del mensaje:</span>
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
                            ? 'bg-accent border-accent text-white'
                            : 'bg-app border-edge text-muted hover:text-body'
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
                      class="w-full py-3 bg-gradient-to-r from-accent-deep to-accent hover:from-accent hover:to-accent-hover text-white font-bold text-xs rounded-2xl shadow-accent-glow transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Sparkles size={14} />
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
                      class="w-full p-4 bg-app border border-edge rounded-2xl text-xs text-body-soft placeholder-muted focus:outline-none focus:border-accent transition"
                    ></textarea>

                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('chat');
                          setChatInput(aiMessage());
                        }}
                        disabled={!aiMessage().trim()}
                        class="flex-1 py-3 bg-elevate hover:bg-elevate-strong text-body font-bold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare size={13} />
                        <span>Pegar en Chat en Vivo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const deepLink = `https://wa.me/${lead()?.phone.replace(/^\+/, '')}?text=${encodeURIComponent(aiMessage())}`;
                          window.open(deepLink, '_blank');
                        }}
                        disabled={!aiMessage().trim()}
                        class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink size={13} />
                        <span>Abrir en WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              </Show>

              {/* TAB 3: BITÁCORA Y HISTORIAL */}
              <Show when={activeTab() === 'history'}>
                <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 shadow-xl">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <History size={18} class="text-accent" />
                      <h3 class="text-base font-bold text-body">Historial y Bitácora</h3>
                    </div>
                    <span class="text-xs text-muted">
                      {activities().length} registros
                    </span>
                  </div>

                  {/* Formulario Nota */}
                  <form onSubmit={handleAddNote} class="space-y-3">
                    <textarea
                      rows={2}
                      value={newNote()}
                      onInput={(e) => setNewNote(e.currentTarget.value)}
                      placeholder="Escribe una nota rápida (ej: Interesado en pase Fit Pro de Bs 280, entrena natación)..."
                      class="w-full p-3.5 bg-app border border-edge rounded-2xl text-xs text-body placeholder-muted focus:outline-none focus:border-accent transition"
                    ></textarea>
                    <div class="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingNote() || !newNote().trim()}
                        class="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus size={13} />
                        <span>{savingNote() ? 'Guardando...' : 'Anotar en Bitácora'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Feed */}
                  <div class="space-y-3 pt-4 border-t border-edge/80 max-h-96 overflow-y-auto">
                    <Show
                      when={activities().length > 0}
                      fallback={
                        <div class="p-8 text-center text-muted text-xs">
                          No hay actividades previas registradas.
                        </div>
                      }
                    >
                      <For each={activities()}>
                        {(act) => (
                          <div class="p-4 rounded-2xl bg-app/60 border border-edge/80 space-y-1.5">
                            <div class="flex items-center justify-between">
                              <span class="px-2 py-0.5 rounded-lg bg-elevate text-[10px] font-bold text-body-soft uppercase tracking-wide flex items-center gap-1">
                                {act.action_type === 'whatsapp_sent' ? (
                                  <>
                                    <MessageSquare size={10} />
                                    <span>WhatsApp</span>
                                  </>
                                ) : act.action_type === 'status_change' ? (
                                  <>
                                    <RefreshCw size={10} />
                                    <span>Estado</span>
                                  </>
                                ) : act.action_type === 'segment_change' ? (
                                  <>
                                    <ActivityIcon size={10} />
                                    <span>Segmento</span>
                                  </>
                                ) : act.action_type === 'ai_generated' ? (
                                  <>
                                    <Bot size={10} />
                                    <span>Asistente IA</span>
                                  </>
                                ) : (
                                  <>
                                    <FileText size={10} />
                                    <span>Nota</span>
                                  </>
                                )}
                              </span>
                              <span class="text-[10px] text-muted">
                                {new Date(act.created_at).toLocaleString('es-ES', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                            <p class="text-xs text-body-soft whitespace-pre-wrap">{act.details}</p>
                            <div class="text-[10px] text-muted font-medium">
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
