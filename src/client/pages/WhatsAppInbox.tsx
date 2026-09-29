import { createSignal, onMount, onCleanup, For, Show, createMemo } from 'solid-js';
import { A, useSearchParams } from '@solidjs/router';
import { Layout } from '../components/Layout';
import { api } from '../api';
import { ConversationSummary, WhatsAppMessage, MessageTemplate } from '../types';

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
  const [templates, setTemplates] = createSignal<MessageTemplate[]>([]);

  let chatContainerRef: HTMLDivElement | undefined;
  let pollingTimer: any = null;

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
      
      // Si no hay lead seleccionado y hay conversaciones, seleccionar la primera
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
          // Filtrar duplicados
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
    if (!text || !leadId || sending()) return;

    setSending(true);
    try {
      const res = await api.sendWhatsAppDirect(leadId, text);
      if (res.success) {
        setChatInput('');
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

  onMount(async () => {
    await loadInboxList();
    try {
      const tmplRes = await api.getTemplates();
      setTemplates(tmplRes?.templates || []);
    } catch {}

    // Polling inteligente cada 3.5 segundos para reflejar mensajes entrantes en tiempo real
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
        {/* Top Mini Header */}
        <div class="px-6 py-3 bg-surface/90 border-b border-edge flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <span class="text-2xl">💬</span>
            <div>
              <h1 class="text-base font-extrabold text-body flex items-center gap-2">
                WhatsApp Live Inbox
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                  Meta v25.0
                </span>
              </h1>
              <p class="text-xs text-muted">
                Respuestas automáticas con IA y gestión de prospectos de Fitness Club
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <A
              href="/settings/whatsapp"
              class="px-3 py-1.5 rounded-xl bg-elevate hover:bg-elevate-strong text-body text-xs font-bold border border-edge transition flex items-center gap-1.5"
            >
              <span>⚙️</span>
              <span>Ajustes & Credenciales Meta</span>
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
                <span class="absolute left-3 top-2.5 text-xs text-muted">🔍</span>
              </div>

              {/* Filter Pills */}
              <div class="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'unread', label: 'Sin leer' },
                  { id: 'ai', label: '🤖 Atendidos por IA' },
                  { id: 'handoff', label: '⚠️ Handoff' },
                ].map((f) => (
                  <button
                    type="button"
                    onClick={() => setFilterMode(f.id as any)}
                    class={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap cursor-pointer ${
                      filterMode() === f.id
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-elevate text-muted hover:text-body'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Items List */}
            <div class="flex-1 overflow-y-auto divide-y divide-edge/40">
              <Show
                when={!loadingList()}
                fallback={
                  <div class="p-8 text-center text-xs text-muted animate-pulse">
                    Cargando conversaciones...
                  </div>
                }
              >
                <Show
                  when={filteredConversations().length > 0}
                  fallback={
                    <div class="p-8 text-center space-y-2">
                      <span class="text-3xl block">📭</span>
                      <p class="text-xs text-muted font-bold">No hay conversaciones</p>
                      <p class="text-[11px] text-muted">Los mensajes que lleguen a tu número de WhatsApp aparecerán aquí automáticamente.</p>
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
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-accent/20 text-accent-text border border-accent/30">
                                🤖 IA Activa
                              </span>
                            </Show>
                            <Show when={conv.isHandoff}>
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                ⚠️ Requiere Asesor
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
                  <div class="w-16 h-16 rounded-3xl bg-surface border border-edge flex items-center justify-center text-3xl shadow-xl">
                    💬
                  </div>
                  <h3 class="text-sm font-bold text-body">Selecciona una conversación</h3>
                  <p class="text-xs text-muted max-w-sm">
                    Selecciona un prospecto en la lista izquierda para ver el historial y responder directamente por WhatsApp.
                  </p>
                </div>
              }
            >
              {/* Chat Header */}
              <div class="p-3.5 bg-surface/90 border-b border-edge flex items-center justify-between shrink-0">
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
                        class="text-[10px] text-accent-text hover:underline font-bold"
                      >
                        Ver Ficha Completa ↗
                      </A>
                    </div>
                    <p class="text-[11px] text-muted flex items-center gap-1.5 truncate">
                      <span>{activeLead()?.phone}</span>
                      <span>•</span>
                      <span>Etapa: {activeLead()?.status}</span>
                    </p>
                  </div>
                </div>

                {/* AI Status & Controls */}
                <div class="flex items-center gap-2">
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
                        <span>🤖</span>
                        <span>{activeLead()?.ai_enabled ? 'IA Respondiendo' : 'IA Pausada'}</span>
                      </button>
                    }
                  >
                    <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl">
                      <span class="text-xs text-amber-300 font-bold">⚠️ Handoff Activo</span>
                      <button
                        type="button"
                        onClick={() => handleToggleAi(true)}
                        disabled={togglingAi()}
                        class="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black rounded-lg transition cursor-pointer"
                      >
                        {togglingAi() ? 'Reactivando...' : 'Reactivar IA'}
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
                    <div class="p-8 text-center text-xs text-muted animate-pulse">
                      Cargando mensajes...
                    </div>
                  }
                >
                  <Show
                    when={messages().length > 0}
                    fallback={
                      <div class="p-8 text-center text-xs text-muted">
                        No hay mensajes registrados aún en este chat.
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
                                <span class="font-bold">
                                  {isOutbound
                                    ? msg.ai_generated === 1
                                      ? '🤖 IA Ventas (Fitness Club)'
                                      : msg.user_name || 'Asesor Comercial'
                                    : activeLead()?.full_name || 'Prospecto'}
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
                                  <span class="font-bold">
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
                </Show>
              </div>

              {/* Chat Input Bar */}
              <div class="p-3 bg-surface/95 border-t border-edge space-y-2 shrink-0">
                {/* Quick Templates Pills */}
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <span class="text-muted shrink-0 font-bold text-[10px]">Plantillas:</span>
                  <For each={templates().slice(0, 4)}>
                    {(tmpl) => (
                      <button
                        type="button"
                        onClick={() => {
                          const name = activeLead()?.full_name?.split(' ')[0] || '';
                          const text = tmpl.content
                            .replace(/\{nombre\}/gi, name)
                            .replace(/\{producto\}/gi, 'Membresía')
                            .replace(/\{ciudad\}/gi, 'nuestro centro')
                            .replace(/\{agente\}/gi, 'Asesor');
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

                {/* Form Input */}
                <form onSubmit={handleSendMessage} class="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput()}
                    onInput={(e) => setChatInput(e.currentTarget.value)}
                    placeholder="Escribe un mensaje por WhatsApp Cloud API v25.0..."
                    class="flex-1 px-4 py-2.5 bg-app border border-edge rounded-xl text-xs text-body placeholder-muted focus:outline-none focus:border-emerald-500 transition"
                  />

                  <button
                    type="submit"
                    disabled={sending() || !chatInput().trim()}
                    class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition shadow-md disabled:opacity-40 cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <span>{sending() ? 'Enviando...' : 'Enviar'}</span>
                    <span>🚀</span>
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
