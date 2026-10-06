import { createSignal, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { api } from '../api';
import { ConversationSummary, WhatsAppMessage, MessageTemplate } from '../types';
import {
  MessageSquare,
  Search,
  Send,
  Bot,
  User,
  Check,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Settings,
  Sparkles,
  Image,
  X,
  ExternalLink,
  RefreshCw,
  Phone,
  Mail,
  ChevronRight,
} from 'lucide-solid';

export default function WhatsAppInbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const leadParam = Array.isArray(searchParams.leadId) ? searchParams.leadId[0] : searchParams.leadId;
  const [conversations, setConversations] = createSignal<ConversationSummary[]>([]);
  const [selectedLeadId, setSelectedLeadId] = createSignal<string>(leadParam || '');
  const [activeLead, setActiveLead] = createSignal<any>(null);
  const [messages, setMessages] = createSignal<WhatsAppMessage[]>([]);
  const [loadingList, setLoadingList] = createSignal(true);
  const [loadingChat, setLoadingChat] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [filterMode, setFilterMode] = createSignal<'all' | 'unread' | 'ai' | 'handoff'>('all');
  
  const [chatInput, setChatInput] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [togglingAi, setTogglingAi] = createSignal(false);
  const [triggeringAi, setTriggeringAi] = createSignal(false);
  const [updatingStage, setUpdatingStage] = createSignal(false);
  const [templates, setTemplates] = createSignal<MessageTemplate[]>([]);

  const [selectedImage, setSelectedImage] = createSignal<File | null>(null);
  const [imagePreview, setImagePreview] = createSignal<string | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

  let chatContainerRef: HTMLDivElement | undefined;
  let pollingTimer: any = null;

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (re) => setImagePreview(re.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef) fileInputRef.value = '';
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatContainerRef) {
        chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
      }
    }, 50);
  };

  const loadInboxList = async () => {
    try {
      const res = await api.getWhatsAppInbox();
      setConversations(res.conversations || []);
      
      if (!selectedLeadId() && res.conversations && res.conversations.length > 0) {
        selectConversation(res.conversations[0].leadId);
      }
    } catch (err) {
      console.error('Error cargando inbox:', err);
    } finally {
      setLoadingList(false);
    }
  };

  const loadChat = async (leadId: string, isPoll = false) => {
    if (!leadId) return;
    if (!isPoll) setLoadingChat(true);

    try {
      const currentMsgs = messages();
      const lastMsgTime = isPoll && currentMsgs.length > 0 ? currentMsgs[currentMsgs.length - 1].created_at : undefined;
      
      const res = await api.getWhatsAppChat(leadId, lastMsgTime);
      setActiveLead(res.lead);

      if (isPoll && lastMsgTime) {
        if (res.messages && res.messages.length > 0) {
          const existingIds = new Set(currentMsgs.map((m) => m.id));
          const newOnly = res.messages.filter((m) => !existingIds.has(m.id));
          if (newOnly.length > 0) {
            setMessages([...currentMsgs, ...newOnly]);
            scrollToBottom();
          }
        }
      } else {
        setMessages(res.messages || []);
        scrollToBottom();
      }
    } catch (err) {
      console.error('Error cargando chat:', err);
    } finally {
      if (!isPoll) setLoadingChat(false);
    }
  };

  const selectConversation = (leadId: string) => {
    setSelectedLeadId(leadId);
    setSearchParams({ leadId });
    loadChat(leadId, false);
  };

  const handleSendMessage = async (e?: Event) => {
    if (e) e.preventDefault();
    const text = chatInput().trim();
    const leadId = selectedLeadId();
    const file = selectedImage();
    if ((!text && !file) || !leadId || sending()) return;

    setSending(true);
    try {
      let imageUrl: string | undefined = undefined;

      if (file) {
        const upRes = await api.uploadImage(file);
        if (upRes && upRes.media_url) {
          imageUrl = upRes.media_url;
        }
      }

      const res = await api.sendWhatsAppDirect(leadId, text, imageUrl);
      if (res.success) {
        setChatInput('');
        handleRemoveImage();
        await loadChat(leadId, false);
        await loadInboxList();
      }
    } catch (err: any) {
      alert(`Error al enviar mensaje: ${err.message || 'Error desconocido'}`);
    } finally {
      setSending(false);
    }
  };

  const handleToggleAi = async (resumeHandoff = false) => {
    const lead = activeLead();
    if (!lead || togglingAi()) return;

    setTogglingAi(true);
    try {
      const res = await api.toggleLeadAi(lead.id, {
        enabled: resumeHandoff ? true : !lead.ai_enabled,
        resumeHandoff,
      });

      setActiveLead({
        ...lead,
        ai_enabled: res.ai_enabled,
        is_handoff: res.is_handoff,
      });

      await loadInboxList();
    } catch (err: any) {
      alert(`Error actualizando IA: ${err.message}`);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleTriggerAi = async () => {
    const lead = activeLead();
    if (!lead || triggeringAi()) return;

    setTriggeringAi(true);
    try {
      const res = await api.testLeadAi(lead.id, { sendToWhatsApp: true });
      if (res.success) {
        await loadChat(lead.id, false);
        await loadInboxList();
      } else {
        alert(`Error al generar respuesta de IA: ${res.error || 'No se pudo generar'}`);
      }
    } catch (err: any) {
      alert(`Error al ejecutar IA: ${err.message}`);
    } finally {
      setTriggeringAi(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    const lead = activeLead();
    if (!lead || updatingStage()) return;

    setUpdatingStage(true);
    try {
      await api.updateLeadStatus(lead.id, newStatus);
      setActiveLead({
        ...lead,
        status: newStatus,
      });
      await loadInboxList();
    } catch (err: any) {
      alert(`Error actualizando etapa: ${err.message}`);
    } finally {
      setUpdatingStage(false);
    }
  };

  onMount(async () => {
    await loadInboxList();
    try {
      const tmplRes = await api.getTemplates();
      setTemplates(tmplRes?.templates || []);
    } catch {}

    // Polling inteligente cada 3.5 segundos para sincronizar en tiempo real
    pollingTimer = setInterval(() => {
      const leadId = selectedLeadId();
      if (leadId) {
        loadChat(leadId, true);
      }
      loadInboxList();
    }, 3500);
  });

  onCleanup(() => {
    if (pollingTimer) clearInterval(pollingTimer);
  });

  const filteredConversations = createMemo(() => {
    let list = conversations();
    const q = searchQuery().toLowerCase().trim();

    if (q) {
      list = list.filter(
        (c) =>
          c.leadName.toLowerCase().includes(q) ||
          c.leadPhone.includes(q) ||
          c.lastMessageText.toLowerCase().includes(q)
      );
    }

    if (filterMode() === 'unread') {
      list = list.filter((c) => c.unreadCount > 0);
    } else if (filterMode() === 'ai') {
      list = list.filter((c) => c.aiEnabled && !c.isHandoff);
    } else if (filterMode() === 'handoff') {
      list = list.filter((c) => c.isHandoff);
    }

    return list;
  });

  const formatMsgTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Layout title="Bandeja de Entrada WhatsApp">
      <div class="h-[calc(100vh-5rem)] flex flex-col -m-4 md:-m-8 bg-app overflow-hidden">
        {/* Top Header */}
        <div class="px-6 py-3 bg-surface/90 border-b border-edge flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <div>
              <h1 class="text-sm font-extrabold text-body flex items-center gap-2">
                WhatsApp Live Inbox
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                  Meta v25.0
                </span>
              </h1>
              <p class="text-xs text-muted">
                Respuestas automáticas con IA y gestión comercial para Fitness Club Pass Cochabamba
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <A
              href="/settings/whatsapp"
              class="px-3 py-1.5 rounded-xl bg-elevate hover:bg-elevate-strong text-body text-xs font-bold border border-edge transition flex items-center gap-1.5"
            >
              <Settings size={14} />
              <span>Ajustes & IA Comercial</span>
            </A>
          </div>
        </div>

        {/* Main Split Layout: Left Conversations List, Right Chat Thread */}
        <div class="flex-1 flex overflow-hidden">
          {/* LEFT COLUMN: LIST */}
          <div class="w-full md:w-80 lg:w-96 border-r border-edge bg-surface/60 flex flex-col shrink-0">
            {/* Search & Filter Tabs */}
            <div class="p-3 border-b border-edge space-y-2">
              <div class="relative">
                <input
                  type="text"
                  placeholder="Buscar por nombre, teléfono o mensaje..."
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  class="w-full pl-9 pr-3 py-2 bg-app border border-edge rounded-xl text-xs text-body placeholder-muted focus:outline-none focus:border-accent"
                />
                <span class="absolute left-3 top-2.5 text-muted">
                  <Search size={14} />
                </span>
              </div>

              {/* Filter Pills */}
              <div class="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  class={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                    filterMode() === 'all'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-elevate text-muted hover:text-body'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('unread')}
                  class={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    filterMode() === 'unread'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-elevate text-muted hover:text-body'
                  }`}
                >
                  <Mail size={12} />
                  <span>Sin leer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('ai')}
                  class={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    filterMode() === 'ai'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-elevate text-muted hover:text-body'
                  }`}
                >
                  <Bot size={12} />
                  <span>IA Activa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('handoff')}
                  class={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                    filterMode() === 'handoff'
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-elevate text-amber-400 hover:text-body'
                  }`}
                >
                  <AlertTriangle size={12} />
                  <span>Handoff</span>
                </button>
              </div>
            </div>

            {/* Conversation Items List */}
            <div class="flex-1 overflow-y-auto divide-y divide-edge/40">
              <Show
                when={!loadingList()}
                fallback={
                  <div class="p-8 text-center text-xs text-muted animate-pulse flex items-center justify-center gap-2">
                    <RefreshCw size={14} class="animate-spin" />
                    <span>Cargando conversaciones...</span>
                  </div>
                }
              >
                <Show
                  when={filteredConversations().length > 0}
                  fallback={
                    <div class="p-8 text-center space-y-2">
                      <div class="w-12 h-12 rounded-2xl bg-surface border border-edge flex items-center justify-center mx-auto text-muted">
                        <MessageSquare size={22} />
                      </div>
                      <p class="text-xs text-muted font-bold">No hay conversaciones</p>
                      <p class="text-[11px] text-muted">Los mensajes entrantes de WhatsApp aparecerán aquí automáticamente.</p>
                    </div>
                  }
                >
                  <For each={filteredConversations()}>
                    {(conv) => (
                      <div
                        onClick={() => selectConversation(conv.leadId)}
                        class={`p-3.5 flex items-start gap-3 transition cursor-pointer select-none ${
                          selectedLeadId() === conv.leadId
                            ? 'bg-accent/15 border-l-4 border-l-accent'
                            : 'hover:bg-elevate/40'
                        }`}
                      >
                        {/* Avatar */}
                        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-surface to-elevate-strong border border-edge flex items-center justify-center font-black text-body text-xs shrink-0 relative">
                          {conv.leadName.charAt(0).toUpperCase()}
                          <Show when={conv.unreadCount > 0}>
                            <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center shadow-md">
                              {conv.unreadCount}
                            </span>
                          </Show>
                        </div>

                        {/* Middle info */}
                        <div class="flex-1 min-w-0 space-y-0.5">
                          <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-body truncate">
                              {conv.leadName}
                            </span>
                            <span class="text-[10px] text-muted shrink-0">
                              {formatMsgTime(conv.lastMessageTime)}
                            </span>
                          </div>

                          <p class="text-[11px] text-body-soft truncate">
                            {conv.lastMessageSender === 'agent' && (
                              <span class="text-emerald-400 font-semibold">Tú: </span>
                            )}
                            {conv.lastMessageText}
                          </p>

                          {/* Status and Badges */}
                          <div class="flex items-center gap-1.5 pt-1">
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-surface border border-edge text-muted">
                              {conv.leadStatus.toUpperCase()}
                            </span>
                            <Show when={conv.aiEnabled && !conv.isHandoff}>
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-accent/20 text-accent-text border border-accent/30 flex items-center gap-1">
                                <Bot size={10} />
                                <span>IA Activa</span>
                              </span>
                            </Show>
                            <Show when={conv.isHandoff}>
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <AlertTriangle size={10} />
                                <span>Requiere Asesor</span>
                              </span>
                            </Show>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVE CHAT THREAD */}
          <div class="flex-1 flex flex-col bg-app/80 min-w-0">
            <Show
              when={selectedLeadId() && activeLead()}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <div class="w-16 h-16 rounded-3xl bg-surface border border-edge flex items-center justify-center text-muted shadow-xl">
                    <MessageSquare size={32} />
                  </div>
                  <h3 class="text-sm font-bold text-body">Selecciona una conversación</h3>
                  <p class="text-xs text-muted max-w-sm">
                    Selecciona un prospecto en la lista izquierda para ver el historial y responder directamente por WhatsApp.
                  </p>
                </div>
              }
            >
              {/* Chat Header */}
              <div class="p-3.5 bg-surface/90 border-b border-edge flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-accent to-accent-hover text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                    {activeLead()?.full_name?.charAt(0) || 'L'}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-extrabold text-xs text-body truncate">
                        {activeLead()?.full_name}
                      </span>
                      <A
                        href={`/leads/${activeLead()?.id}`}
                        class="text-[11px] text-accent-text hover:underline font-bold flex items-center gap-1"
                      >
                        <span>Ficha</span>
                        <ExternalLink size={11} />
                      </A>
                    </div>
                    <div class="flex items-center gap-2 text-[11px] text-muted">
                      <span class="flex items-center gap-1">
                        <Phone size={11} />
                        <span>{activeLead()?.phone}</span>
                      </span>
                      <span>•</span>
                      {/* Inline Status Selector */}
                      <div class="flex items-center gap-1">
                        <span class="text-[10px] text-muted">Etapa:</span>
                        <select
                          value={activeLead()?.status || 'nuevo'}
                          onChange={(e) => handleUpdateStatus(e.currentTarget.value)}
                          disabled={updatingStage()}
                          class="px-2 py-0.5 rounded-lg bg-app border border-edge text-[10px] font-bold text-body focus:outline-none focus:border-accent cursor-pointer"
                        >
                          <option value="nuevo">Nuevo</option>
                          <option value="contactado">Contactado</option>
                          <option value="negociacion">Negociación</option>
                          <option value="ganado">Ganado</option>
                          <option value="perdido">Perdido</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Status & Controls */}
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerAi}
                    disabled={triggeringAi() || !activeLead()}
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white border border-accent/40 shadow-sm cursor-pointer disabled:opacity-50"
                    title="Generar y enviar respuesta de IA para el último mensaje de este cliente"
                  >
                    <Show when={triggeringAi()} fallback={<Sparkles size={13} />}>
                      <RefreshCw size={13} class="animate-spin" />
                    </Show>
                    <span>{triggeringAi() ? 'Pensando...' : 'Disparar IA'}</span>
                  </button>

                  <Show
                    when={activeLead()?.is_handoff}
                    fallback={
                      <button
                        type="button"
                        onClick={() => handleToggleAi(false)}
                        disabled={togglingAi()}
                        class={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
                          activeLead()?.ai_enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-elevate text-muted border-edge hover:text-body'
                        }`}
                        title="Pausar o reactivar respuestas de IA para este chat"
                      >
                        <Show when={activeLead()?.ai_enabled} fallback={<User size={13} />}>
                          <Bot size={13} class="text-emerald-400" />
                        </Show>
                        <span>{activeLead()?.ai_enabled ? 'IA Activa' : 'Control Manual'}</span>
                      </button>
                    }
                  >
                    <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                      <span class="text-xs text-amber-300 font-bold flex items-center gap-1">
                        <AlertTriangle size={13} />
                        <span>Handoff Activo</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleAi(true)}
                        disabled={togglingAi()}
                        class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black rounded-lg transition cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw size={10} class={togglingAi() ? 'animate-spin' : ''} />
                        <span>{togglingAi() ? 'Reactivando...' : 'Reactivar IA'}</span>
                      </button>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Chat Messages Scroll Container */}
              <div
                ref={chatContainerRef}
                class="flex-1 p-4 overflow-y-auto space-y-3 bg-gradient-to-b from-app to-surface/20"
              >
                <Show
                  when={!loadingChat()}
                  fallback={
                    <div class="p-8 text-center text-xs text-muted animate-pulse flex items-center justify-center gap-2">
                      <RefreshCw size={14} class="animate-spin" />
                      <span>Cargando mensajes...</span>
                    </div>
                  }
                >
                  <Show
                    when={messages().length > 0}
                    fallback={
                      <div class="p-8 text-center text-xs text-muted space-y-1">
                        <p>No hay mensajes registrados aún en este chat.</p>
                        <p class="text-[11px]">Envía un mensaje inicial o una plantilla abajo para comenzar la conversación.</p>
                      </div>
                    }
                  >
                    <For each={messages()}>
                      {(msg) => {
                        const isOutbound = msg.sender === 'agent' || msg.sender === 'system';
                        return (
                          <div
                            class={`flex flex-col ${
                              isOutbound ? 'items-end' : 'items-start'
                            }`}
                          >
                            <div
                              class={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs shadow-md space-y-1 relative ${
                                isOutbound
                                  ? 'bg-emerald-700 text-white rounded-tr-none'
                                  : 'bg-surface border border-edge text-body rounded-tl-none'
                              }`}
                            >
                              {/* Sender Badge */}
                              <div class="flex items-center justify-between gap-2 text-[10px] opacity-80 pb-0.5">
                                <span class="font-bold flex items-center gap-1">
                                  <Show
                                    when={isOutbound}
                                    fallback={
                                      <>
                                        <User size={11} />
                                        <span>{activeLead()?.full_name || 'Prospecto'}</span>
                                      </>
                                    }
                                  >
                                    <Show
                                      when={msg.ai_generated === 1}
                                      fallback={
                                        <>
                                          <User size={11} />
                                          <span>{msg.user_name || 'Asesor Comercial'}</span>
                                        </>
                                      }
                                    >
                                      <Bot size={11} />
                                      <span>IA Closer (Fitness Club Pass)</span>
                                    </Show>
                                  </Show>
                                </span>
                              </div>

                              {/* Media if image */}
                              <Show when={msg.message_type === 'image' && msg.media_url}>
                                <img
                                  src={msg.media_url!}
                                  alt="Imagen de chat"
                                  class="w-full max-h-48 object-cover rounded-xl border border-white/10"
                                />
                              </Show>

                              {/* Message Body */}
                              <p class="whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                              </p>

                              {/* Timestamp and Status Icons */}
                              <div class="flex items-center justify-end gap-1 text-[9px] opacity-75 pt-0.5">
                                <span>{formatMsgTime(msg.created_at)}</span>
                                <Show when={isOutbound}>
                                  <span>
                                    <Show
                                      when={msg.status === 'read' || msg.status === 'delivered'}
                                      fallback={<Check size={11} />}
                                    >
                                      <CheckCheck
                                        size={11}
                                        class={msg.status === 'read' ? 'text-sky-300 font-bold' : 'text-emerald-300'}
                                      />
                                    </Show>
                                  </span>
                                </Show>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </div>

              {/* Chat Input Bar */}
              <div class="p-3 bg-surface/95 border-t border-edge space-y-2 shrink-0">
                {/* Quick Templates Pills */}
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span class="text-muted shrink-0 font-bold text-[10px] flex items-center gap-1">
                    <Sparkles size={11} class="text-accent-text" />
                    <span>Plantillas:</span>
                  </span>
                  <For each={templates().slice(0, 4)}>
                    {(tmpl) => (
                      <button
                        type="button"
                        onClick={() => {
                          const name = activeLead()?.full_name?.split(' ')[0] || '';
                          const text = tmpl.content
                            .replace(/\{nombre\}/gi, name)
                            .replace(/\{producto\}/gi, 'Fitness Club Pass')
                            .replace(/\{ciudad\}/gi, 'Cochabamba')
                            .replace(/\{agente\}/gi, 'tu Asesor');
                          setChatInput(text);
                        }}
                        class="px-2.5 py-1 bg-elevate hover:bg-elevate-strong text-body-soft rounded-lg border border-edge shrink-0 truncate max-w-[160px] transition cursor-pointer"
                        title={tmpl.content}
                      >
                        {tmpl.title}
                      </button>
                    )}
                  </For>
                </div>

                {/* Image Preview if selected */}
                <Show when={imagePreview()}>
                  <div class="relative inline-block border border-edge rounded-xl overflow-hidden bg-app/80 p-1">
                    <img
                      src={imagePreview()!}
                      alt="Vista previa adjunto"
                      class="h-20 w-auto rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      class="absolute top-1.5 right-1.5 bg-red-600/90 hover:bg-red-500 text-white w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shadow cursor-pointer"
                      title="Quitar imagen"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </Show>

                {/* Form Input */}
                <form onSubmit={handleSendMessage} class="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileSelect}
                    class="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef?.click()}
                    class="p-2.5 bg-elevate hover:bg-elevate-strong text-body-soft rounded-xl border border-edge transition cursor-pointer flex items-center justify-center shrink-0"
                    title="Adjuntar imagen o comprobante"
                  >
                    <Image size={15} />
                  </button>

                  <input
                    type="text"
                    value={chatInput()}
                    onInput={(e) => setChatInput(e.currentTarget.value)}
                    placeholder="Escribe un mensaje o envía una foto..."
                    class="flex-1 px-4 py-2.5 bg-app border border-edge rounded-xl text-xs text-body placeholder-muted focus:outline-none focus:border-emerald-500 transition"
                  />

                  <button
                    type="submit"
                    disabled={sending() || (!chatInput().trim() && !selectedImage())}
                    class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-40 cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <Send size={13} />
                    <span>{sending() ? 'Enviando...' : 'Enviar'}</span>
                  </button>
                </form>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Layout>
  );
}
