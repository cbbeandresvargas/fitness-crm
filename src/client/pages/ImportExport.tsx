import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api, FcImportPreviewResult, FcImportCommitResult } from '../api';
import { User } from '../types';
import {
  FileSpreadsheet,
  TriangleAlert,
  UserPlus,
  RefreshCw,
  CircleAlert,
  CircleCheck,
  Zap,
  FolderOpen,
  Database,
  CloudUpload,
  Check,
} from 'lucide-solid';

const LEAD_STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

export default function ImportExport() {
  const { showToast } = useAuth();

  const [loading, setLoading] = createSignal(false);
  const [fileKey, setFileKey] = createSignal('');
  const [headers, setHeaders] = createSignal<string[]>([]);
  const [previewRows, setPreviewRows] = createSignal<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = createSignal(0);
  const [agents, setAgents] = createSignal<User[]>([]);

  // Column Mappings
  const [colName, setColName] = createSignal('Nombre Completo');
  const [colPhone, setColPhone] = createSignal('Telefono Movil');
  const [colEmail, setColEmail] = createSignal('Correo');
  const [colBudget, setColBudget] = createSignal('Presupuesto USD');
  const [colProduct, setColProduct] = createSignal('Programa Interes');
  const [colGoal, setColGoal] = createSignal('Objetivo Deportivo');
  const [colCity, setColCity] = createSignal('Ciudad');
  const [colTags, setColTags] = createSignal('Tags');
  const [assignedTo, setAssignedTo] = createSignal('auto');

  // Import Result
  const [importResult, setImportResult] = createSignal<{
    importedCount: number;
    skippedDuplicates: number;
    errorsCount: number;
  } | null>(null);

  // R2 Backup
  const [backupKey, setBackupKey] = createSignal('');
  const [backingUp, setBackingUp] = createSignal(false);

  const loadSample = async () => {
    try {
      setLoading(true);
      const res = await api.loadSampleCsv();
      setFileKey(res.fileKey);
      setHeaders(res.headers);
      setPreviewRows(res.previewRows);
      setTotalRows(res.totalRows);
      setAgents(res.agents);
      showToast('CSV de muestra cargado con éxito en R2 / KV', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error cargando CSV de muestra', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const text = await file.text();
      const formData = new FormData();
      formData.append('csvText', text);

      const res = await api.previewCsvImport(formData);

      setFileKey(res.fileKey);
      setHeaders(res.headers);
      setPreviewRows(res.previewRows);
      setTotalRows(res.totalRows);
      setAgents(res.agents);
      showToast(`Archivo "${file.name}" cargado (${res.totalRows} filas)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al procesar archivo CSV', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!fileKey()) return;
    try {
      setLoading(true);
      const res = await api.processImport({
        file_key: fileKey(),
        assigned_to: assignedTo(),
        col_name: colName(),
        col_phone: colPhone(),
        col_email: colEmail(),
        col_budget: colBudget(),
        col_product: colProduct(),
        col_goal: colGoal(),
        col_city: colCity(),
        col_tags: colTags(),
      });

      setImportResult({
        importedCount: res.importedCount,
        skippedDuplicates: res.skippedDuplicates,
        errorsCount: res.errorsCount,
      });

      showToast(`Importación completada: ${res.importedCount} leads importados`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al importar datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleR2Backup = async () => {
    try {
      setBackingUp(true);
      const res = await api.triggerR2Backup();
      setBackupKey(res.key);
      showToast(`Copia guardada en Cloudflare R2 (${res.count} leads)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error creando respaldo R2', 'error');
    } finally {
      setBackingUp(false);
    }
  };

  // FC Excel Import (.xlsx — hoja "Clientes")
  const [fcFile, setFcFile] = createSignal<File | null>(null);
  const [fcPhase, setFcPhase] = createSignal<'idle' | 'preview' | 'result'>('idle');
  const [fcWorking, setFcWorking] = createSignal(false);
  const [fcError, setFcError] = createSignal('');
  const [fcPreview, setFcPreview] = createSignal<FcImportPreviewResult | null>(null);
  const [fcResult, setFcResult] = createSignal<FcImportCommitResult | null>(null);

  const resetFcImport = () => {
    setFcFile(null);
    setFcPreview(null);
    setFcResult(null);
    setFcError('');
    setFcPhase('idle');
  };

  const handleFcFileSelected = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setFcFile(file);
    setFcPreview(null);
    setFcResult(null);
    setFcError('');
    setFcPhase('idle');
    input.value = '';

    try {
      setFcWorking(true);
      const res = await api.fcImportPreview(file);
      setFcPreview(res);
      setFcPhase('preview');
      showToast(
        `Excel analizado (hoja "${res.sheetName}"): ${res.summary.totalRows} filas`,
        'success'
      );
    } catch (err: any) {
      setFcError(err.message || 'Error al procesar el Excel');
      showToast(err.message || 'Error al procesar el Excel', 'error');
    } finally {
      setFcWorking(false);
    }
  };

  const handleFcConfirm = async () => {
    const file = fcFile();
    if (!file || !fcPreview()) return;
    try {
      setFcWorking(true);
      const res = await api.fcImportCommit(file);
      setFcResult(res);
      setFcPhase('result');
      showToast(
        `Importación FC completada: ${res.summary.created} creados, ${res.summary.updated} sincronizados`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Error al confirmar la importación', 'error');
    } finally {
      setFcWorking(false);
    }
  };

  return (
    <Layout title="Subir o Bajar Excel (CSV / R2)">
      <div class="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        {/* Cabecera descriptiva */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-1.5">
          <h2 class="text-base font-bold text-body">Importación Masiva & Respaldos R2</h2>
          <p class="text-xs text-muted max-w-2xl leading-relaxed">
            Sube listas de contactos desde Meta Ads, Excel o campañas externas. Nuestro motor detecta duplicados por número telefónico, evalúa el segmento dinámico y distribuye los prospectos de forma balanceada.
          </p>
        </div>

        {/* ===== Importación FC: Excel .xlsx (hoja "Clientes") ===== */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-accent/30 space-y-3.5 shadow-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <h3 class="font-bold text-body text-sm flex items-center gap-2">
                <FileSpreadsheet class="w-4 h-4 text-accent shrink-0" />
                <span>Importar Excel FC (.xlsx) — Hoja "Clientes"</span>
              </h3>
              <p class="text-xs text-muted max-w-2xl leading-relaxed">
                Migra el Excel real del negocio. La columna{' '}
                <b class="text-violet-400">"Estado"</b> del Excel se guarda como{' '}
                <b>Estado de Membresía</b> (Nueva, Caducada, Agotada, Sin confirmar) —{' '}
                <b>nunca</b> como Estado del Lead. Los registros nuevos inician con Estado del Lead{' '}
                <b class="text-accent-text">Nuevo</b>.
              </p>
            </div>

            <Show when={fcPhase() === 'idle'}>
              <label class="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-xs transition text-center cursor-pointer whitespace-nowrap">
                <span>{fcWorking() ? 'Analizando Excel...' : 'Seleccionar Excel (.xlsx)'}</span>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleFcFileSelected}
                  class="hidden"
                  disabled={fcWorking()}
                />
              </label>
            </Show>
          </div>

          <Show when={fcError()}>
            <div class="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium flex items-center gap-2">
              <TriangleAlert class="w-4 h-4 shrink-0 text-red-300" />
              <span>{fcError()}</span>
            </div>
          </Show>

          {/* Previsualización: clasificación por fila */}
          <Show when={fcPhase() === 'preview' && fcPreview()}>
            {(p) => (
              <div class="space-y-3 pt-2">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-md bg-elevate border border-edge text-body-soft text-[10px] font-medium">
                    Total: {p().summary.totalRows}
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                    <UserPlus class="w-3 h-3" />
                    <span>Nuevos: {p().summary.newCount}</span>
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-semibold">
                    <RefreshCw class="w-3 h-3" />
                    <span>Existentes: {p().summary.existingCount}</span>
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-semibold">
                    <TriangleAlert class="w-3 h-3" />
                    <span>Inválidos: {p().summary.invalidCount}</span>
                  </span>
                </div>

                <div class="overflow-auto max-h-80 rounded-lg border border-edge">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-app text-muted font-semibold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th class="py-2 px-3 border-b border-edge">Fila</th>
                        <th class="py-2 px-3 border-b border-edge">Nombre</th>
                        <th class="py-2 px-3 border-b border-edge">Apellido</th>
                        <th class="py-2 px-3 border-b border-edge">WhatsApp</th>
                        <th class="py-2 px-3 border-b border-edge">Email</th>
                        <th class="py-2 px-3 border-b border-edge">CI</th>
                        <th class="py-2 px-3 border-b border-edge">Membresías</th>
                        <th class="py-2 px-3 border-b border-edge">NRO</th>
                        <th class="py-2 px-3 border-b border-edge">Estado Lead</th>
                        <th class="py-2 px-3 border-b border-edge">Estado Membresía</th>
                        <th class="py-2 px-3 border-b border-edge">Resultado</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-edge/60 bg-app/40 text-xs">
                      <For each={p().rows}>
                        {(row) => (
                          <tr class="hover:bg-elevate/30 transition">
                            <td class="py-2 px-3 whitespace-nowrap text-muted font-mono text-[11px]">{row.rowNumber}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body font-medium">{row.data.firstName}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body font-medium">{row.data.lastName}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body-soft text-[11px]">{row.data.whatsapp || '—'}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body-soft text-[11px]">{row.data.email || '—'}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body-soft text-[11px]">{row.data.ci || '—'}</td>
                            <td class="py-2 px-3 whitespace-nowrap text-body-soft">
                              {row.data.membershipCount !== undefined ? row.data.membershipCount : '—'}
                            </td>
                            <td class="py-2 px-3 whitespace-nowrap text-body-soft">{row.data.nro ?? '—'}</td>
                            <td class="py-2 px-3 whitespace-nowrap">
                              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/15 border border-accent/25 text-accent-text">
                                {LEAD_STATUS_LABELS[row.leadStatus] || row.leadStatus}
                              </span>
                            </td>
                            <td class="py-2 px-3 whitespace-nowrap">
                              <Show
                                when={row.data.membershipStatus}
                                fallback={<span class="text-muted">—</span>}
                              >
                                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 border border-violet-500/25 text-violet-400">
                                  {row.data.membershipStatus}
                                </span>
                              </Show>
                            </td>
                            <td class="py-2 px-3 min-w-[180px]">
                              <Show
                                when={row.type === 'new'}
                                fallback={
                                  <Show
                                    when={row.type === 'existing'}
                                    fallback={
                                      <span class="text-red-400 font-medium text-[10px] inline-flex items-center gap-1">
                                        <CircleAlert class="w-3 h-3 text-red-400" />
                                        <span>{row.reason}</span>
                                      </span>
                                    }
                                  >
                                    <span class="text-blue-400 font-medium text-[10px] inline-flex items-center gap-1">
                                      <RefreshCw class="w-3 h-3 text-blue-400" />
                                      <span>Existente ({row.matchedLead?.full_name})</span>
                                    </span>
                                  </Show>
                                }
                              >
                                <span class="text-emerald-400 font-medium text-[10px] inline-flex items-center gap-1">
                                  <UserPlus class="w-3 h-3 text-emerald-400" />
                                  <span>Nuevo registro</span>
                                </span>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>

                <div class="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={resetFcImport}
                    disabled={fcWorking()}
                    class="px-3.5 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-medium rounded-lg transition cursor-pointer disabled:opacity-50 border border-edge"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleFcConfirm}
                    disabled={fcWorking() || p().summary.newCount + p().summary.existingCount === 0}
                    class="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {fcWorking()
                      ? 'Importando...'
                      : `Confirmar Importación (${p().summary.newCount} nuevos · ${p().summary.existingCount} existentes)`}
                  </button>
                </div>
              </div>
            )}
          </Show>

          {/* Resultado final de la importación FC */}
          <Show when={fcPhase() === 'result' && fcResult()}>
            {(r) => (
              <div class="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 space-y-2.5">
                <h3 class="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
                  <CircleCheck class="w-4 h-4 text-emerald-400" />
                  <span>Importación FC Completada (hoja "{r().sheetName}")</span>
                </h3>
                <div class="flex flex-wrap items-center gap-4 text-xs text-emerald-200">
                  <div>
                    Nuevos: <span class="font-bold">{r().summary.created}</span>
                  </div>
                  <div>
                    Sincronizados: <span class="font-bold">{r().summary.updated}</span>
                  </div>
                  <div>
                    Sin cambios: <span class="font-bold">{r().summary.unchanged}</span>
                  </div>
                  <div>
                    Omitidos: <span class="font-bold">{r().summary.invalid}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetFcImport}
                  class="px-3.5 py-1.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-medium rounded-lg transition cursor-pointer border border-edge mt-1"
                >
                  Importar otro archivo
                </button>
              </div>
            )}
          </Show>
        </div>

        {/* Sección de Carga */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Opción 1: CSV de prueba */}
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 flex flex-col justify-between shadow-xs">
            <div class="space-y-1.5">
              <Zap class="w-5 h-5 text-amber-400" />
              <h3 class="font-bold text-body text-sm">Probar con Datos Demo</h3>
              <p class="text-xs text-muted">
                Carga un dataset prearmado de 5 prospectos con presupuestos, metas deportivas y datos de ubicación.
              </p>
            </div>

            <button
              type="button"
              onClick={loadSample}
              disabled={loading()}
              class="w-full py-2 px-3 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-semibold rounded-lg border border-edge transition cursor-pointer disabled:opacity-50"
            >
              {loading() ? 'Cargando...' : 'Cargar CSV Demo'}
            </button>
          </div>

          {/* Opción 2: Subir archivo propio */}
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3 flex flex-col justify-between shadow-xs">
            <div class="space-y-1.5">
              <FolderOpen class="w-5 h-5 text-accent" />
              <h3 class="font-bold text-body text-sm">Subir Archivo CSV</h3>
              <p class="text-xs text-muted">
                Selecciona cualquier archivo exportado de Google Sheets, Meta Ads o tu CRM anterior.
              </p>
            </div>

            <label class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow-xs transition text-center cursor-pointer block">
              <span>Seleccionar Archivo CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                class="hidden"
              />
            </label>
          </div>
        </div>

        {/* Previsualización y Mapeo si hay archivo cargado */}
        <Show when={headers().length > 0}>
          <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-4 shadow-xs">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-sm font-bold text-body">Mapeo Dinámico de Columnas</h3>
                <p class="text-xs text-muted">
                  Total de filas: <span class="font-bold text-accent-text">{totalRows()}</span>
                </p>
              </div>

              <div>
                <label class="text-xs font-medium text-muted mr-2">Asignar a:</label>
                <select
                  value={assignedTo()}
                  onChange={(e) => setAssignedTo(e.currentTarget.value)}
                  class="px-2.5 py-1 bg-app border border-edge rounded-lg text-xs text-body cursor-pointer"
                >
                  <option value="auto">Balance Automático</option>
                  <For each={agents()}>
                    {(a) => <option value={a.id}>{a.name}</option>}
                  </For>
                </select>
              </div>
            </div>

            {/* Selectores de columnas */}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: 'Nombre Completo *', val: colName, set: setColName },
                { label: 'Teléfono Móvil *', val: colPhone, set: setColPhone },
                { label: 'Correo Electrónico', val: colEmail, set: setColEmail },
                { label: 'Presupuesto USD', val: colBudget, set: setColBudget },
                { label: 'Programa de Interés', val: colProduct, set: setColProduct },
                { label: 'Objetivo Deportivo', val: colGoal, set: setColGoal },
                { label: 'Ciudad', val: colCity, set: setColCity },
                { label: 'Etiquetas / Tags', val: colTags, set: setColTags },
              ].map((field) => (
                <div class="p-2.5 bg-app rounded-lg border border-edge space-y-1">
                  <label class="block text-[11px] font-medium text-muted">{field.label}</label>
                  <select
                    value={field.val()}
                    onChange={(e) => field.set(e.currentTarget.value)}
                    class="w-full bg-surface border border-edge rounded-lg px-2 py-1 text-xs text-body-soft cursor-pointer"
                  >
                    <For each={headers()}>
                      {(h) => <option value={h}>{h}</option>}
                    </For>
                  </select>
                </div>
              ))}
            </div>

            {/* Muestra de Primeras Filas */}
            <div class="space-y-1.5">
              <span class="text-xs font-semibold text-muted">Previsualización (Primeras filas):</span>
              <div class="overflow-x-auto rounded-lg border border-edge">
                <table class="w-full text-left text-xs text-body-soft">
                  <thead class="bg-app text-muted font-semibold uppercase text-[10px]">
                    <tr>
                      <For each={headers()}>
                        {(h) => <th class="py-2 px-3 border-b border-edge">{h}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-edge/60 bg-app/40 text-xs">
                    <For each={previewRows()}>
                      {(row) => (
                        <tr class="hover:bg-elevate/30 transition">
                          <For each={headers()}>
                            {(h) => <td class="py-2 px-3 whitespace-nowrap">{row[h] || '-'}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Botón de Ejecución */}
            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-edge">
              <button
                type="button"
                onClick={handleProcess}
                disabled={loading()}
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {loading() ? 'Procesando...' : `Importar ${totalRows()} Prospectos al CRM`}
              </button>
            </div>
          </div>
        </Show>

        {/* Resultado de la importación */}
        <Show when={importResult()}>
          <div class="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 space-y-1.5">
            <h3 class="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
              <CircleCheck class="w-4 h-4 text-emerald-400" />
              <span>Importación Completada</span>
            </h3>
            <div class="flex items-center gap-4 text-xs text-emerald-200">
              <div>
                Nuevos: <span class="font-bold">{importResult()?.importedCount}</span>
              </div>
              <div>
                Duplicados: <span class="font-bold">{importResult()?.skippedDuplicates}</span>
              </div>
              <div>
                Errores: <span class="font-bold">{importResult()?.errorsCount}</span>
              </div>
            </div>
          </div>
        </Show>

        {/* Sección de Exportación & Respaldo */}
        <div class="p-4 sm:p-5 rounded-xl bg-surface border border-edge space-y-3.5 shadow-xs">
          <div class="space-y-0.5">
            <h3 class="font-bold text-body text-sm">Exportar Datos & Respaldos en Cloudflare R2</h3>
            <p class="text-xs text-muted">
              Descarga tus prospectos en formatos estándar o almacena una instantánea en tu bucket R2.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="/api/export/csv"
              class="p-3 rounded-lg bg-app border border-edge hover:border-accent/50 transition flex items-center justify-center gap-2 text-xs font-semibold text-body-soft"
            >
              <FileSpreadsheet class="w-4 h-4 text-accent" />
              <span>Descargar CSV</span>
            </a>

            <a
              href="/api/export/json"
              class="p-3 rounded-lg bg-app border border-edge hover:border-accent/50 transition flex items-center justify-center gap-2 text-xs font-semibold text-body-soft"
            >
              <Database class="w-4 h-4 text-accent" />
              <span>Descargar JSON</span>
            </a>

            <button
              type="button"
              onClick={handleR2Backup}
              disabled={backingUp()}
              class="p-3 rounded-lg bg-app border border-edge hover:border-emerald-500/50 transition flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400 cursor-pointer disabled:opacity-50"
            >
              <CloudUpload class="w-4 h-4" />
              <span>{backingUp() ? 'Guardando en R2...' : 'Generar Copia en R2'}</span>
            </button>
          </div>

          <Show when={backupKey()}>
            <p class="text-xs text-emerald-400/90 pt-1 font-mono flex items-center gap-1.5">
              <Check class="w-3.5 h-3.5" />
              <span>Respaldo en R2: <span class="text-body font-semibold">{backupKey()}</span></span>
            </p>
          </Show>
        </div>
      </div>
    </Layout>
  );
}
