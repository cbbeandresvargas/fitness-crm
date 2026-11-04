import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { WhatsAppSettings as SettingsType, WebhookInfo, Sticker } from '../types';
import {
  Settings,
  Bot,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
  Phone,
  Sparkles,
  X,
  Activity,
  Play,
  Cpu,
  Sticker as StickerIcon,
  Upload,
  Image as ImageIcon,
  Film,
  Zap,
  Server,
} from 'lucide-solid';
import {
  processImageForSticker,
  formatBytesToKb,
  ProcessedStickerResult,
} from '../utils/stickerUtils';

export default function WhatsAppSettings() {
  const { showToast } = useAuth();
  const [activeTab, setActiveTab] = createSignal<'connection' | 'ai' | 'stickers' | 'diagnostics'>('connection');
  const [settings, setSettings] = createSignal<(SettingsType & { env_configured?: boolean }) | null>(null);
  const [webhook, setWebhook] = createSignal<WebhookInfo | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = createSignal(false);

  // Microservicio de IA State & Testing
  const [aiEnabled, setAiEnabled] = createSignal(true);
  const [testingMicroservice, setTestingMicroservice] = createSignal(false);
  const [microserviceTestResult, setMicroserviceTestResult] = createSignal<{
    success: boolean;
    message: string;
    details?: any;
    durationMs?: number;
  } | null>(null);

  // Diagnostics & Simulator
  const [diagnostics, setDiagnostics] = createSignal<any | null>(null);
  const [runningDiag, setRunningDiag] = createSignal(false);
  const [simMessage, setSimMessage] = createSignal('hola, que planes tienen disponibles en Cochabamba?');
  const [sendLiveWhatsApp, setSendLiveWhatsApp] = createSignal(true);
  const [simulating, setSimulating] = createSignal(false);
  const [simResult, setSimResult] = createSignal<any | null>(null);

  // Stickers State
  const [stickers, setStickers] = createSignal<Sticker[]>([]);
  const [loadingStickers, setLoadingStickers] = createSignal(false);
  const [uploadingSticker, setUploadingSticker] = createSignal(false);
  const [deletingStickerId, setDeletingStickerId] = createSignal<string | null>(null);

  // Form Subida Stickers
  const [stickerName, setStickerName] = createSignal('');
  const [selectedStickerFile, setSelectedStickerFile] = createSignal<File | null>(null);
  const [processedSticker, setProcessedSticker] = createSignal<ProcessedStickerResult | null>(null);
  const [processingSticker, setProcessingSticker] = createSignal(false);
  const [stickerDragOver, setStickerDragOver] = createSignal(false);
  const [stickerError, setStickerError] = createSignal<string | null>(null);
  let stickerFileInputRef: HTMLInputElement | undefined;

  const loadData = async () => {
    try {
      const res = await api.getWhatsAppConfig();
      if (res.settings) {
        setSettings(res.settings as any);
        setAiEnabled(res.settings.ai_enabled === 1);
      }
      if (res.webhook) {
        setWebhook(res.webhook);
      }

      await loadStickers();
    } catch (err) {
      console.error('Error cargando configuración:', err);
    } finally {
      setLoading(false);
    }
  };

  onMount(loadData);

  const handleSaveAiSettings = async (e?: Event) => {
    if (e) e.preventDefault();
    setSaving(true);

    try {
      const res = await api.saveWhatsAppConfig({
        ai_enabled: aiEnabled(),
      });

      if (res.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
        showToast('Configuración del Asistente de IA guardada con éxito', 'success');
        await loadData();
      }
    } catch (err: any) {
      showToast(`Error al guardar: ${err.message || 'Error desconocido'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestMicroservice = async () => {
    setTestingMicroservice(true);
    setMicroserviceTestResult(null);

    try {
      const res = await api.testAiMicroservice();
      if (res.success) {
        setMicroserviceTestResult({
          success: true,
          message: `Microservicio ${res.service || 'ai-micro'} conectado exitosamente (Respuesta OK)`,
          details: res,
          durationMs: res.durationMs,
        });
        showToast('Conexión con el Microservicio ai-micro exitosa', 'success');
      } else {
        setMicroserviceTestResult({
          success: false,
          message: res.error || 'Error al conectar con el microservicio',
          details: res,
          durationMs: res.durationMs,
        });
        showToast(`Fallo al contactar ai-micro: ${res.error || 'Error'}`, 'error');
      }
    } catch (err: any) {
      setMicroserviceTestResult({
        success: false,
        message: err.message || 'No se pudo comunicar con el endpoint del microservicio',
      });
      showToast(`Error probando microservicio: ${err.message}`, 'error');
    } finally {
      setTestingMicroservice(false);
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

  // Sticker Handlers
  const loadStickers = async () => {
    setLoadingStickers(true);
    try {
      const res = await api.listStickers();
      setStickers(res.stickers || []);
    } catch (err: any) {
      console.error('Error cargando stickers:', err);
      showToast(`Error cargando stickers: ${err.message || 'Error desconocido'}`, 'error');
    } finally {
      setLoadingStickers(false);
    }
  };

  const handleSelectStickerFile = async (file: File) => {
    if (!file) return;
    setStickerError(null);
    setProcessingSticker(true);

    try {
      if (!stickerName().trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .slice(0, 80);
        setStickerName(cleanName);
      }

      const processed = await processImageForSticker(file);
      setSelectedStickerFile(file);
      setProcessedSticker(processed);
      if (processed.warning) {
        showToast(processed.warning, 'info');
      }
    } catch (err: any) {
      setStickerError(err.message || 'Error al procesar la imagen para sticker');
      setProcessedSticker(null);
      setSelectedStickerFile(null);
      if (stickerFileInputRef) stickerFileInputRef.value = '';
    } finally {
      setProcessingSticker(false);
    }
  };

  const handleClearStickerSelection = () => {
    setSelectedStickerFile(null);
    setProcessedSticker(null);
    setStickerError(null);
    if (stickerFileInputRef) stickerFileInputRef.value = '';
  };

  const handleUploadSticker = async (e: Event) => {
    e.preventDefault();
    const processed = processedSticker();
    const name = stickerName().trim().slice(0, 80);

    if (!processed) {
      setStickerError('Por favor selecciona una imagen para el sticker.');
      return;
    }
    if (!name) {
      setStickerError('Debes ingresar un nombre para el sticker (máximo 80 caracteres).');
      return;
    }

    setUploadingSticker(true);
    setStickerError(null);

    try {
      await api.uploadSticker(processed.blob, name);
      showToast(`Sticker "${name}" guardado exitosamente`, 'success');
      handleClearStickerSelection();
      setStickerName('');
      await loadStickers();
    } catch (err: any) {
      setStickerError(err.message || 'Error al subir el sticker.');
      showToast(`Error al subir sticker: ${err.message}`, 'error');
    } finally {
      setUploadingSticker(false);
    }
  };

  const handleDeleteSticker = async (id: string, name: string) => {
    if (!confirm(`¿Deseas eliminar el sticker "${name}" de WhatsApp?`)) {
      return;
    }
    setDeletingStickerId(id);
    try {
      await api.deleteSticker(id);
      showToast(`Sticker "${name}" eliminado`, 'info');
      await loadStickers();
    } catch (err: any) {
      showToast(`Error al eliminar sticker: ${err.message}`, 'error');
    } finally {
      setDeletingStickerId(null);
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
                Credenciales por variables de entorno y microservicio autónomo de IA para Fitness Club Pass.
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
            <span>Microservicio IA (ai-micro)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('stickers');
              loadStickers();
            }}
            class={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab() === 'stickers'
                ? 'bg-accent text-white shadow-xs'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            <StickerIcon size={13} />
            <span>Stickers</span>
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

          {/* TAB 2: MICROSERVICIO DE IA (ai-micro) */}
          <Show when={activeTab() === 'ai'}>
            <div class="space-y-4">
              {/* Card 1: Toggle General y Estado del Asistente */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge shadow-xs space-y-4">
                <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-edge">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 text-accent flex items-center justify-center">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 class="font-bold text-body text-sm flex items-center gap-2">
                        <span>Asistente Comercial IA para WhatsApp</span>
                        <Show
                          when={aiEnabled()}
                          fallback={
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/25">
                              Pausado
                            </span>
                          }
                        >
                          <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Activo</span>
                          </span>
                        </Show>
                      </h3>
                      <p class="text-xs text-muted">
                        Respuestas automatizadas a prospectos y derivación inteligente a asesores humanos.
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAiEnabled(!aiEnabled())}
                      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        aiEnabled() ? 'bg-accent' : 'bg-elevate-strong border border-edge'
                      }`}
                      role="switch"
                      aria-checked={aiEnabled()}
                    >
                      <span
                        class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          aiEnabled() ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span class="text-xs font-medium text-body">
                      {aiEnabled() ? 'Habilitado' : 'Deshabilitado'}
                    </span>
                  </div>
                </div>

                <div class="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
                  <p class="text-muted text-[11px]">
                    {aiEnabled()
                      ? 'El asistente responderá de inmediato los mensajes entrantes de WhatsApp canalizándolos a través del microservicio.'
                      : 'El bot está apagado. Todos los mensajes entrantes permanecerán en bandeja de entrada para atención manual de tu equipo.'}
                  </p>

                  <button
                    type="button"
                    onClick={handleSaveAiSettings}
                    disabled={saving()}
                    class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <Show when={saving()} fallback={<Bot size={13} />}>
                      <RefreshCw size={13} class="animate-spin" />
                    </Show>
                    <span>{saving() ? 'Guardando...' : 'Guardar Estado'}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Información del Microservicio ai-micro */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge shadow-xs space-y-4">
                <div class="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-edge">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                      <Server size={16} />
                    </div>
                    <div>
                      <h3 class="font-bold text-body text-xs flex items-center gap-2">
                        <span>Microservicio Desacoplado: ai-micro</span>
                        <span class="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/25">
                          Worker Autónomo
                        </span>
                      </h3>
                      <p class="text-[11px] text-muted">
                        Inferencia, conocimiento comercial de planes y directivas de venta 100% aislados.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestMicroservice}
                    disabled={testingMicroservice()}
                    class="px-3.5 py-1.5 bg-elevate hover:bg-elevate-strong text-body text-xs font-semibold rounded-lg transition border border-edge disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} class={testingMicroservice() ? 'animate-spin text-accent' : ''} />
                    <span>{testingMicroservice() ? 'Probando...' : 'Probar Conexión con ai-micro'}</span>
                  </button>
                </div>

                {/* Connection URL Display */}
                <div class="space-y-1.5">
                  <label class="block text-muted text-xs font-medium">
                    URL de Conexión del Microservicio (<code class="font-mono text-accent-text">AI_MICROSERVICE_URL</code>):
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      readonly
                      value={settings()?.ai_microservice_url || 'http://127.0.0.1:8788'}
                      class="w-full px-3 py-2 bg-app border border-edge rounded-lg font-mono text-xs text-body focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          settings()?.ai_microservice_url || 'http://127.0.0.1:8788',
                          'URL del Microservicio'
                        )
                      }
                      class="p-2 bg-elevate hover:bg-elevate-strong rounded-lg border border-edge text-muted hover:text-body cursor-pointer shrink-0"
                      title="Copiar URL"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <p class="text-[11px] text-muted">
                    El CRM despacha las solicitudes de conversación a este endpoint (<code class="font-mono text-accent-text">POST /chat</code>).
                  </p>
                </div>

                {/* Test Result Display */}
                <Show when={microserviceTestResult()}>
                  <div
                    class={`p-3 rounded-xl text-xs space-y-1.5 ${
                      microserviceTestResult()?.success
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                        : 'bg-red-500/10 text-red-400 border border-red-500/25'
                    }`}
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-1.5 font-semibold">
                        <Show
                          when={microserviceTestResult()?.success}
                          fallback={<AlertCircle size={14} class="shrink-0" />}
                        >
                          <CheckCircle2 size={14} class="shrink-0" />
                        </Show>
                        <span>{microserviceTestResult()?.message}</span>
                      </div>
                      <Show when={microserviceTestResult()?.durationMs !== undefined}>
                        <span class="font-mono text-[10px] opacity-80">
                          {microserviceTestResult()?.durationMs} ms
                        </span>
                      </Show>
                    </div>

                    <Show when={microserviceTestResult()?.details?.models}>
                      <div class="text-[11px] opacity-90 pl-5 space-y-0.5">
                        <p>
                          • Modelo Primario:{' '}
                          <code class="font-mono text-xs font-semibold">
                            {microserviceTestResult()?.details?.models?.primary}
                          </code>
                        </p>
                        <p>
                          • Modelo Respaldo:{' '}
                          <code class="font-mono text-xs">
                            {microserviceTestResult()?.details?.models?.fallback}
                          </code>
                        </p>
                      </div>
                    </Show>
                  </div>
                </Show>

                {/* 3 Architecture Feature Highlights */}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div class="p-3 rounded-lg bg-app border border-edge space-y-1">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-body">
                      <Zap size={13} class="text-amber-400 shrink-0" />
                      <span>Modelos de Inferencia</span>
                    </div>
                    <p class="text-[11px] text-muted leading-relaxed">
                      Primario: <strong class="text-body font-mono text-[10px]">GLM-4.7-Flash</strong> (ultra rápido y baja latencia). Respaldo: <strong class="text-body font-mono text-[10px]">LLaMA 3.2 3B</strong>.
                    </p>
                  </div>

                  <div class="p-3 rounded-lg bg-app border border-edge space-y-1">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-body">
                      <ShieldCheck size={13} class="text-emerald-400 shrink-0" />
                      <span>Catálogo Congelado</span>
                    </div>
                    <p class="text-[11px] text-muted leading-relaxed">
                      Planes fijos (Bs 200, Bs 350, Bs 900), sedes aliadas en Cochabamba y pases QR hardcodeados en el microservicio sin alucinaciones.
                    </p>
                  </div>

                  <div class="p-3 rounded-lg bg-app border border-edge space-y-1">
                    <div class="flex items-center gap-1.5 text-xs font-bold text-body">
                      <Bot size={13} class="text-accent shrink-0" />
                      <span>Directivas Comerciales</span>
                    </div>
                    <p class="text-[11px] text-muted leading-relaxed">
                      Respuestas breves de 1 a 3 frases, precio en la primera oración y derivación directa a asesor humano para cobros y llamadas.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informative Note / Callout */}
              <div class="p-3.5 rounded-xl bg-accent/10 border border-accent/25 space-y-1.5 text-xs">
                <div class="flex items-center gap-2 text-accent-text font-bold text-xs">
                  <Sparkles size={14} class="text-accent shrink-0" />
                  <span>Arquitectura Desacoplada de Máxima Velocidad</span>
                </div>
                <p class="text-[11px] text-body-soft leading-relaxed pl-5">
                  Toda la lógica de procesamiento de lenguaje natural, el <strong class="text-body font-semibold">Contexto del Negocio</strong> (<code class="font-mono text-accent-text">business_context / businessContext</code>) y los precios en Bolivianos (Bs) han sido desacoplados en el worker dedicado <code class="font-mono text-accent-text">ai-micro</code>. Tu CRM principal ya no requiere gestionar prompts ni catálogos locales en este formulario, garantizando respuestas directas, latencia mínima y cero alucinaciones comerciales.
                </p>
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

          {/* TAB 4: STICKERS DE WHATSAPP */}
          <Show when={activeTab() === 'stickers'}>
            <div class="space-y-4 animate-fade-in">
              {/* Header card de Stickers */}
              <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                    <h2 class="text-sm font-bold text-body flex items-center gap-2">
                      <span>Biblioteca de Stickers para WhatsApp</span>
                    </h2>
                    <span class="px-2 py-0.5 rounded-full bg-accent/15 text-accent-text border border-accent/25 text-[10px] font-bold">
                      {stickers().length} disponibles
                    </span>
                  </div>
                  <p class="text-xs text-muted max-w-2xl leading-relaxed">
                    Sube y gestiona stickers estáticos (PNG/JPG convertidos a WebP 512×512 transparente ≤ 100 KB) y stickers animados (WebP ≤ 500 KB) para que tus asesores los envíen a los clientes en el chat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadStickers}
                  disabled={loadingStickers()}
                  class="px-3 py-1.5 rounded-lg bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-semibold border border-edge transition cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <RefreshCw size={12} class={loadingStickers() ? 'animate-spin' : ''} />
                  <span>Actualizar lista</span>
                </button>
              </div>

              {/* Grid 2 columnas: Subida & Lista */}
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                {/* Panel de Subida */}
                <div class="lg:col-span-5 space-y-4">
                  <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-4">
                    <div class="border-b border-edge pb-2 flex items-center justify-between">
                      <h3 class="text-xs font-bold text-body uppercase tracking-wider flex items-center gap-1.5 text-accent-text">
                        <Upload size={14} class="text-accent" />
                        <span>Subir Nuevo Sticker</span>
                      </h3>
                      <span class="text-[10px] text-muted">WebP / PNG / JPG</span>
                    </div>

                    <form onSubmit={handleUploadSticker} class="space-y-3.5 text-xs">
                      {/* Zona Drag & Drop / Selector */}
                      <input
                        type="file"
                        ref={stickerFileInputRef}
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const target = e.currentTarget;
                          if (target.files && target.files[0]) {
                            handleSelectStickerFile(target.files[0]);
                          }
                        }}
                        class="hidden"
                      />

                      <Show
                        when={processedSticker()}
                        fallback={
                          <div
                            onDragOver={(e) => {
                              e.preventDefault();
                              setStickerDragOver(true);
                            }}
                            onDragLeave={() => setStickerDragOver(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setStickerDragOver(false);
                              if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                                handleSelectStickerFile(e.dataTransfer.files[0]);
                              }
                            }}
                            onClick={() => stickerFileInputRef?.click()}
                            class={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2.5 ${
                              stickerDragOver()
                                ? 'border-accent bg-accent/10 scale-[1.01]'
                                : 'border-edge hover:border-accent/60 bg-app/40 hover:bg-elevate/30'
                            }`}
                          >
                            <Show
                              when={processingSticker()}
                              fallback={
                                <>
                                  <div class="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center shadow-xs">
                                    <Upload size={22} />
                                  </div>
                                  <div class="space-y-1">
                                    <p class="font-semibold text-body text-xs">
                                      Arrastra tu imagen aquí o haz clic para explorar
                                    </p>
                                    <p class="text-[11px] text-muted max-w-xs">
                                      PNG o JPG (centrado a 512×512 y comprimido a WebP ≤ 100KB) o WebP animado (≤ 500KB)
                                    </p>
                                  </div>
                                </>
                              }
                            >
                              <div class="flex flex-col items-center gap-2 text-accent py-3">
                                <RefreshCw size={24} class="animate-spin" />
                                <span class="font-medium text-xs">Procesando y optimizando imagen...</span>
                              </div>
                            </Show>
                          </div>
                        }
                      >
                        {/* Preview antes de subir */}
                        <div class="p-3 bg-app rounded-xl border border-edge space-y-3">
                          <div class="flex items-center justify-between text-[11px]">
                            <span class="font-bold text-body flex items-center gap-1.5">
                              <ImageIcon size={13} class="text-accent" />
                              <span>Vista Previa del Sticker</span>
                            </span>
                            <button
                              type="button"
                              onClick={handleClearStickerSelection}
                              class="text-muted hover:text-red-400 p-1 cursor-pointer transition"
                              title="Descartar imagen"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {/* Canvas / Img Preview Container */}
                          <div class="w-full flex items-center justify-center p-4 bg-black/20 rounded-lg border border-edge/60 relative overflow-hidden">
                            {/* Cuadrícula sutil de transparencia */}
                            <div
                              class="absolute inset-0 opacity-15 pointer-events-none"
                              style={{
                                'background-image':
                                  'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)',
                                'background-size': '16px 16px',
                                'background-position': '0 0, 0 8px, 8px -8px, -8px 0px',
                              }}
                            />
                            <img
                              src={processedSticker()?.previewUrl}
                              alt="Vista previa del sticker"
                              class="w-36 h-36 object-contain z-10 transition-transform drop-shadow"
                            />
                          </div>

                          {/* Metadatos y Badges */}
                          <div class="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px]">
                            <Show
                              when={processedSticker()?.isAnimated}
                              fallback={
                                <span class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold text-[10px] flex items-center gap-1">
                                  <span>WebP Estático 512×512</span>
                                </span>
                              }
                            >
                              <span class="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/25 font-semibold text-[10px] flex items-center gap-1">
                                <Film size={10} />
                                <span>WebP Animado</span>
                              </span>
                            </Show>

                            <span class="text-muted font-mono text-[10px]">
                              Peso: <strong class="text-body">{formatBytesToKb(processedSticker()?.sizeBytes || 0)}</strong>
                              {' / '}
                              {processedSticker()?.isAnimated ? '500 KB máx' : '100 KB máx'}
                            </span>
                          </div>

                          <Show when={processedSticker()?.warning}>
                            <div class="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] flex items-start gap-1.5">
                              <AlertCircle size={12} class="shrink-0 mt-0.5" />
                              <span>{processedSticker()?.warning}</span>
                            </div>
                          </Show>
                        </div>
                      </Show>

                      {/* Campo Nombre del Sticker */}
                      <div class="space-y-1">
                        <div class="flex items-center justify-between">
                          <label class="font-medium text-muted text-[11px]">Nombre del sticker:</label>
                          <span class="text-[10px] text-muted">{stickerName().length}/80</span>
                        </div>
                        <input
                          type="text"
                          required
                          maxLength={80}
                          value={stickerName()}
                          onInput={(e) => setStickerName(e.currentTarget.value.slice(0, 80))}
                          placeholder="Ej: Logo Animado, Pulgar Arriba, Promo Fit..."
                          class="w-full px-3 py-2 bg-app border border-edge rounded-lg text-xs text-body placeholder-muted focus:outline-none focus:border-accent transition"
                        />
                      </div>

                      <Show when={stickerError()}>
                        <div class="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-start gap-1.5 animate-fade-in">
                          <AlertCircle size={14} class="shrink-0 mt-0.5" />
                          <span>{stickerError()}</span>
                        </div>
                      </Show>

                      {/* Botón Guardar / Subir */}
                      <button
                        type="submit"
                        disabled={uploadingSticker() || processingSticker() || !processedSticker() || !stickerName().trim()}
                        class="w-full py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition shadow-xs disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Show
                          when={uploadingSticker()}
                          fallback={
                            <>
                              <Upload size={14} />
                              <span>Guardar Sticker en WhatsApp</span>
                            </>
                          }
                        >
                          <RefreshCw size={14} class="animate-spin" />
                          <span>Subiendo sticker...</span>
                        </Show>
                      </button>
                    </form>
                  </div>
                </div>

                {/* Grid de Stickers Existentes */}
                <div class="lg:col-span-7 space-y-4">
                  <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5">
                    <div class="flex items-center justify-between border-b border-edge pb-2.5">
                      <h3 class="text-xs font-bold text-body uppercase tracking-wider flex items-center gap-1.5 text-accent-text">
                        <Sparkles size={14} class="text-accent" />
                        <span>Colección Actual ({stickers().length})</span>
                      </h3>
                      <span class="text-[10px] text-muted">Listos para usar en chat</span>
                    </div>

                    <Show
                      when={!loadingStickers()}
                      fallback={
                        <div class="py-12 text-center text-xs text-muted flex flex-col items-center gap-2">
                          <RefreshCw size={18} class="animate-spin text-accent" />
                          <span>Cargando stickers guardados...</span>
                        </div>
                      }
                    >
                      <Show
                        when={stickers().length > 0}
                        fallback={
                          <div class="py-12 text-center space-y-2.5 bg-app/30 rounded-xl border border-edge/40">
                            <div class="w-12 h-12 rounded-xl bg-elevate text-muted flex items-center justify-center mx-auto">
                              <StickerIcon size={24} />
                            </div>
                            <p class="text-xs font-semibold text-body">No hay stickers registrados todavía</p>
                            <p class="text-[11px] text-muted max-w-sm mx-auto">
                              Sube tu primer sticker usando el formulario de la izquierda. Estará disponible de inmediato en la bandeja de entrada para todos los asesores.
                            </p>
                          </div>
                        }
                      >
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[560px] overflow-y-auto p-1 pr-1.5">
                          <For each={stickers()}>
                            {(stk) => (
                              <div class="group relative p-2.5 rounded-xl bg-app border border-edge hover:border-accent/40 transition flex flex-col items-center text-center space-y-2 shadow-xs">
                                {/* Botón eliminar flotante */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSticker(stk.id, stk.name)}
                                  disabled={deletingStickerId() === stk.id}
                                  class="absolute top-2 right-2 w-6 h-6 rounded-md bg-red-600/80 hover:bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition cursor-pointer shadow-xs z-20"
                                  title={`Eliminar sticker "${stk.name}"`}
                                >
                                  <Show
                                    when={deletingStickerId() === stk.id}
                                    fallback={<Trash2 size={12} />}
                                  >
                                    <RefreshCw size={11} class="animate-spin" />
                                  </Show>
                                </button>

                                {/* Preview de imagen con patrón de transparencia sutil */}
                                <div class="w-full h-24 sm:h-28 rounded-lg bg-black/20 flex items-center justify-center p-2 relative overflow-hidden border border-edge/30">
                                  <img
                                    src={stk.url}
                                    alt={stk.name}
                                    loading="lazy"
                                    class="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                                  />
                                </div>

                                {/* Metadatos */}
                                <div class="w-full space-y-1">
                                  <p class="text-xs font-semibold text-body truncate" title={stk.name}>
                                    {stk.name}
                                  </p>
                                  <div class="flex items-center justify-center gap-1.5">
                                    <Show
                                      when={stk.animated}
                                      fallback={
                                        <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                          Estático
                                        </span>
                                      }
                                    >
                                      <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/25 flex items-center gap-0.5">
                                        <Film size={9} />
                                        <span>Animado</span>
                                      </span>
                                    </Show>
                                    <span class="text-[10px] text-muted font-mono">
                                      {formatBytesToKb(stk.size_bytes)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </Layout>
  );
}
