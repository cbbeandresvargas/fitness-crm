import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api, FcImportPreviewResult, FcImportCommitResult } from '../api';
import { User } from '../types';

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
        `Excel analizado (hoja "${res.sheetName}"): ${res.summary.totalRows} filas — ${res.summary.newCount} nuevas, ${res.summary.existingCount} existentes, ${res.summary.invalidCount} inválidas`,
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
      <div class="space-y-8 max-w-6xl mx-auto">
        {/* Cabecera descriptiva */}
        <div class="p-8 rounded-3xl bg-surface border border-edge space-y-3">
          <h2 class="text-2xl font-black text-body">Importación Masiva & Respaldos R2</h2>
          <p class="text-xs text-muted max-w-2xl leading-relaxed">
            Sube listas de contactos desde Meta Ads, Excel o campañas externas. Nuestro motor detecta duplicados por número telefónico, evalúa el segmento dinámico y distribuye los prospectos de forma balanceada.
          </p>
        </div>

        {/* ===== Importación FC: Excel .xlsx (hoja "Clientes") ===== */}
        <div class="p-6 sm:p-8 rounded-3xl bg-surface border-2 border-accent/40 space-y-5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1.5">
              <h3 class="font-extrabold text-body text-base">
                📥 Importar Excel FC (.xlsx) — Hoja "Clientes"
              </h3>
              <p class="text-xs text-muted max-w-2xl leading-relaxed">
                Migra el Excel real del negocio. La columna{' '}
                <b class="text-violet-400">"Estado"</b> del Excel se guarda como{' '}
                <b>Estado de Membresía</b> (Nueva, Caducada, Agotada, Sin confirmar) —{' '}
                <b>nunca</b> como Estado del Lead. Los registros nuevos inician con Estado del Lead{' '}
                <b class="text-accent-text">Nuevo</b>. Los duplicados se detectan por WhatsApp,
                Email y CI, y sólo se completan campos vacíos del CRM.
              </p>
            </div>

            <Show when={fcPhase() === 'idle'}>
              <label class="px-5 py-3 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl shadow-accent-glow transition text-center cursor-pointer whitespace-nowrap">
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
            <div class="p-4 rounded-2xl bg-red-950/80 border border-red-800 text-red-200 text-xs font-semibold flex items-center gap-3">
              <span class="text-base">⚠️</span>
              <span>{fcError()}</span>
            </div>
          </Show>

          {/* Previsualización: clasificación por fila, antes de tocar la base de datos */}
          <Show when={fcPhase() === 'preview' && fcPreview()}>
            {(p) => (
              <div class="space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="px-3 py-1.5 rounded-full bg-elevate border border-edge-strong text-body-soft text-[11px] font-bold">
                    Total filas: {p().summary.totalRows}
                  </span>
                  <span class="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
                    🆕 Nuevos: {p().summary.newCount}
                  </span>
                  <span class="px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-[11px] font-bold">
                    ♻️ Existentes: {p().summary.existingCount}
                  </span>
                  <span class="px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[11px] font-bold">
                    ⚠️ Inválidos: {p().summary.invalidCount}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <span class="font-bold">Conceptos independientes:</span>
                  <span class="px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent-text font-bold">
                    Estado del Lead = proceso comercial
                  </span>
                  <span class="px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-400 font-bold">
                    Estado de Membresía = dato del Excel
                  </span>
                </div>

                <div class="overflow-auto max-h-96 rounded-2xl border border-edge">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-app text-muted font-bold uppercase text-[10px] sticky top-0">
                      <tr>
                        <th class="p-3 border-b border-edge">Fila</th>
                        <th class="p-3 border-b border-edge">Nombre</th>
                        <th class="p-3 border-b border-edge">Apellido</th>
                        <th class="p-3 border-b border-edge">WhatsApp</th>
                        <th class="p-3 border-b border-edge">Email</th>
                        <th class="p-3 border-b border-edge">CI</th>
                        <th class="p-3 border-b border-edge">Membresías</th>
                        <th class="p-3 border-b border-edge">NRO</th>
                        <th class="p-3 border-b border-edge">Estado del Lead</th>
                        <th class="p-3 border-b border-edge">Estado de Membresía</th>
                        <th class="p-3 border-b border-edge">Resultado</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-edge/60 bg-app/40">
                      <For each={p().rows}>
                        {(row) => (
                          <tr>
                            <td class="p-3 whitespace-nowrap text-muted font-mono">{row.rowNumber}</td>
                            <td class="p-3 whitespace-nowrap text-body font-semibold">{row.data.firstName}</td>
                            <td class="p-3 whitespace-nowrap text-body font-semibold">{row.data.lastName}</td>
                            <td class="p-3 whitespace-nowrap text-body-soft">{row.data.whatsapp || '—'}</td>
                            <td class="p-3 whitespace-nowrap text-body-soft">{row.data.email || '—'}</td>
                            <td class="p-3 whitespace-nowrap text-body-soft">{row.data.ci || '—'}</td>
                            <td class="p-3 whitespace-nowrap text-body-soft">
                              {row.data.membershipCount !== undefined ? row.data.membershipCount : '—'}
                            </td>
                            <td class="p-3 whitespace-nowrap text-body-soft">{row.data.nro ?? '—'}</td>
                            <td class="p-3 whitespace-nowrap">
                              <span class="px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent-text font-bold text-[10px]">
                                {LEAD_STATUS_LABELS[row.leadStatus] || row.leadStatus}
                              </span>
                            </td>
                            <td class="p-3 whitespace-nowrap">
                              <Show
                                when={row.data.membershipStatus}
                                fallback={<span class="text-muted">—</span>}
                              >
                                <span class="px-2.5 py-1 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-400 font-bold text-[10px]">
                                  {row.data.membershipStatus}
                                </span>
                              </Show>
                            </td>
                            <td class="p-3 min-w-[200px]">
                              <Show
                                when={row.type === 'new'}
                                fallback={
                                  <Show
                                    when={row.type === 'existing'}
                                    fallback={
                                      <span class="text-red-400 font-semibold text-[10px]">
                                        ⛔ {row.reason}
                                      </span>
                                    }
                                  >
                                    <span class="text-blue-400 font-semibold text-[10px]">
                                      ♻️ Existente ({row.matchedLead?.full_name})
                                    </span>
                                    <Show when={row.syncFields && row.syncFields.length > 0}>
                                      <span class="block text-muted text-[10px] mt-0.5">
                                        Completará: {row.syncFields!.join(', ')}
                                      </span>
                                    </Show>
                                  </Show>
                                }
                              >
                                <span class="text-emerald-400 font-semibold text-[10px]">
                                  🆕 Nuevo registro
                                </span>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>

                <div class="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetFcImport}
                    disabled={fcWorking()}
                    class="px-5 py-2.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-bold rounded-2xl transition cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleFcConfirm}
                    disabled={fcWorking() || p().summary.newCount + p().summary.existingCount === 0}
                    class="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl shadow-accent-glow transition cursor-pointer disabled:opacity-50"
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
              <div class="p-6 rounded-3xl bg-emerald-950/40 border border-emerald-800 space-y-3">
                <h3 class="font-extrabold text-emerald-300 text-sm">
                  ✅ Importación FC Completada (hoja "{r().sheetName}")
                </h3>
                <div class="flex flex-wrap items-center gap-6 text-xs text-emerald-200">
                  <div>
                    Nuevos creados: <span class="font-bold">{r().summary.created}</span>
                  </div>
                  <div>
                    Existentes sincronizados: <span class="font-bold">{r().summary.updated}</span>
                  </div>
                  <div>
                    Sin cambios: <span class="font-bold">{r().summary.unchanged}</span>
                  </div>
                  <div>
                    Inválidos omitidos: <span class="font-bold">{r().summary.invalid}</span>
                  </div>
                </div>

                <Show when={r().invalidRows.length > 0}>
                  <div class="pt-2 border-t border-emerald-800/60 space-y-1.5 max-h-48 overflow-y-auto">
                    <p class="text-[11px] font-bold text-emerald-300">
                      Filas omitidas y su razón:
                    </p>
                    <For each={r().invalidRows}>
                      {(inv) => (
                        <p class="text-[11px] text-red-300">
                          Fila {inv.rowNumber} · {inv.name}: {inv.reason}
                        </p>
                      )}
                    </For>
                  </div>
                </Show>

                <button
                  type="button"
                  onClick={resetFcImport}
                  class="px-5 py-2.5 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-bold rounded-2xl transition cursor-pointer"
                >
                  Importar otro archivo
                </button>
              </div>
            )}
          </Show>
        </div>

        {/* Sección de Carga */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Opción 1: CSV de prueba */}
          <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <span class="text-2xl block">⚡</span>
              <h3 class="font-extrabold text-body text-base">Probar con Datos Demo</h3>
              <p class="text-xs text-muted">
                Carga un dataset prearmado de 5 prospectos con presupuestos, metas deportivas y datos de ubicación (CDMX, Guadalajara y Monterrey).
              </p>
            </div>

            <button
              type="button"
              onClick={loadSample}
              disabled={loading()}
              class="w-full py-3 bg-elevate hover:bg-elevate-strong text-body-soft text-xs font-bold rounded-2xl border border-edge-strong transition cursor-pointer disabled:opacity-50"
            >
              {loading() ? 'Cargando...' : 'Cargar CSV Demo (1 Clic)'}
            </button>
          </div>

          {/* Opción 2: Subir archivo propio */}
          <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <span class="text-2xl block">📁</span>
              <h3 class="font-extrabold text-body text-base">Subir Archivo CSV</h3>
              <p class="text-xs text-muted">
                Selecciona cualquier archivo exportado de Google Sheets, Meta Ads o tu CRM anterior.
              </p>
            </div>

            <label class="w-full py-3 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-2xl shadow-accent-glow transition text-center cursor-pointer block">
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
          <div class="p-6 rounded-3xl bg-surface border border-edge space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-body">Mapeo Dinámico de Columnas</h3>
                <p class="text-xs text-muted">
                  Total de filas detectadas: <span class="font-bold text-accent-text">{totalRows()}</span>
                </p>
              </div>

              <div>
                <label class="text-xs font-bold text-muted mr-2">Asignar a:</label>
                <select
                  value={assignedTo()}
                  onChange={(e) => setAssignedTo(e.currentTarget.value)}
                  class="px-3 py-1.5 bg-app border border-edge rounded-xl text-xs text-body"
                >
                  <option value="auto">🤖 Balance Automático (Round-Robin)</option>
                  <For each={agents()}>
                    {(a) => <option value={a.id}>{a.name}</option>}
                  </For>
                </select>
              </div>
            </div>

            {/* Selectores de columnas */}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <div class="p-3 bg-app rounded-2xl border border-edge/80 space-y-1">
                  <label class="block text-[11px] font-bold text-muted">{field.label}</label>
                  <select
                    value={field.val()}
                    onChange={(e) => field.set(e.currentTarget.value)}
                    class="w-full bg-surface border border-edge rounded-xl px-2.5 py-1.5 text-xs text-body-soft"
                  >
                    <For each={headers()}>
                      {(h) => <option value={h}>{h}</option>}
                    </For>
                  </select>
                </div>
              ))}
            </div>

            {/* Muestra de Primeras 5 Filas */}
            <div class="space-y-2">
              <span class="text-xs font-bold text-muted">Previsualización (Primeras filas):</span>
              <div class="overflow-x-auto rounded-2xl border border-edge">
                <table class="w-full text-left text-xs text-body-soft">
                  <thead class="bg-app text-muted font-bold uppercase text-[10px]">
                    <tr>
                      <For each={headers()}>
                        {(h) => <th class="p-3 border-b border-edge">{h}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-edge/60 bg-app/40">
                    <For each={previewRows()}>
                      {(row) => (
                        <tr>
                          <For each={headers()}>
                            {(h) => <td class="p-3 whitespace-nowrap">{row[h] || '-'}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Botón de Ejecución */}
            <div class="flex items-center justify-end gap-3 pt-4 border-t border-edge">
              <button
                type="button"
                onClick={handleProcess}
                disabled={loading()}
                class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {loading() ? 'Procesando Lote...' : `Importar ${totalRows()} Prospectos al CRM`}
              </button>
            </div>
          </div>
        </Show>

        {/* Resultado de la importación */}
        <Show when={importResult()}>
          <div class="p-6 rounded-3xl bg-emerald-950/40 border border-emerald-800 space-y-2">
            <h3 class="font-extrabold text-emerald-300 text-sm">✅ Importación Completada</h3>
            <div class="flex items-center gap-6 text-xs text-emerald-200">
              <div>
                Nuevos agregados: <span class="font-bold">{importResult()?.importedCount}</span>
              </div>
              <div>
                Duplicados omitidos: <span class="font-bold">{importResult()?.skippedDuplicates}</span>
              </div>
              <div>
                Filas con error: <span class="font-bold">{importResult()?.errorsCount}</span>
              </div>
            </div>
          </div>
        </Show>

        {/* Sección de Exportación & Respaldo */}
        <div class="p-6 rounded-3xl bg-surface border border-edge space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-extrabold text-body text-base">Exportar Datos & Respaldos en Cloudflare R2</h3>
              <p class="text-xs text-muted">
                Descarga tus prospectos en formatos estándar o almacena una instantánea en tu bucket R2.
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/api/export/csv"
              class="p-4 rounded-2xl bg-app border border-edge hover:border-accent/50 transition flex items-center justify-center gap-2 text-xs font-bold text-body-soft"
            >
              <span>📊</span>
              <span>Descargar CSV</span>
            </a>

            <a
              href="/api/export/json"
              class="p-4 rounded-2xl bg-app border border-edge hover:border-accent/50 transition flex items-center justify-center gap-2 text-xs font-bold text-body-soft"
            >
              <span>📦</span>
              <span>Descargar JSON</span>
            </a>

            <button
              type="button"
              onClick={handleR2Backup}
              disabled={backingUp()}
              class="p-4 rounded-2xl bg-app border border-edge hover:border-emerald-500/50 transition flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer disabled:opacity-50"
            >
              <span>☁️</span>
              <span>{backingUp() ? 'Guardando en R2...' : 'Generar Copia en R2'}</span>
            </button>
          </div>

          <Show when={backupKey()}>
            <p class="text-xs text-emerald-400/90 pt-2 font-mono">
              ✓ Respaldo creado en R2: <span class="text-body font-bold">{backupKey()}</span>
            </p>
          </Show>
        </div>
      </div>
    </Layout>
  );
}
