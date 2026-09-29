import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { api } from '../api';
import { WhatsAppSettings as SettingsType, WebhookInfo, KnowledgeBaseEntry } from '../types';

export default function WhatsAppSettings() {
  const [activeTab, setActiveTab] = createSignal<'connection' | 'ai' | 'kb'>('connection');
  const [settings, setSettings] = createSignal<(SettingsType & { env_configured?: boolean }) | null>(null);
  const [webhook, setWebhook] = createSignal<WebhookInfo | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = createSignal(false);

  // Form Fields para IA
  const [aiEnabled, setAiEnabled] = createSignal(true);
  const [aiModel, setAiModel] = createSignal('@cf/meta/llama-3.1-8b-instruct');
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
        setAiModel(res.settings.ai_model || '@cf/meta/llama-3.1-8b-instruct');
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
          message: `¡Conexión Exitosa con Meta Graph API v25.0! Número verificado: ${res.details?.display_phone_number || settings()?.phone_number_id} (${res.details?.verified_name || 'Fitness Club'})`,
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

  return (
    <Layout title="Configuración WhatsApp & IA">
      <div class="max-w-5xl mx-auto space-y-6">
        {/* Header Title */}
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-black text-body flex items-center gap-2">
              <span>⚙️</span>
              <span>Integración Meta WhatsApp Cloud API (v25.0) & IA</span>
            </h1>
            <p class="text-xs text-muted">
              Credenciales gestionadas mediante variables de entorno del servidor para máxima seguridad y aislamiento.
            </p>
          </div>

          <Show when={savedSuccess()}>
            <span class="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold animate-fade-in">
              ✓ Cambios guardados
            </span>
          </Show>
        </div>

        {/* Tab Switcher */}
        <div class="flex items-center gap-2 border-b border-edge pb-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab() === 'connection'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            📱 Conexión Meta WhatsApp (v25.0)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab() === 'ai'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            🤖 Agente Comercial Workers AI
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kb')}
            class={`px-4 py-2 rounded-xl transition cursor-pointer ${
              activeTab() === 'kb'
                ? 'bg-accent text-white shadow-md'
                : 'text-muted hover:text-body hover:bg-elevate'
            }`}
          >
            📚 Catálogo & Precios (Knowledge Base)
          </button>
        </div>

        <Show when={!loading()} fallback={<div class="p-8 text-center text-xs text-muted animate-pulse">Cargando ajustes...</div>}>
          {/* TAB 1: CONEXIÓN META WHATSAPP */}
          <Show when={activeTab() === 'connection'}>
            <div class="space-y-6">
              {/* Security Shield Banner */}
              <div class="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-xs">
                <span class="text-xl">🛡️</span>
                <div class="space-y-1">
                  <p class="font-extrabold text-emerald-400">
                    Modo de Alta Seguridad Activo (Single Number Environment Variables)
                  </p>
                  <p class="text-body-soft leading-relaxed text-[11px]">
                    Las credenciales de WhatsApp se leen directamente desde el entorno seguro de Cloudflare Workers (<code class="font-mono text-emerald-300">.env</code> / <code class="font-mono text-emerald-300">.dev.vars</code>). No se almacenan en base de datos ni se exponen a través del navegador.
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
                        {settings()?.env_configured
                          ? `Phone Number ID: ${settings()?.phone_number_id} • Token: ••••••••••••••••${settings()?.tokenLast4}`
                          : 'Añade META_WA_PHONE_NUMBER_ID y META_WA_ACCESS_TOKEN a tu archivo .env o panel Cloudflare'}
                      </p>
                    </div>
                  </div>

                  <span class="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-app border border-edge text-emerald-400">
                    Graph API v25.0
                  </span>
                </div>

                <Show when={testResult()}>
                  <div class={`p-3 rounded-xl text-xs font-bold border ${
                    testResult()?.success
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {testResult()?.message}
                  </div>
                </Show>

                <div class="flex items-center justify-between pt-2 border-t border-edge/60">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing() || !settings()?.env_configured}
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <span>{testing() ? 'Verificando con Meta...' : '🔌 Probar Conexión con Meta v25.0'}</span>
                  </button>

                  <span class="text-[11px] text-muted">
                    Prueba el token y número configurados en el entorno en tiempo real.
                  </span>
                </div>
              </div>

              {/* Webhook Configuration Card for Meta Developer Portal */}
              <div class="p-5 rounded-2xl bg-gradient-to-br from-surface to-elevate border border-accent/30 space-y-3">
                <div class="flex items-center gap-2">
                  <span class="text-lg">🔗</span>
                  <h3 class="text-xs font-black text-body">Datos para configurar en Meta for Developers</h3>
                </div>
                <p class="text-[11px] text-muted leading-relaxed">
                  Copia estos dos campos en la sección <strong>WhatsApp → Configuración → Webhook</strong> de tu aplicación en developers.facebook.com:
                </p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-muted uppercase">URL de devolución de llamada (Webhook URL):</span>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={webhook()?.url || 'https://tu-dominio.com/api/whatsapp/webhook'}
                        class="flex-1 px-3 py-2 bg-app border border-edge rounded-xl text-xs font-mono text-body select-all"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(webhook()?.url || '', 'URL del Webhook')}
                        class="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div class="space-y-1">
                    <span class="text-[10px] font-bold text-muted uppercase">Identificador de verificación (Verify Token):</span>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        readonly
                        value={settings()?.verify_token || 'fitnessclub_secure_verify_token_2026'}
                        class="flex-1 px-3 py-2 bg-app border border-edge rounded-xl text-xs font-mono text-body select-all"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(settings()?.verify_token || '', 'Verify Token')}
                        class="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>

                <div class="p-3 rounded-xl bg-app border border-edge text-[11px] text-muted space-y-1">
                  <p class="font-bold text-body">Campos de suscripción requeridos en Meta:</p>
                  <p>En el portal de Meta for Developers, suscríbete a los eventos <code class="text-accent-text font-bold">messages</code> y <code class="text-accent-text font-bold">message_template_status_update</code>.</p>
                </div>
              </div>

              {/* Environment Variables Reference Card */}
              <div class="p-5 rounded-2xl bg-surface border border-edge space-y-3">
                <h3 class="text-xs font-black text-body">Guía de Variables en tu archivo .env</h3>
                <pre class="p-4 rounded-xl bg-app border border-edge text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
{`# Meta WhatsApp Cloud API (v25.0)
META_GRAPH_API_VERSION=v25.0
META_GRAPH_BASE_URL=https://graph.facebook.com
META_WA_PHONE_NUMBER_ID=109283746591029
META_WA_ACCESS_TOKEN=EAAB...tu_token_permanente...
META_WA_WABA_ID=109283746591029
META_WA_VERIFY_TOKEN=fitnessclub_secure_verify_token_2026
META_APP_SECRET=opcional_para_firma_hmac`}
                </pre>
              </div>
            </div>
          </Show>

          {/* TAB 2: AGENTE COMERCIAL CON CLOUDFLARE WORKERS AI */}
          <Show when={activeTab() === 'ai'}>
            <form onSubmit={handleSaveAiSettings} class="p-6 rounded-2xl bg-surface border border-edge space-y-5 text-xs">
              <div class="flex items-center justify-between pb-3 border-b border-edge">
                <div>
                  <h3 class="text-sm font-extrabold text-body">
                    Motor de Cierre de Ventas con Cloudflare Workers AI
                  </h3>
                  <p class="text-[11px] text-muted">
                    Ejecuta inferencia directa con bindings nativos de Cloudflare en el Edge sin depender de APIs de terceros.
                  </p>
                </div>

                <label class="flex items-center gap-2 cursor-pointer font-bold select-none">
                  <span>{aiEnabled() ? '🤖 IA Activa' : '🛑 IA Apagada'}</span>
                  <input
                    type="checkbox"
                    checked={aiEnabled()}
                    onChange={(e) => setAiEnabled(e.currentTarget.checked)}
                    class="w-4 h-4 rounded text-accent focus:ring-accent"
                  />
                </label>
              </div>

              {/* Selector de Modelo */}
              <div class="space-y-1">
                <label class="font-bold text-muted">Modelo de Cloudflare Workers AI:</label>
                <select
                  value={aiModel()}
                  onChange={(e) => setAiModel(e.currentTarget.value)}
                  class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="@cf/meta/llama-3.1-8b-instruct">
                    @cf/meta/llama-3.1-8b-instruct (Ultra rápido, latencia mínima ideal para chat)
                  </option>
                  <option value="@cf/meta/llama-3.3-70b-instruct">
                    @cf/meta/llama-3.3-70b-instruct (Razonamiento profundo para ventas y objeciones complejas)
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
                  placeholder="Ej: enérgico, motivador, empático y altamente enfocado en cerrar ventas"
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
                  placeholder="Ej: Siempre busca descubrir la meta deportiva principal (pérdida de grasa, hipertrofia o salud). Ofrece una clase de valoración diagnóstica sin costo en su sede más cercana y propón dos horarios alternativos..."
                  class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent leading-relaxed"
                />
              </div>

              <div class="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving()}
                  class="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {saving() ? 'Guardando...' : 'Guardar Ajustes de IA'}
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
                    Esta información es la única fuente de verdad inyectada a la IA para evitar alucinaciones en precios y promociones.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openNewKbModal}
                  class="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <span>+</span>
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
                          {entry.category.replace('_', ' ')}
                        </span>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => openEditKbModal(entry)}
                            class="p-1 hover:bg-elevate rounded text-xs text-muted hover:text-body cursor-pointer"
                            title="Editar"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKb(entry.id)}
                            class="p-1 hover:bg-elevate rounded text-xs text-rose-400 cursor-pointer"
                            title="Eliminar"
                          >
                            🗑️
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
        </Show>

        {/* Modal Nueva / Editar Entrada de KB */}
        <Show when={showKbModal()}>
          <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="w-full max-w-lg bg-surface border border-edge rounded-3xl p-6 space-y-4 shadow-2xl animate-fade-in">
              <div class="flex items-center justify-between border-b border-edge pb-3">
                <h3 class="text-sm font-black text-body">
                  {editingKbId() ? 'Editar Entrada de Catálogo' : 'Nueva Entrada de Conocimiento'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowKbModal(false)}
                  class="text-muted hover:text-body text-sm font-bold cursor-pointer"
                >
                  ✕
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
                    <option value="plan_precio">Planes y Precios</option>
                    <option value="horario_sede">Sedes y Horarios</option>
                    <option value="objecion_frecuente">Manejo de Objeción Frecuente</option>
                    <option value="politica">Políticas y Garantías</option>
                    <option value="entrenadores">Coaches y Especialidades</option>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="font-bold text-muted">Título / Servicio:</label>
                  <input
                    type="text"
                    required
                    value={kbTitle()}
                    onInput={(e) => setKbTitle(e.currentTarget.value)}
                    placeholder="Ej: Membresía CrossFit Pro"
                    class="w-full px-3 py-2 bg-app border border-edge rounded-xl text-xs text-body focus:outline-none focus:border-accent"
                  />
                </div>

                <div class="space-y-1">
                  <label class="font-bold text-muted">Contenido / Precios / Argumentos:</label>
                  <textarea
                    rows={4}
                    required
                    value={kbContent()}
                    onInput={(e) => setKbContent(e.currentTarget.value)}
                    placeholder="Detalla precios, qué incluye y beneficios que la IA debe comunicar..."
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
