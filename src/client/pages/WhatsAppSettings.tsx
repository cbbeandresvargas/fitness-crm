import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
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
  Activity,
  Play,
  Cpu,
} from 'lucide-solid';

export default function WhatsAppSettings() {
  const { showToast } = useAuth();
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
        showToast('Configuración de IA guardada con éxito', 'success');
        await loadData();
      }
    } catch (err: any) {
      showToast(`Error al guardar: ${err.message || 'Error desconocido'}`, 'error');
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
        showToast('Conexión con Meta Graph API verificada', 'success');
      } else {
        setTestResult({
          success: false,
          message: `Error al conectar: ${res.error || 'No se pudo autenticar'}`,
        });
        showToast(`Fallo en la prueba de conexión: ${res.error || 'No se pudo autenticar'}`, 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Fallo de conexión: ${err.message}`,
      });
      showToast(`Fallo de conexión: ${err.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copiado al portapapeles`, 'info');
  };

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await api.getWhatsAppDiagnostics();
      setDiagnostics(res);
      showToast('Diagnóstico de WhatsApp completado', 'success');
    } catch (err: any) {
      showToast(`Error ejecutando diagnóstico: ${err.message}`, 'error');
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
      showToast('Entrada de base de conocimiento guardada', 'success');
    } catch (err: any) {
      showToast(`Error guardando entrada: ${err.message}`, 'error');
    }
  };

  const handleDeleteKb = async (id: string) => {
    if (!confirm('¿Deseas eliminar esta entrada de la base de conocimiento?')) return;
    try {
      await api.deleteKnowledgeBaseEntry(id);
      const kbRes = await api.getKnowledgeBase();
      setKbEntries(kbRes.entries || []);
      showToast('Entrada de conocimiento eliminada', 'info');
    } catch (err: any) {
      showToast(`Error eliminando entrada: ${err.message}`, 'error');
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
      <div class="max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Header Title */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
              <Settings size={16} />
            </div>
            <div>
              <h1 class="text-base font-bold text-body flex items-center gap-2">
                <span>WhatsApp Cloud API (v25.0) & IA Comercial</span>
              </h1>
              <p class="text-xs text-muted">
                Credenciales por variables de entorno y base de conocimiento para Fitness Club Pass Cochabamba.
              </p>
            </div>
          </div>

          <Show when={savedSuccess()}>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 animate-fade-in">
              <CheckCircle2 size={13} />
              <span>Guardado</span>
            </span>
          </Show>
        </div>

        {/* Tab Switcher */}
        <div class="p-1 bg-surface border border-edge rounded-xl flex items-center gap-1 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            class={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab() === 'connection'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Phone size={13} />
            <span>Conexión Meta</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            class={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab() === 'ai'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Bot size={13} />
            <span>Agente Comercial IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kb')}
            class={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab() === 'kb'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Database size={13} />
            <span>Catálogo & Precios</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('diagnostics');
              if (!diagnostics()) handleRunDiagnostics();
            }}
            class={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab() === 'diagnostics'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <Activity size={13} />
            <span>Diagnóstico & Pruebas</span>
          </button>
        </div>

        <Show when={!loading()} fallback={<div class="p-8 text-center text-xs text-muted animate-pulse">Cargando ajustes...</div>}>
          {/* TAB 1: CONEXIÓN META WHATSAPP */}
          <Show when={activeTab() === 'connection'}>
            <div class="space-y-4">
              {/* Security Shield Banner */}
              <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5 text-xs">
                <ShieldCheck size={18} class="text-emerald-400 shrink-0 mt-0.5" />
                <div class="space-y-0.5">
                  <p class="font-semibold text-emerald-400">
                    Modo de Alta Seguridad Activo
                  </p>
                  <p class="text-body-soft leading-relaxed text-[11px]">
                    Las credenciales de WhatsApp se leen directamente desde el entorno seguro de Cloudflare Workers (<code class="font-mono text-emerald-300">.env</code> / <code class="font-mono text-emerald-300">.dev.vars</code>). No se exponen en base de datos.
                  </p>
                </div>
              </div>

              {/* Status Banner */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5 shadow-xs">
                <div class="flex items-center justify-between flex-wrap gap-3">
                  <div class="flex items-center gap-2.5">
                    <div class={`w-3 h-3 rounded-full ${
                      settings()?.env_configured
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
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
                    class="px-3.5 py-1.5 bg-elevate hover:bg-elevate-strong text-body text-xs font-semibold rounded-lg transition border border-edge disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} class={testing() ? 'animate-spin' : ''} />
                    <span>{testing() ? 'Probando...' : 'Probar Conexión con Meta'}</span>
                  </button>
                </div>

                <Show when={testResult()}>
                  <div class={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    testResult()?.success
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                      : 'bg-red-500/10 text-red-400 border border-red-500/25'
                  }`}>
                    <Show when={testResult()?.success} fallback={<AlertCircle size={13} class="shrink-0" />}>
                      <CheckCircle2 size={13} class="shrink-0" />
                    </Show>
                    <span>{testResult()?.message}</span>
                  </div>
                </Show>
              </div>

              {/* Webhook Info for Meta Developer Portal */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 shadow-xs">
                <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
                  <Sparkles size={13} class="text-accent" />
                  <span>Configuración del Webhook en Meta Portal</span>
                </h3>

                <div class="space-y-2.5 text-xs">
                  <div>
                    <label class="block text-muted font-medium mb-1">Callback URL (URL de Webhook):</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={webhook()?.url || ''}
                        class="w-full px-3 py-1.5 bg-app border border-edge rounded-lg font-mono text-[11px] text-body focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(webhook()?.url || '', 'URL del Webhook')}
                        class="p-2 bg-elevate hover:bg-elevate-strong rounded-lg border border-edge text-muted hover:text-body cursor-pointer shrink-0"
                        title="Copiar URL"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-muted font-medium mb-1">Verify Token (Token de Verificación):</label>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={webhook()?.verify_token || ''}
                        class="w-full px-3 py-1.5 bg-app border border-edge rounded-lg font-mono text-[11px] text-body focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(webhook()?.verify_token || '', 'Verify Token')}
                        class="p-2 bg-elevate hover:bg-elevate-strong rounded-lg border border-edge text-muted hover:text-body cursor-pointer shrink-0"
                        title="Copiar Token"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          {/* TAB 2: AGENTE COMERCIAL WORKERS AI */}
          <Show when={activeTab() === 'ai'}>
            <form onSubmit={handleSaveAiSettings} class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5 text-xs shadow-xs">
              <div class="flex items-center justify-between border-b border-edge pb-3">
                <div class="flex items-center gap-2">
                  <Bot size={16} class="text-accent" />
                  <div>
                    <h3 class="font-bold text-body text-xs">Motor del Asesor Comercial con IA</h3>
                    <p class="text-[11px] text-muted">Cloudflare Workers AI (Llama 3.2 Instruct)</p>
                  </div>
                </div>

                <label class="flex items-center gap-2 cursor-pointer">
                  <span class="text-xs font-medium text-muted">Activar IA Global:</span>
                  <input
                    type="checkbox"
                    checked={aiEnabled()}
                    onChange={(e) => setAiEnabled(e.currentTarget.checked)}
                    class="w-3.5 h-3.5 accent-accent rounded"
                  />
                </label>
              </div>

              {/* Modelo */}
              <div class="space-y-1">
                <label class="font-medium text-muted">Modelo de Inteligencia Artificial:</label>
                <select
                  value={aiModel()}
                  onChange={(e) => setAiModel(e.currentTarget.value)}
                  class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="@cf/meta/llama-3.2-3b-instruct">
                    @cf/meta/llama-3.2-3b-instruct (Recomendado: ultra rápido y alta precisión)
                  </option>
                  <option value="@cf/meta/llama-3.2-1b-instruct">
                    @cf/meta/llama-3.2-1b-instruct (Ultra ligero y respuesta instantánea)
                  </option>
                  <option value="@cf/meta/llama-3.3-70b-instruct">
                    @cf/meta/llama-3.3-70b-instruct (Razonamiento profundo)
                  </option>
                </select>
              </div>

              {/* Tono */}
              <div class="space-y-1">
                <label class="font-medium text-muted">Tono y Personalidad del Asesor Virtual:</label>
                <input
                  type="text"
                  value={aiTone()}
                  onInput={(e) => setAiTone(e.currentTarget.value)}
                  placeholder="Ej: enérgico, asesor consultivo, empático y enfocado en cerrar suscripciones"
                  class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                />
              </div>

              {/* Instrucciones de Ventas */}
              <div class="space-y-1">
                <label class="font-medium text-muted">
                  Estrategia y Reglas de Negocio para el Cierre de Ventas:
                </label>
                <textarea
                  rows={5}
                  value={aiInstructions()}
                  onInput={(e) => setAiInstructions(e.currentTarget.value)}
                  placeholder="Fitness Club Pass es la plataforma de pases multideporte en Cochabamba, Bolivia..."
                  class="w-full p-2.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent leading-relaxed"
                />
              </div>

              <div class="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={saving()}
                  class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Show when={saving()} fallback={<Bot size={13} />}>
                    <RefreshCw size={13} class="animate-spin" />
                  </Show>
                  <span>{saving() ? 'Guardando...' : 'Guardar Ajustes de IA'}</span>
                </button>
              </div>
            </form>
          </Show>

          {/* TAB 3: CATÁLOGO & PRECIOS (KNOWLEDGE BASE) */}
          <Show when={activeTab() === 'kb'}>
            <div class="space-y-3.5">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 class="text-xs font-bold text-body uppercase tracking-wider text-muted">
                    Base de Conocimiento & Catálogo Oficial
                  </h3>
                  <p class="text-[11px] text-muted">
                    Fuente de verdad inyectada a la IA para evitar alucinaciones en precios en Bolivianos (Bs).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openNewKbModal}
                  class="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Plus size={13} />
                  <span>Nueva Entrada</span>
                </button>
              </div>

              {/* Entries Grid */}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <For each={kbEntries()}>
                  {(entry) => (
                    <div class="p-3.5 rounded-xl bg-surface border border-edge space-y-2 relative group hover:border-accent/40 transition shadow-xs">
                      <div class="flex items-center justify-between">
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider bg-app border border-edge text-accent-text">
                          {formatCategoryLabel(entry.category)}
                        </span>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => openEditKbModal(entry)}
                            class="p-1 hover:bg-elevate rounded text-muted hover:text-body cursor-pointer"
                            title="Editar"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKb(entry.id)}
                            class="p-1 hover:bg-elevate rounded text-rose-400 cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      <h4 class="text-xs font-semibold text-body">{entry.title}</h4>
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
            <div class="space-y-4">
              {/* Header with Run Diagnostics button */}
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
                    <Activity size={14} class="text-accent" />
                    <span>Diagnóstico de Salud del Sistema</span>
                  </h3>
                  <p class="text-[11px] text-muted">
                    Verifica Meta WhatsApp v25.0, Workers AI y la base de datos D1.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunDiagnostics}
                  disabled={runningDiag()}
                  class="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={12} class={runningDiag() ? 'animate-spin' : ''} />
                  <span>{runningDiag() ? 'Comprobando...' : 'Ejecutar Diagnóstico'}</span>
                </button>
              </div>

              {/* 3 Status Cards */}
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Meta API Status Card */}
                <div class="p-3.5 sm:p-4 rounded-xl bg-surface border border-edge space-y-2.5 shadow-xs">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <Phone size={14} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">Meta WhatsApp API</h4>
                    </div>
                    <Show
                      when={diagnostics()?.metaApi?.status === 'ok'}
                      fallback={
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-red-500/10 text-red-400 border border-red-500/25 flex items-center gap-0.5">
                          <AlertCircle size={9} />
                          <span>Desconectado</span>
                        </span>
                      }
                    >
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-0.5">
                        <CheckCircle2 size={9} />
                        <span>Operativo</span>
                      </span>
                    </Show>
                  </div>

                  <div class="space-y-1 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Teléfono:</span>
                      <span class="font-mono text-body font-medium">
                        {diagnostics()?.metaApi?.display_phone_number || settings()?.display_phone_number || '+591 60750474'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Nombre:</span>
                      <span class="text-body font-medium truncate max-w-[120px]">
                        {diagnostics()?.metaApi?.verified_name || settings()?.verified_name || 'Fitness Club Pass'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Calidad:</span>
                      <span class="text-emerald-400 font-semibold">
                        {diagnostics()?.metaApi?.quality_rating || 'GREEN (Óptimo)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Workers AI Card */}
                <div class="p-3.5 sm:p-4 rounded-xl bg-surface border border-edge space-y-2.5 shadow-xs">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <Cpu size={14} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">Workers AI</h4>
                    </div>
                    <Show
                      when={diagnostics()?.workersAi?.status === 'ok'}
                      fallback={
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-0.5">
                          <AlertCircle size={9} />
                          <span>Fallback</span>
                        </span>
                      }
                    >
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-0.5">
                        <CheckCircle2 size={9} />
                        <span>Activo</span>
                      </span>
                    </Show>
                  </div>

                  <div class="space-y-1 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Modelo:</span>
                      <span class="font-mono text-body text-[10px] truncate max-w-[130px]">
                        {diagnostics()?.workersAi?.model || 'llama-3.2-3b'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Latencia:</span>
                      <span class="text-accent font-semibold font-mono">
                        {diagnostics()?.workersAi?.latencyMs ? `${diagnostics()?.workersAi?.latencyMs} ms` : 'N/A'}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Inferencia:</span>
                      <span class="text-emerald-400 font-medium">
                        {diagnostics()?.workersAi?.response || 'Respondiendo'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Base de Datos Card */}
                <div class="p-3.5 sm:p-4 rounded-xl bg-surface border border-edge space-y-2.5 shadow-xs">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                      <Database size={14} class="text-accent" />
                      <h4 class="text-xs font-bold text-body">D1 Database</h4>
                    </div>
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-0.5">
                      <CheckCircle2 size={9} />
                      <span>Conectado</span>
                    </span>
                  </div>

                  <div class="space-y-1 text-[11px]">
                    <div class="flex justify-between">
                      <span class="text-muted">Prospectos:</span>
                      <span class="font-semibold text-body">{diagnostics()?.database?.leadsCount ?? '...'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Mensajes:</span>
                      <span class="font-semibold text-body">{diagnostics()?.database?.messagesCount ?? '...'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-muted">Catálogo:</span>
                      <span class="font-semibold text-body">{diagnostics()?.database?.kbEntriesCount ?? '...'} planes</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live AI Simulation & Testing Panel */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 shadow-xs">
                <div class="flex items-center justify-between border-b border-edge pb-2.5 flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <Bot size={16} class="text-accent" />
                    <div>
                      <h4 class="text-xs font-bold text-body">Simulador de Conversación IA</h4>
                      <p class="text-[11px] text-muted">
                        Envía un mensaje de prueba a la IA y observa el razonamiento y respuesta.
                      </p>
                    </div>
                  </div>

                  <label class="flex items-center gap-2 cursor-pointer bg-elevate px-2.5 py-1 rounded-lg border border-edge text-xs">
                    <input
                      type="checkbox"
                      checked={sendLiveWhatsApp()}
                      onChange={(e) => setSendLiveWhatsApp(e.currentTarget.checked)}
                      class="w-3.5 h-3.5 accent-accent rounded cursor-pointer"
                    />
                    <span class="text-[11px] font-medium text-body">Enviar a WhatsApp (+59170795878)</span>
                  </label>
                </div>

                {/* Predefined Test Prompts */}
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="text-muted font-medium text-[10px]">Ejemplos:</span>
                  {[
                    'hola, que planes tienen?',
                    'quisiera saber precios',
                    'cuanto cuesta el plan pro?',
                    'quiero pagar por qr',
                  ].map((preset) => (
                    <button
                      type="button"
                      onClick={() => setSimMessage(preset)}
                      class="px-2 py-0.5 rounded-md bg-app border border-edge hover:border-accent text-body-soft text-[10px] font-medium transition cursor-pointer"
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
                    class="flex-1 px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                  />

                  <button
                    type="button"
                    onClick={handleSimulateAi}
                    disabled={simulating() || !simMessage().trim()}
                    class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Show when={simulating()} fallback={<Play size={12} fill="currentColor" />}>
                      <RefreshCw size={12} class="animate-spin" />
                    </Show>
                    <span>{simulating() ? 'Procesando...' : 'Probar IA'}</span>
                  </button>
                </div>

                {/* Simulation Output */}
                <Show when={simResult()}>
                  <div class="p-3.5 rounded-lg bg-app border border-accent/25 space-y-2 text-xs">
                    <div class="flex items-center justify-between border-b border-edge pb-1.5">
                      <span class="font-semibold text-body flex items-center gap-1">
                        <CheckCircle2 size={13} class="text-emerald-400" />
                        <span>Resultado de la Inferencia:</span>
                      </span>
                      <span class="font-mono text-muted text-[10px]">
                        Tiempo: {simResult()?.durationMs} ms | Acción: {simResult()?.action?.action || 'N/A'}
                      </span>
                    </div>

                    <div class="space-y-1">
                      <span class="text-muted text-[10px] font-medium">Respuesta:</span>
                      <p class="p-2.5 rounded-lg bg-surface border border-edge text-body-soft whitespace-pre-wrap leading-relaxed text-xs">
                        {simResult()?.action?.reply || simResult()?.action?.text || simResult()?.action?.farewell || 'Sin texto de respuesta'}
                      </p>
                    </div>

                    <Show when={simResult()?.deliveryResult}>
                      <div class="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-between text-[10px]">
                        <span class="flex items-center gap-1 font-medium">
                          <CheckCircle2 size={12} />
                          <span>Entregado a Meta WhatsApp API</span>
                        </span>
                        <span class="font-mono">
                          ID: {simResult()?.deliveryResult?.waMessageId || 'N/A'}
                        </span>
                      </div>
                    </Show>

                    <Show when={simResult()?.error}>
                      <div class="p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] flex items-center gap-1">
                        <AlertCircle size={12} />
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
            <div class="w-full max-w-md bg-surface border border-edge rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xl animate-fade-in">
              <div class="flex items-center justify-between border-b border-edge pb-2.5">
                <h3 class="text-xs font-bold text-body flex items-center gap-1.5 uppercase tracking-wider text-accent-text">
                  <BookOpen size={14} class="text-accent" />
                  <span>{editingKbId() ? 'Editar Entrada de Catálogo' : 'Nueva Entrada'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowKbModal(false)}
                  class="text-muted hover:text-body p-1 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveKb} class="space-y-3 text-xs">
                <div class="space-y-1">
                  <label class="font-medium text-muted">Categoría:</label>
                  <select
                    value={kbCategory()}
                    onChange={(e) => setKbCategory(e.currentTarget.value)}
                    class="w-full px-2.5 py-1.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="plan_precio">Planes y Precios (en Bs)</option>
                    <option value="como_funciona_app">Cómo funciona la App & Pases</option>
                    <option value="centros_aliados">Centros y Gimnasios en Cochabamba</option>
                    <option value="objecion_frecuente">Manejo de Objeción & Cierre</option>
                    <option value="politica">Políticas de Activación y Garantías</option>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="font-medium text-muted">Título / Plan / Tema:</label>
                  <input
                    type="text"
                    required
                    value={kbTitle()}
                    onInput={(e) => setKbTitle(e.currentTarget.value)}
                    placeholder="Ej: Pase Fit Pro (Bs 280 / mes)"
                    class="w-full px-2.5 py-1.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div class="space-y-1">
                  <label class="font-medium text-muted">Contenido / Precios en Bs / Argumentos:</label>
                  <textarea
                    rows={4}
                    required
                    value={kbContent()}
                    onInput={(e) => setKbContent(e.currentTarget.value)}
                    placeholder="Detalla precios en Bolivianos (Bs), qué disciplinas o pases incluye y beneficios..."
                    class="w-full p-2.5 bg-app border border-edge rounded-lg text-xs text-body focus:outline-none focus:border-accent leading-relaxed"
                  />
                </div>

                <div class="flex items-center justify-end gap-2 pt-2 border-t border-edge">
                  <button
                    type="button"
                    onClick={() => setShowKbModal(false)}
                    class="px-3 py-1.5 rounded-lg text-xs font-medium text-body-soft hover:bg-elevate cursor-pointer border border-edge"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    class="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs cursor-pointer"
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
