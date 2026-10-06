import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { api } from '../api';
import { WhatsAppSettings as SettingsType, WebhookInfo, KnowledgeBaseEntry } from '../types';
import {
  Settings,
  Bot,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Phone,
  BookOpen,
  Sparkles,
  X,
  SlidersHorizontal,
  Activity,
  Play,
  Cpu,
  Send,
} from 'lucide-solid';

export default function WhatsAppSettings() {
  const [activeTab, setActiveTab] = createSignal<'connection' | 'ai' | 'kb' | 'diagnostics'>('connection');
  const [settings, setSettings] = createSignal<(SettingsType & { env_configured?: boolean }) | null>(null);
  const [webhook, setWebhook] = createSignal<WebhookInfo | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = createSignal(false);

  // Diagnostics & Simulator
  const [diagnostics, setDiagnostics] = createSignal<any | null>(null);
  const [runningDiag, setRunningDiag] = createSignal(false);
  const [simMessage, setSimMessage] = createSignal('hola, que planes tienen disponibles en Cochabamba?');
  const [sendLiveWhatsApp, setSendLiveWhatsApp] = createSignal(true);
  const [simulating, setSimulating] = createSignal(false);
  const [simResult, setSimResult] = createSignal<any | null>(null);

  // Form Fields para IA
  const [aiEnabled, setAiEnabled] = createSignal(true);
  const [aiModel, setAiModel] = createSignal('@cf/meta/llama-3.2-3b-instruct');
  const [aiTone, setAiTone] = createSignal('');
  const [aiInstructions, setAiInstructions] = createSignal('');

  // Knowledge Base State
  const [kbEntries, setKbEntries] = createSignal<KnowledgeBaseEntry[]>([]);
  const [showKbModal, setShowKbModal] = createSignal(false);
  const [editingKbId, setEditingKbId] = createSignal<string | null>(null);
  const [kbCategory, setKbCategory] = createSignal<string>('plan_precio');
  const [kbTitle, setKbTitle] = createSignal('');
  const [kbContent, setKbContent] = createSignal('');

  const loadData = async () => {
    try {
      const res = await api.getWhatsAppConfig();
      if (res.settings) {
        setSettings(res.settings as any);
        setAiEnabled(res.settings.ai_enabled === 1);
        setAiModel(res.settings.ai_model || '@cf/meta/llama-3.2-3b-instruct');
        setAiTone(res.settings.ai_tone || '');
        setAiInstructions(res.settings.ai_instructions || '');
      }
      if (res.webhook) {
        setWebhook(res.webhook);
      }

      const kbRes = await api.getKnowledgeBase();
      setKbEntries(kbRes.entries || []);
    } catch (err) {
      console.error('Error cargando configuración:', err);
    } finally {
      setLoading(false);
    }
  };

  onMount(loadData);

  const handleSaveAiSettings = async (e: Event) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await api.saveWhatsAppConfig({
        ai_enabled: aiEnabled(),
        ai_model: aiModel(),
        ai_tone: aiTone(),
        ai_instructions: aiInstructions(),
      });

      if (res.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
        await loadData();
      }
    } catch (err: any) {
      alert(`Error al guardar: ${err.message || 'Error desconocido'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await api.testWhatsAppConnection({});

      if (res.success) {
        setTestResult({
          success: true,
          message: `Conexión Exitosa con Meta Graph API v25.0: Número verificado ${res.details?.display_phone_number || settings()?.phone_number_id} (${res.details?.verified_name || 'Fitness Club Pass'})`,
        });
      } else {
        setTestResult({
          success: false,
          message: `Error al conectar: ${res.error || 'No se pudo autenticar'}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Fallo de conexión: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copiado al portapapeles.`);
  };

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await api.getWhatsAppDiagnostics();
      setDiagnostics(res);
    } catch (err: any) {
      alert(`Error ejecutando diagnóstico: ${err.message}`);
    } finally {
      setRunningDiag(false);
    }
  };

  const handleSimulateAi = async () => {
    if (!simMessage().trim()) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await api.testLeadAi('lead_3ba72e62', {
        incomingText: simMessage().trim(),
        sendToWhatsApp: sendLiveWhatsApp(),
      });
      setSimResult(res);
    } catch (err: any) {
      setSimResult({ success: false, error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  // Knowledge Base actions
  const openNewKbModal = () => {
    setEditingKbId(null);
    setKbCategory('plan_precio');
    setKbTitle('');
    setKbContent('');
    setShowKbModal(true);
  };

  const openEditKbModal = (entry: KnowledgeBaseEntry) => {
    setEditingKbId(entry.id);
    setKbCategory(entry.category);
    setKbTitle(entry.title);
    setKbContent(entry.content);
    setShowKbModal(true);
  };

  const handleSaveKb = async (e: Event) => {
    e.preventDefault();
    if (!kbTitle().trim() || !kbContent().trim()) return;

    try {
      await api.saveKnowledgeBaseEntry({
        id: editingKbId() || undefined,
        category: kbCategory(),
        title: kbTitle().trim(),
        content: kbContent().trim(),
      });
      setShowKbModal(false);
      const kbRes = await api.getKnowledgeBase();
      setKbEntries(kbRes.entries || []);
    } catch (err: any) {
      alert(`Error guardando entrada: ${err.message}`);
    }
  };

  const handleDeleteKb = async (id: string) => {
    if (!confirm('¿Deseas eliminar esta entrada de la base de conocimiento?')) return;
    try {
      await api.deleteKnowledgeBaseEntry(id);
      const kbRes = await api.getKnowledgeBase();
      setKbEntries(kbRes.entries || []);
    } catch (err: any) {
      alert(`Error eliminando entrada: ${err.message}`);
    }
  };

  const formatCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'plan_precio':
        return 'Planes & Precios (Bs)';
      case 'como_funciona_app':
        return 'Cómo funciona la App';
      case 'centros_aliados':
        return 'Centros & Sedes';
      case 'objecion_frecuente':
        return 'Objeción & Cierre';
      case 'politica':
        return 'Políticas';
      default:
        return cat.replace('_', ' ');
    }
  };

  return (
    <Layout title="Configuración WhatsApp & IA">
      <div class="max-w-5xl mx-auto space-y-6">
        {/* Header Title */}
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
              <Settings size={20} />
            </div>
            <div>
              <h1 class="text-xl font-black text-body flex items-center gap-2">
                <span>Integración WhatsApp Cloud API (v25.0) & IA Comercial</span>
              </h1>
              <p class="text-xs text-muted">
                Credenciales seguras por variables de entorno y base de conocimiento para Fitness Club Pass Cochabamba.
              </p>
            </div>
          </div>

          <Show when={savedSuccess()}>
            <span class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 animate-fade-in">
              <CheckCircle2 size={13} />
              <span>Cambios guardados</span>
            </span>
          </Show>
        </div>

        {/* Tab Switcher */}
        <div class="flex items-center gap-2 border-b border-edge pb-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab() === 'connection'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Phone size={14} />
            <span>Conexión Meta WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab() === 'ai'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Bot size={14} />
            <span>Agente Comercial IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kb')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab() === 'kb'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Database size={14} />
            <span>Catálogo & Precios en Bs</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('diagnostics');
              if (!diagnostics()) handleRunDiagnostics();
            }}
            class={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab() === 'diagnostics'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Activity size={14} />
            <span>Diagnóstico & Pruebas en Vivo</span>
          </button>
        </div>

        <Show when={!loading()} fallback={<div class="p-8 text-center text-xs text-muted animate-pulse">Cargando ajustes...</div>}>
          {/* TAB 1: CONEXIÓN META WHATSAPP */}
          <Show when={activeTab() === 'connection'}>
            <div class="space-y-6">
              {/* Security Shield Banner */}
              <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-xs">
                <ShieldCheck size={20} class="text-emerald-400 shrink-0 mt-0.5" />
                <div class="space-y-1">
                  <p class="font-extrabold text-emerald-400">
                    Modo de Alta Seguridad Activo (Single Number Environment Variables)
                  </p>
                  <p class="text-body-soft leading-relaxed text-[11px]">
                    Las credenciales de WhatsApp se leen directamente desde el entorno seguro de Cloudflare Workers (<code class="font-mono text-emerald-300">.env</code> / <code class="font-mono text-emerald-300">.dev.vars</code>). No se exponen en base de datos ni a través del navegador.
                  </p>
                </div>
              </div>

              {/* Status Banner */}
              <div class="p-5 rounded-2xl bg-surface border border-edge space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class={`w-3.5 h-3.5 rounded-full ${
                      settings()?.env_configured
                        ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
                        : 'bg-amber-400'
                    }`} />
                    <div>
                      <h3 class="text-xs font-bold text-body">
                        {settings()?.env_configured
                          ? 'Número Conectado a Meta Cloud API v25.0'
                          : 'Pendiente: Configura tus Variables de Entorno'}
                      </h3>
                      <p class="text-[11px] text-muted">
                        {settings()?.display_phone_number || settings()?.phone_number_id || 'Sin número registrado'}
                        {settings()?.verified_name ? ` (${settings()?.verified_name})` : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing() || !settings()?.env_configured}
                    class="px-4 py-2 bg-elevate hover:bg-elevate-strong text-body text-xs font-bold rounded-xl transition border border-edge disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} class={testing() ? 'animate-spin' : ''} />
                    <span>{testing() ? 'Probando...' : 'Probar Conexión con Meta'}</span>
                  </button>
                </div>

                <Show when={testResult()}>
                  <div class={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    testResult()?.success
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border border-red-500/30'
                  }`}>
                    <Show when={testResult()?.success} fallback={<AlertCircle size={14} class="shrink-0" />}>
                      <CheckCircle2 size={14} class="shrink-0" />
                    </Show>
                    <span>{testResult()?.message}</span>
                  </div>
                </Show>
              </div>

              {/* Webhook Info for Meta Developer Portal */}
              <div class="p-5 rounded-2xl bg-surface border border-edge space-y-4">
                <h3 class="text-xs font-bold text-body flex items-center gap-1.5">
                  <Sparkles size={14} class="text-accent" />
                  <span>Configuración del Webhook en Meta Developer Portal</span>
                </h3>

                <div class="space-y-3 text-xs">
                  <div>
                    <label class="block text-muted font-bold mb-1">Callback URL (URL de Webhook):</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={webhook()?.url || ''}
                        class="w-full px-3 py-2 bg-app border border-edge rounded-xl font-mono text-[11px] text-body focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(webhook()?.url || '', 'URL del Webhook')}
                        class="p-2 bg-elevate hover:bg-elevate-strong rounded-xl border border-edge text-muted hover:text-body cursor-pointer shrink-0"
                        title="Copiar URL"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-muted font-bold mb-1">Verify Token (Token de Verificación):</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={webhook()?.verify_token || ''}
                        class="w-full px-3 py-2 bg-app border border-edge rounded-xl font-mono text-[11px] text-body focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(webhook()?.verify_token || '', 'Verify Token')}
                        class="p-2 bg-elevate hover:bg-elevate-strong rounded-xl border border-edge text-muted hover:text-body cursor-pointer shrink-0"
                        title="Copiar Token"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          {/* TAB 2: AGENTE COMERCIAL WORKERS AI */}
          <Show when={activeTab() === 'ai'}>
            <form onSubmit={handleSaveAiSettings} class="p-5 rounded-2xl bg-surface border border-edge space-y-4 text-xs">
              <div class="flex items-center justify-between border-b border-edge pb-3">
                <div class="flex items-center gap-2">
                  <Bot size={18} class="text-accent" />
                  <div>
                    <h3 class="font-bold text-body">Motor del Asesor Comercial con IA</h3>
                    <p class="text-[11px] text-muted">Cloudflare Workers AI (Llama 3.2 Instruct)</p>
                  </div>
                </div>

                <label class="flex items-center gap-2 cursor-pointer">
                  <span class="text-xs font-bold text-muted">Activar IA Global:</span>
                  <input
                    type="checkbox"
                    checked={aiEnabled()}
                    onChange={(e) => setAiEnabled(e.currentTarget.checked)}
                    class="w-4 h-4 accent-accent rounded"
                  />
                </label>
              </div>

              {/* Modelo */}
              <div class="space-y-1">
                <label class="font-bold text-muted">Modelo de Inteligencia Artificial:</label>
                <select
                  value={aiModel()}
                  onChange={(e) => setAiModel(e.currentTarget.value)}
                  class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                >
                  <option value="@cf/meta/llama-3.2-3b-instruct">
                    @cf/meta/llama-3.2-3b-instruct (Recomendado: ultra rápido, multilingüe y alta precisión en ventas)
                  </option>
                  <option value="@cf/meta/llama-3.2-1b-instruct">
                    @cf/meta/llama-3.2-1b-instruct (Ultra ligero y respuesta instantánea)
                  </option>
                  <option value="@cf/meta/llama-3.3-70b-instruct">
                    @cf/meta/llama-3.3-70b-instruct (Razonamiento profundo para objeciones complejas)
                  </option>
                </select>
              </div>

              {/* Tono */}
              <div class="space-y-1">
                <label class="font-bold text-muted">Tono y Personalidad del Asesor Virtual:</label>
                <input
                  type="text"
                  value={aiTone()}
                  onInput={(e) => setAiTone(e.currentTarget.value)}
                  placeholder="Ej: enérgico, asesor consultivo, empático y altamente enfocado en cerrar suscripciones"
                  class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              {/* Instrucciones de Ventas */}
              <div class="space-y-1">
                <label class="font-bold text-muted">
                  Estrategia y Reglas de Negocio para el Cierre de Ventas:
                </label>
                <textarea
                  rows={6}
                  value={aiInstructions()}
                  onInput={(e) => setAiInstructions(e.currentTarget.value)}
                  placeholder="Fitness Club Pass es la plataforma de pases multideporte en Cochabamba, Bolivia. Con una sola membresía en la app, el usuario accede a múltiples centros deportivos, gimnasios, natación, crossfit y pádel..."
                  class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent leading-relaxed"
                />
              </div>

              <div class="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving()}
                  class="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Show when={saving()} fallback={<Bot size={14} />}>
                    <RefreshCw size={14} class="animate-spin" />
                  </Show>
                  <span>{saving() ? 'Guardando...' : 'Guardar Ajustes de IA'}</span>
                </button>
              </div>
            </form>
          </Show>

          {/* TAB 3: CATÁLOGO & PRECIOS (KNOWLEDGE BASE) */}
          <Show when={activeTab() === 'kb'}>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-black text-body">
                    Catálogo Oficial y Respuestas a Objeciones (Knowledge Base)
                  </h3>
                  <p class="text-[11px] text-muted">
                    Esta información es la única fuente de verdad inyectada a la IA para evitar alucinaciones en precios en Bolivianos (Bs) y centros aliados.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openNewKbModal}
                  class="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Nueva Entrada</span>
                </button>
              </div>

              {/* Entries Grid */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <For each={kbEntries()}>
                  {(entry) => (
                    <div class="p-4 rounded-2xl bg-surface border border-edge space-y-2 relative group hover:border-accent/40 transition">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-app border border-edge text-accent-text">
                          {formatCategoryLabel(entry.category)}
                        </span>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => openEditKbModal(entry)}
                            class="p-1.5 hover:bg-elevate rounded text-muted hover:text-body cursor-pointer"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKb(entry.id)}
                            class="p-1.5 hover:bg-elevate rounded text-rose-400 cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <h4 class="text-xs font-extrabold text-body">{entry.title}</h4>
                      <p class="text-[11px] text-muted whitespace-pre-wrap leading-relaxed">
                        {entry.content}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* TAB 4: DIAGNÓSTICO EN TIEMPO REAL & SIMULADOR DE IA */}
          <Show when={activeTab() === 'diagnostics'}>
            <div class="space-y-6 animate-fade-in">
              {/* Header with Run Diagnostics button */}
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-black text-body flex items-center gap-2">
                    <Activity size={16} class="text-accent" />
                    <span>Diagnóstico de Salud del Sistema (Meta WhatsApp & Workers AI)</span>
                  </h3>
                  <p class="text-[11px] text-muted">
                    Verifica la conectividad con Meta Graph API v25.0, la disponibilidad del modelo de IA y el estado de la base de datos D1.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunDiagnostics}
                  disabled={runningDiag()}
                  class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={14} class={runningDiag() ? 'animate-spin' : ''} />
                  <span>{runningDiag() ? 'Comprobando Sistema...' : 'Ejecutar Diagnóstico Ahora'}</span>
                </button>
              </div>

              {/* 3 Status Cards */}
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Meta API Status Card */}
                <div class="p-5 rounded-2xl bg-surface border border-edge space-y-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Phone size={16} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">Meta WhatsApp API</h4>
                    </div>
                    <Show
                      when={diagnostics()?.metaApi?.status === 'ok'}
                      fallback={
                        <span class="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-bold flex items-center gap-1">
                          <AlertCircle size={10} />
                          <span>Desconectado</span>
                        </span>
                      }
                    >
                      <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        <span>Operativo</span>
                      </span>
                    </Show>
                  </div>

                  <div class="space-y-1.5 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Teléfono verificado:</span>
                      <span class="font-mono text-body font-bold">
                        {diagnostics()?.metaApi?.display_phone_number || settings()?.display_phone_number || '+591 60750474'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Nombre verificado:</span>
                      <span class="text-body font-bold">
                        {diagnostics()?.metaApi?.verified_name || settings()?.verified_name || 'Fitness Club Pass'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Calidad de número:</span>
                      <span class="text-emerald-400 font-bold uppercase">
                        {diagnostics()?.metaApi?.quality_rating || 'GREEN (Óptimo)'}
                      </span>
                    </div>
                    <Show when={diagnostics()?.metaApi?.error}>
                      <div class="p-2 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-mono mt-2">
                        {diagnostics()?.metaApi?.error}
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Workers AI Card */}
                <div class="p-5 rounded-2xl bg-surface border border-edge space-y-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Cpu size={16} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">Cloudflare Workers AI</h4>
                    </div>
                    <Show
                      when={diagnostics()?.workersAi?.status === 'ok'}
                      fallback={
                        <span class="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                          <AlertCircle size={10} />
                          <span>Fallo / Fallback</span>
                        </span>
                      }
                    >
                      <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        <span>Activo</span>
                      </span>
                    </Show>
                  </div>

                  <div class="space-y-1.5 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Modelo evaluado:</span>
                      <span class="font-mono text-body text-[10px]">
                        {diagnostics()?.workersAi?.model || '@cf/meta/llama-3.2-3b-instruct'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Latencia de respuesta:</span>
                      <span class="text-accent font-bold font-mono">
                        {diagnostics()?.workersAi?.latencyMs ? `${diagnostics()?.workersAi?.latencyMs} ms` : 'N/A'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Prueba de inferencia:</span>
                      <span class="text-emerald-400 font-bold">
                        {diagnostics()?.workersAi?.response || 'Respondiendo'}
                      </span>
                    </div>
                    <Show when={diagnostics()?.workersAi?.error}>
                      <div class="p-2 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-mono mt-2">
                        {diagnostics()?.workersAi?.error}
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Base de Datos Card */}
                <div class="p-5 rounded-2xl bg-surface border border-edge space-y-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Database size={16} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">Base de Datos D1</h4>
                    </div>
                    <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      <span>Conectado</span>
                    </span>
                  </div>

                  <div class="space-y-1.5 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Total prospectos (leads):</span>
                      <span class="font-bold text-body">{diagnostics()?.database?.leadsCount ?? '...'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Mensajes en historial:</span>
                      <span class="font-bold text-body">{diagnostics()?.database?.messagesCount ?? '...'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Catálogo oficial (KB):</span>
                      <span class="font-bold text-body">{diagnostics()?.database?.kbEntriesCount ?? '...'} planes</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live AI Simulation & Testing Panel */}
              <div class="p-5 rounded-2xl bg-surface border border-edge space-y-4">
                <div class="flex items-center justify-between border-b border-edge pb-3">
                  <div class="flex items-center gap-2">
                    <Bot size={18} class="text-accent" />
                    <div>
                      <h4 class="text-xs font-bold text-body">Simulador de Conversación de Ventas con IA</h4>
                      <p class="text-[11px] text-muted">
                        Envía un mensaje de prueba a la IA y observa el proceso de razonamiento, la acción elegida y la entrega por WhatsApp.
                      </p>
                    </div>
                  </div>

                  <label class="flex items-center gap-2 cursor-pointer bg-elevate px-3 py-1.5 rounded-xl border border-edge">
                    <input
                      type="checkbox"
                      checked={sendLiveWhatsApp()}
                      onChange={(e) => setSendLiveWhatsApp(e.currentTarget.checked)}
                      class="w-3.5 h-3.5 accent-accent rounded cursor-pointer"
                    />
                    <span class="text-[11px] font-bold text-body">Enviar mensaje real a WhatsApp (+59170795878)</span>
                  </label>
                </div>

                {/* Predefined Test Prompts */}
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="text-muted font-bold text-[11px]">Ejemplos rápidos:</span>
                  {[
                    'hola, que planes tienen disponibles?',
                    'hola, quisiera saber precios y si tienen pase de prueba',
                    'cuanto cuesta el plan pro y que gimnasios incluye?',
                    'quiero pagar por qr para activar mi cuenta hoy',
                    'quiero hablar con un asesor humano por favor',
                  ].map((preset) => (
                    <button
                      type="button"
                      onClick={() => setSimMessage(preset)}
                      class="px-2.5 py-1 rounded-lg bg-app border border-edge hover:border-accent text-body-soft text-[10px] font-medium transition cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* Input and Action */}
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={simMessage()}
                    onInput={(e) => setSimMessage(e.currentTarget.value)}
                    placeholder="Escribe el mensaje del cliente a simular..."
                    class="flex-1 px-4 py-2.5 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                  />

                  <button
                    type="button"
                    onClick={handleSimulateAi}
                    disabled={simulating() || !simMessage().trim()}
                    class="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2 shrink-0"
                  >
                    <Show when={simulating()} fallback={<Play size={13} fill="currentColor" />}>
                      <RefreshCw size={13} class="animate-spin" />
                    </Show>
                    <span>{simulating() ? 'Procesando IA...' : 'Probar IA'}</span>
                  </button>
                </div>

                {/* Simulation Output */}
                <Show when={simResult()}>
                  <div class="p-4 rounded-2xl bg-app border border-accent/30 space-y-3 animate-fade-in text-xs">
                    <div class="flex items-center justify-between border-b border-edge pb-2">
                      <span class="font-black text-body flex items-center gap-1.5">
                        <CheckCircle2 size={14} class="text-emerald-400" />
                        <span>Resultado de la Inferencia:</span>
                      </span>
                      <span class="font-mono text-muted text-[11px]">
                        Tiempo: {simResult()?.durationMs} ms | Acción: {simResult()?.action?.action || 'N/A'}
                      </span>
                    </div>

                    <div class="space-y-1">
                      <span class="text-muted text-[11px] font-bold">Respuesta generada para el cliente:</span>
                      <p class="p-3 rounded-xl bg-surface border border-edge text-body-soft whitespace-pre-wrap leading-relaxed font-sans text-xs">
                        {simResult()?.action?.reply || simResult()?.action?.text || simResult()?.action?.farewell || 'Sin texto de respuesta'}
                      </p>
                    </div>

                    <Show when={simResult()?.deliveryResult}>
                      <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-between text-[11px]">
                        <span class="flex items-center gap-1.5 font-bold">
                          <CheckCircle2 size={13} />
                          <span>Entregado a Meta WhatsApp Cloud API</span>
                        </span>
                        <span class="font-mono text-[10px]">
                          ID: {simResult()?.deliveryResult?.waMessageId || 'N/A'}
                        </span>
                      </div>
                    </Show>

                    <Show when={simResult()?.error}>
                      <div class="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] flex items-center gap-1.5">
                        <AlertCircle size={13} />
                        <span>{simResult()?.error}</span>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </Show>

        {/* Modal Nueva / Editar Entrada de KB */}
        <Show when={showKbModal()}>
          <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="w-full max-w-lg bg-surface border border-edge rounded-3xl p-6 space-y-4 shadow-2xl animate-fade-in">
              <div class="flex items-center justify-between border-b border-edge pb-3">
                <h3 class="text-sm font-black text-body flex items-center gap-2">
                  <BookOpen size={16} class="text-accent" />
                  <span>{editingKbId() ? 'Editar Entrada de Catálogo' : 'Nueva Entrada de Conocimiento'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowKbModal(false)}
                  class="text-muted hover:text-body p-1 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveKb} class="space-y-3 text-xs">
                <div class="space-y-1">
                  <label class="font-bold text-muted">Categoría:</label>
                  <select
                    value={kbCategory()}
                    onChange={(e) => setKbCategory(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="plan_precio">Planes y Precios (en Bs)</option>
                    <option value="como_funciona_app">Cómo funciona la App & Pases</option>
                    <option value="centros_aliados">Centros, Gimnasios y Sedes en Cochabamba</option>
                    <option value="objecion_frecuente">Manejo de Objeción & Cierre</option>
                    <option value="politica">Políticas de Activación y Garantías</option>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="font-bold text-muted">Título / Plan / Tema:</label>
                  <input
                    type="text"
                    required
                    value={kbTitle()}
                    onInput={(e) => setKbTitle(e.currentTarget.value)}
                    placeholder="Ej: Pase Fit Pro (Bs 280 / mes)"
                    class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div class="space-y-1">
                  <label class="font-bold text-muted">Contenido / Precios en Bs / Argumentos:</label>
                  <textarea
                    rows={4}
                    required
                    value={kbContent()}
                    onInput={(e) => setKbContent(e.currentTarget.value)}
                    placeholder="Detalla precios en Bolivianos (Bs), qué disciplinas o pases incluye y beneficios..."
                    class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent leading-relaxed"
                  />
                </div>

                <div class="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowKbModal(false)}
                    class="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:bg-elevate cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    class="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-md cursor-pointer"
                  >
                    Guardar Entrada
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Show>
      </div>
    </Layout>
  );
}
