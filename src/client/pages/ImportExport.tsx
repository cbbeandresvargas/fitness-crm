import { createSignal, onMount, For, Show } from 'solid-js';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { User } from '../types';

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
  const [colBranch, setColBranch] = createSignal('Sede');
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

      const res = (await fetch('/api/import/preview', {
        method: 'POST',
        body: formData,
      }).then((r) => r.json())) as any;

      if (res.error) throw new Error(res.error);

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
        col_branch: colBranch(),
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

  return (
    <Layout title="Subir o Bajar Excel (CSV / R2)">
      <div class="space-y-8 max-w-6xl mx-auto">
        {/* Cabecera descriptiva */}
        <div class="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h2 class="text-2xl font-black text-white">Importación Masiva & Respaldos R2</h2>
          <p class="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Sube listas de contactos desde Meta Ads, Excel o campañas externas. Nuestro motor detecta duplicados por número telefónico, evalúa el segmento dinámico y distribuye los prospectos de forma balanceada.
          </p>
        </div>

        {/* Sección de Carga */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Opción 1: CSV de prueba */}
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <span class="text-2xl block">⚡</span>
              <h3 class="font-extrabold text-white text-base">Probar con Datos Demo</h3>
              <p class="text-xs text-zinc-400">
                Carga un dataset prearmado de 5 prospectos con presupuestos, metas deportivas y sedes en CDMX, Guadalajara y Monterrey.
              </p>
            </div>

            <button
              type="button"
              onClick={loadSample}
              disabled={loading()}
              class="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-2xl border border-zinc-700 transition cursor-pointer disabled:opacity-50"
            >
              {loading() ? 'Cargando...' : 'Cargar CSV Demo (1 Clic)'}
            </button>
          </div>

          {/* Opción 2: Subir archivo propio */}
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 flex flex-col justify-between">
            <div class="space-y-2">
              <span class="text-2xl block">📁</span>
              <h3 class="font-extrabold text-white text-base">Subir Archivo CSV</h3>
              <p class="text-xs text-zinc-400">
                Selecciona cualquier archivo exportado de Google Sheets, Meta Ads o tu CRM anterior.
              </p>
            </div>

            <label class="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-2xl shadow-orange-glow transition text-center cursor-pointer block">
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
          <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">Mapeo Dinámico de Columnas</h3>
                <p class="text-xs text-zinc-400">
                  Total de filas detectadas: <span class="font-bold text-orange-400">{totalRows()}</span>
                </p>
              </div>

              <div>
                <label class="text-xs font-bold text-zinc-400 mr-2">Asignar a:</label>
                <select
                  value={assignedTo()}
                  onChange={(e) => setAssignedTo(e.currentTarget.value)}
                  class="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
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
                { label: 'Sede', val: colBranch, set: setColBranch },
                { label: 'Etiquetas / Tags', val: colTags, set: setColTags },
              ].map((field) => (
                <div class="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1">
                  <label class="block text-[11px] font-bold text-zinc-400">{field.label}</label>
                  <select
                    value={field.val()}
                    onChange={(e) => field.set(e.currentTarget.value)}
                    class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200"
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
              <span class="text-xs font-bold text-zinc-400">Previsualización (Primeras filas):</span>
              <div class="overflow-x-auto rounded-2xl border border-zinc-800">
                <table class="w-full text-left text-xs text-zinc-300">
                  <thead class="bg-zinc-950 text-zinc-500 font-bold uppercase text-[10px]">
                    <tr>
                      <For each={headers()}>
                        {(h) => <th class="p-3 border-b border-zinc-800">{h}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-zinc-800/60 bg-zinc-950/40">
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
            <div class="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
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
        <div class="p-6 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-extrabold text-white text-base">Exportar Datos & Respaldos en Cloudflare R2</h3>
              <p class="text-xs text-zinc-400">
                Descarga tus prospectos en formatos estándar o almacena una instantánea en tu bucket R2.
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/api/export/csv"
              class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-orange-500/50 transition flex items-center justify-center gap-2 text-xs font-bold text-zinc-200"
            >
              <span>📊</span>
              <span>Descargar CSV</span>
            </a>

            <a
              href="/api/export/json"
              class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-orange-500/50 transition flex items-center justify-center gap-2 text-xs font-bold text-zinc-200"
            >
              <span>📦</span>
              <span>Descargar JSON</span>
            </a>

            <button
              type="button"
              onClick={handleR2Backup}
              disabled={backingUp()}
              class="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 transition flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer disabled:opacity-50"
            >
              <span>☁️</span>
              <span>{backingUp() ? 'Guardando en R2...' : 'Generar Copia en R2'}</span>
            </button>
          </div>

          <Show when={backupKey()}>
            <p class="text-xs text-emerald-400/90 pt-2 font-mono">
              ✓ Respaldo creado en R2: <span class="text-white font-bold">{backupKey()}</span>
            </p>
          </Show>
        </div>
      </div>
    </Layout>
  );
}
