import { html } from 'hono/html';
import { User, SessionData } from '../lib/types';

interface ImportExportProps {
  user: SessionData;
  agents: User[];
  uploadedFileKey?: string;
  previewHeaders?: string[];
  previewRows?: Record<string, string>[];
  validationResults?: {
    validCount: number;
    duplicateCount: number;
    errorCount: number;
    details: {
      index: number;
      data: Record<string, string>;
      status: 'valid' | 'duplicate' | 'error';
      message: string;
    }[];
  };
}

export function ImportExportView({
  user,
  agents,
  uploadedFileKey,
  previewHeaders,
  previewRows,
  validationResults,
}: ImportExportProps) {
  const crmFields = [
    { key: 'full_name', label: 'Nombre Completo (Obligatorio)', required: true },
    { key: 'phone', label: 'WhatsApp / Teléfono (Obligatorio)', required: true },
    { key: 'email', label: 'Correo Electrónico', required: false },
    { key: 'status', label: 'Etapa del Pipeline (nuevo, contactado, etc.)', required: false },
    { key: 'presupuesto', label: 'Presupuesto ($ USD)', required: false },
    { key: 'producto', label: 'Programa / Producto de Interés', required: false },
    { key: 'objetivo', label: 'Objetivo Fitness', required: false },
    { key: 'ciudad', label: 'Ciudad', required: false },
    { key: 'sede', label: 'Sede / Gimnasio', required: false },
    { key: 'tags', label: 'Etiquetas / Tags (separados por coma)', required: false },
  ];

  return html`
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-black text-white">Importación, Exportación & Mapeo Inteligente</h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Carga masiva de prospectos mediante Cloudflare R2 con mapeo dinámico de encabezados, validación de duplicados y descarga filtrada.
          </p>
        </div>
      </div>

      <!-- Main Tabs / 2 Sections -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left 2 Cols: Importador con Mapeo y Validación -->
        <div class="lg:col-span-2 space-y-6">

          <!-- Step 1: Upload or Paste CSV -->
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-brand-border">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>1️⃣ Cargar Archivo CSV</span>
              </h3>
              <span class="text-xs text-zinc-400">Almacenado seguro en Cloudflare R2</span>
            </div>

            <!-- Upload file or paste sample form -->
            <form action="/import/upload" method="POST" enctype="multipart/form-data" class="space-y-4">
              <div class="border-2 border-dashed border-zinc-800 hover:border-brand-orange/60 rounded-xl p-6 text-center transition bg-brand-card/50">
                <input type="file" name="csv_file" id="csv_file" accept=".csv,text/csv" class="hidden" onchange="document.getElementById('fileNameSpan').innerText = this.files[0]?.name || 'Ningún archivo seleccionado';"/>
                <label for="csv_file" class="cursor-pointer space-y-2 block">
                  <div class="w-10 h-10 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center mx-auto text-lg font-bold">
                    📁
                  </div>
                  <div class="text-xs font-semibold text-white">
                    Haz clic para seleccionar tu archivo CSV de prospectos
                  </div>
                  <p class="text-[11px] text-zinc-500">Admite archivos delimitados por coma o punto y coma</p>
                  <p id="fileNameSpan" class="text-xs font-bold text-brand-orange mt-2"></p>
                </label>
              </div>

              <!-- Or Paste CSV sample button -->
              <div class="flex items-center justify-between pt-2">
                <a
                  href="/import/load-sample"
                  class="text-xs text-zinc-400 hover:text-white underline"
                >
                  O cargar CSV de prueba fitness de demostración
                </a>

                <button
                  type="submit"
                  class="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-2"
                >
                  <span>Procesar y Mapear Columnas →</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Step 2: Column Mapping Interface (Rendered if file headers are loaded) -->
          ${previewHeaders && previewHeaders.length > 0 ? html`
            <div class="p-6 rounded-2xl bg-brand-surface border border-brand-orange/40 space-y-4 shadow-orange-glow">
              <div class="flex items-center justify-between pb-3 border-b border-brand-border">
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>2️⃣ Mapeo Dinámico de Columnas</span>
                  </h3>
                  <p class="text-xs text-zinc-400 mt-0.5">
                    Asocia los encabezados detectados en tu CSV con los campos de la base de datos D1 del CRM
                  </p>
                </div>
                <span class="px-2 py-0.5 rounded bg-brand-orange/20 text-brand-orange text-xs font-bold">
                  ${previewHeaders.length} columnas detectadas
                </span>
              </div>

              <form action="/import/validate" method="POST" class="space-y-4">
                <input type="hidden" name="file_key" value="${uploadedFileKey || 'temp_csv'}"/>

                <div class="space-y-2.5">
                  ${crmFields.map((field) => {
                    // Try to auto-guess match
                    const guessedHeader = previewHeaders.find(
                      (h) => h.toLowerCase().includes(field.key.toLowerCase()) ||
                             (field.key === 'full_name' && (h.toLowerCase().includes('nombre') || h.toLowerCase().includes('name'))) ||
                             (field.key === 'phone' && (h.toLowerCase().includes('tel') || h.toLowerCase().includes('movil') || h.toLowerCase().includes('whatsapp'))) ||
                             (field.key === 'email' && (h.toLowerCase().includes('correo') || h.toLowerCase().includes('mail'))) ||
                             (field.key === 'presupuesto' && (h.toLowerCase().includes('precio') || h.toLowerCase().includes('budget')))
                    );

                    return html`
                      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-brand-card border border-brand-border text-xs">
                        <div class="sm:w-1/2">
                          <span class="font-bold text-white">${field.label}</span>
                          ${field.required ? html`<span class="text-red-400 ml-1 font-bold">*</span>` : ''}
                        </div>
                        <div class="sm:w-1/2">
                          <select
                            name="map_${field.key}"
                            class="w-full px-3 py-1.5 bg-brand-black border border-brand-border rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-brand-orange"
                          >
                            <option value="">-- Ignorar este campo --</option>
                            ${previewHeaders.map((h) => html`
                              <option value="${h}" ${h === guessedHeader ? 'selected' : ''}>
                                Columna CSV: [${h}]
                              </option>
                            `)}
                          </select>
                        </div>
                      </div>
                    `;
                  })}
                </div>

                <!-- Agent assignment option -->
                <div class="p-3 rounded-xl bg-brand-black/60 border border-brand-border flex items-center justify-between text-xs">
                  <span class="text-zinc-300 font-semibold">Asignación para leads importados:</span>
                  <select name="assigned_to" class="px-3 py-1.5 bg-brand-card border border-brand-border rounded-lg text-xs text-zinc-200">
                    <option value="auto">⚡ Asignación Automática (Round-Robin)</option>
                    ${agents.map((ag) => html`
                      <option value="${ag.id}">${ag.name}</option>
                    `)}
                  </select>
                </div>

                <div class="flex justify-end pt-2">
                  <button
                    type="submit"
                    class="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm flex items-center gap-2"
                  >
                    <span>3️⃣ Validar Filas y Detectar Duplicados →</span>
                  </button>
                </div>
              </form>
            </div>
          ` : ''}

          <!-- Step 3: Validation Report & Execute Batch Import -->
          ${validationResults ? html`
            <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
              <div class="flex items-center justify-between pb-3 border-b border-brand-border">
                <div>
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>3️⃣ Reporte de Validación Previa</span>
                  </h3>
                  <p class="text-xs text-zinc-400 mt-0.5">
                    Se validaron los números telefónicos, duplicados y campos obligatorios
                  </p>
                </div>
              </div>

              <!-- Stat Badges -->
              <div class="grid grid-cols-3 gap-3">
                <div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-center">
                  <span class="text-xl font-black text-emerald-400">${validationResults.validCount}</span>
                  <p class="text-[11px] font-bold text-emerald-300">Filas Válidas</p>
                </div>
                <div class="p-3 rounded-xl bg-amber-950/40 border border-amber-800 text-center">
                  <span class="text-xl font-black text-amber-400">${validationResults.duplicateCount}</span>
                  <p class="text-[11px] font-bold text-amber-300">Duplicados Advertidos</p>
                </div>
                <div class="p-3 rounded-xl bg-red-950/40 border border-red-800 text-center">
                  <span class="text-xl font-black text-red-400">${validationResults.errorCount}</span>
                  <p class="text-[11px] font-bold text-red-300">Filas con Error</p>
                </div>
              </div>

              <!-- Detail Table Preview -->
              <div class="rounded-xl border border-brand-border overflow-hidden max-h-64 overflow-y-auto">
                <table class="w-full text-left text-xs">
                  <thead class="bg-brand-card text-zinc-400 text-[10px] uppercase font-bold sticky top-0">
                    <tr>
                      <th class="p-2.5">Fila</th>
                      <th class="p-2.5">Nombre</th>
                      <th class="p-2.5">Teléfono</th>
                      <th class="p-2.5">Estado</th>
                      <th class="p-2.5">Observación</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-brand-border">
                    ${validationResults.details.map((row) => html`
                      <tr class="hover:bg-brand-card/30">
                        <td class="p-2 text-zinc-500 font-mono">#${row.index + 1}</td>
                        <td class="p-2 font-bold text-white">${row.data.full_name || '-'}</td>
                        <td class="p-2 font-mono text-zinc-300">${row.data.phone || '-'}</td>
                        <td class="p-2">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            row.status === 'valid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            row.status === 'duplicate' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                            'bg-red-950 text-red-400 border border-red-800'
                          }">
                            ${row.status === 'valid' ? 'Válido' : row.status === 'duplicate' ? 'Duplicado' : 'Error'}
                          </span>
                        </td>
                        <td class="p-2 text-[11px] ${row.status === 'error' ? 'text-red-300' : row.status === 'duplicate' ? 'text-amber-300' : 'text-zinc-400'}">
                          ${row.message}
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>

              <!-- Confirmation Execution Form -->
              <form action="/import/confirm" method="POST" class="pt-2 flex items-center justify-between">
                <div class="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" name="skip_duplicates" id="skip_dup" value="1" checked class="rounded bg-zinc-800 border-zinc-700 text-brand-orange"/>
                  <label for="skip_dup" class="cursor-pointer">Omitir filas duplicadas y continuar con las válidas</label>
                </div>

                <button
                  type="submit"
                  class="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-bold transition shadow-orange-sm"
                  ${validationResults.validCount === 0 ? 'disabled' : ''}
                >
                  Confirmar Importación de ${validationResults.validCount} Prospectos
                </button>
              </form>
            </div>
          ` : ''}

        </div>

        <!-- Right 1 Col: Filtered Export to CSV -->
        <div class="space-y-6">
          <div class="p-6 rounded-2xl bg-brand-surface border border-brand-border space-y-4">
            <div class="pb-3 border-b border-brand-border">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>📤 Exportar Prospectos Filtrados</span>
              </h3>
              <p class="text-xs text-zinc-400 mt-0.5">
                Genera y descarga un archivo CSV con metadatos estructurados y bitácora
              </p>
            </div>

            <form action="/export/csv" method="GET" class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Filtrar por Segmento</label>
                <select name="segment" class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200">
                  <option value="">Todos los Segmentos (A, B, C, D)</option>
                  <option value="A">Solo Segmento A (VIP)</option>
                  <option value="B">Solo Segmento B (Tibio)</option>
                  <option value="C">Solo Segmento C (Frío)</option>
                  <option value="D">Solo Segmento D (Descartado)</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-300 mb-1">Filtrar por Etapa del Pipeline</label>
                <select name="status" class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200">
                  <option value="">Todas las Etapas</option>
                  <option value="nuevo">Nuevo Lead</option>
                  <option value="contactado">Contactado</option>
                  <option value="cita_agendada">Cita Agendada</option>
                  <option value="negociacion">Negociación</option>
                  <option value="ganado">Ganado (Clientes Activos)</option>
                  <option value="perdido">Perdido</option>
                </select>
              </div>

              ${user.role === 'admin' ? html`
                <div>
                  <label class="block text-xs font-semibold text-zinc-300 mb-1">Filtrar por Agente</label>
                  <select name="agentId" class="w-full px-3 py-2 bg-brand-card border border-brand-border rounded-xl text-xs text-zinc-200">
                    <option value="">Todos los Agentes</option>
                    ${agents.map((ag) => html`
                      <option value="${ag.id}">${ag.name}</option>
                    `)}
                  </select>
                </div>
              ` : ''}

              <button
                type="submit"
                class="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold border border-brand-border transition flex items-center justify-center gap-2"
              >
                <svg class="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <span>Descargar CSV Filtrado</span>
              </button>
            </form>
          </div>
        </div>

      </div>

    </div>
  `;
}
