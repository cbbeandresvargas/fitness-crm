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
    { key: 'full_name', label: 'Nombre Completo', required: true },
    { key: 'phone', label: 'WhatsApp / Teléfono', required: true },
    { key: 'email', label: 'Correo', required: false },
    { key: 'objetivo', label: 'Meta u Objetivo', required: false },
    { key: 'presupuesto', label: 'Presupuesto', required: false },
    { key: 'ciudad', label: 'Ciudad / Sede', required: false },
  ];

  return html`
    <div class="space-y-8 max-w-5xl mx-auto">
      
      <div class="space-y-1">
        <h2 class="text-2xl font-black text-white">Subir o Descargar Personas en Excel / CSV</h2>
        <p class="text-xs text-zinc-400">
          Agrega decenas de prospectos a la vez o descarga tu lista para abrirla en Excel
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

        <!-- 1. Cargar Archivo -->
        <div class="p-8 rounded-3xl bg-brand-surface border border-brand-border space-y-6">
          <div class="flex items-center gap-3 pb-3 border-b border-brand-border">
            <span class="text-2xl">📥</span>
            <div>
              <h3 class="text-base font-bold text-white">1. Cargar Lista de Personas</h3>
              <p class="text-xs text-zinc-400">Desde un archivo CSV o Excel</p>
            </div>
          </div>

          <form action="/import/upload" method="POST" enctype="multipart/form-data" class="space-y-4">
            <div class="border-2 border-dashed border-zinc-700 hover:border-brand-orange p-8 rounded-2xl text-center bg-brand-card/50 transition">
              <input
                type="file"
                name="csv_file"
                id="csv_file"
                accept=".csv,text/csv"
                class="hidden"
                onchange="document.getElementById('fileNameSpan').innerText = 'Archivo listo: ' + (this.files[0]?.name || '');"
              />
              <label for="csv_file" class="cursor-pointer space-y-2 block">
                <span class="text-4xl block">📁</span>
                <span class="text-sm font-bold text-white block">Haz clic aquí para elegir tu archivo</span>
                <p class="text-xs text-zinc-400">Acepta archivos CSV delimitados por comas</p>
                <p id="fileNameSpan" class="text-xs font-bold text-brand-orange pt-2"></p>
              </label>
            </div>

            <div class="flex items-center justify-between pt-2">
              <a
                href="/import/load-sample"
                class="text-xs font-bold text-brand-orange hover:underline"
              >
                🧪 O probar con 5 personas de ejemplo
              </a>

              <button
                type="submit"
                class="px-5 py-3 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-bold transition shadow-orange-glow"
              >
                Continuar →
              </button>
            </div>
          </form>
        </div>

        <!-- 2. Descargar a Excel -->
        <div class="p-8 rounded-3xl bg-brand-surface border border-brand-border space-y-6">
          <div class="flex items-center gap-3 pb-3 border-b border-brand-border">
            <span class="text-2xl">📤</span>
            <div>
              <h3 class="text-base font-bold text-white">2. Descargar para Excel</h3>
              <p class="text-xs text-zinc-400">Baja tus contactos en un archivo CSV limpio</p>
            </div>
          </div>

          <form action="/export/csv" method="GET" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-zinc-300">¿A quiénes quieres descargar?</label>
              <select name="segment" class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white">
                <option value="">Todas las personas registradas</option>
                <option value="A">Solo personas Calientes / VIP</option>
                <option value="B">Solo personas en Conversación</option>
                <option value="C">Solo personas por Reactivar</option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-bold text-zinc-300">¿En qué etapa?</label>
              <select name="status" class="w-full px-4 py-3 bg-brand-card border border-brand-border rounded-2xl text-xs text-white">
                <option value="">Cualquier etapa</option>
                <option value="nuevo">Nuevos</option>
                <option value="cita_agendada">Con Cita Agendada</option>
                <option value="ganado">Ya Inscritos / Clientes</option>
              </select>
            </div>

            <button
              type="submit"
              class="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-bold border border-brand-border transition flex items-center justify-center gap-2 mt-2"
            >
              <span>📥 Descargar Archivo para Excel</span>
            </button>
          </form>
        </div>

      </div>

      <!-- Paso 2: Asociar Columnas (Si ya se cargó el archivo) -->
      ${previewHeaders && previewHeaders.length > 0 ? html`
        <div class="p-8 rounded-3xl bg-brand-surface border-2 border-brand-orange/60 space-y-6 shadow-orange-glow">
          <div class="pb-3 border-b border-brand-border">
            <h3 class="text-base font-extrabold text-white flex items-center gap-2">
              <span>📋 Paso 2: Dinos qué columna es cada dato</span>
            </h3>
            <p class="text-xs text-zinc-400 mt-1">
              Encontramos estas columnas en tu archivo. Solo dinos cuál corresponde al Nombre y cuál al Teléfono:
            </p>
          </div>

          <form action="/import/validate" method="POST" class="space-y-4">
            <input type="hidden" name="file_key" value="${uploadedFileKey || 'temp_csv'}"/>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              ${crmFields.map((field) => {
                const guessed = previewHeaders.find(
                  (h) => h.toLowerCase().includes(field.key.toLowerCase()) ||
                         (field.key === 'full_name' && (h.toLowerCase().includes('nombre') || h.toLowerCase().includes('name'))) ||
                         (field.key === 'phone' && (h.toLowerCase().includes('tel') || h.toLowerCase().includes('movil') || h.toLowerCase().includes('whatsapp'))) ||
                         (field.key === 'email' && (h.toLowerCase().includes('correo') || h.toLowerCase().includes('mail'))) ||
                         (field.key === 'presupuesto' && (h.toLowerCase().includes('precio') || h.toLowerCase().includes('budget')))
                );

                return html`
                  <div class="p-4 rounded-2xl bg-brand-card border border-brand-border space-y-1.5">
                    <label class="block text-xs font-bold text-white">
                      ${field.label} ${field.required ? html`<span class="text-brand-orange">*</span>` : ''}
                    </label>
                    <select
                      name="map_${field.key}"
                      class="w-full px-3 py-2 bg-brand-black border border-brand-border rounded-xl text-xs text-zinc-200"
                    >
                      <option value="">-- No incluir este dato --</option>
                      ${previewHeaders.map((h) => html`
                        <option value="${h}" ${h === guessed ? 'selected' : ''}>
                          Columna: [${h}]
                        </option>
                      `)}
                    </select>
                  </div>
                `;
              })}
            </div>

            <input type="hidden" name="assigned_to" value="auto"/>

            <div class="flex justify-end pt-2">
              <button
                type="submit"
                class="px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-bold transition shadow-orange-glow"
              >
                Revisar y Validar Datos →
              </button>
            </div>
          </form>
        </div>
      ` : ''}

      <!-- Paso 3: Confirmar e Importar -->
      ${validationResults ? html`
        <div class="p-8 rounded-3xl bg-brand-surface border border-brand-border space-y-6">
          <div class="pb-3 border-b border-brand-border">
            <h3 class="text-base font-extrabold text-white">
              Paso 3: Todo listo para importar
            </h3>
            <p class="text-xs text-zinc-400 mt-1">Revisa el resumen antes de guardarlos en el sistema</p>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-center">
              <span class="text-3xl font-extrabold text-emerald-400">${validationResults.validCount}</span>
              <p class="text-xs font-bold text-emerald-300 mt-1">Personas Nuevas Válidas</p>
            </div>
            <div class="p-4 rounded-2xl bg-amber-950/40 border border-amber-800 text-center">
              <span class="text-3xl font-extrabold text-amber-400">${validationResults.duplicateCount}</span>
              <p class="text-xs font-bold text-amber-300 mt-1">Teléfonos que ya Tenías</p>
            </div>
            <div class="p-4 rounded-2xl bg-zinc-800 text-center">
              <span class="text-3xl font-extrabold text-zinc-400">${validationResults.errorCount}</span>
              <p class="text-xs font-bold text-zinc-300 mt-1">Filas Vacías o sin Nombre</p>
            </div>
          </div>

          <form action="/import/confirm" method="POST" class="pt-2 flex items-center justify-between">
            <p class="text-xs text-zinc-400">Los duplicados se omitirán para no sobreescribir tus notas previas.</p>
            <button
              type="submit"
              class="px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-2xl text-xs font-extrabold transition shadow-orange-glow"
              ${validationResults.validCount === 0 ? 'disabled' : ''}
            >
              ✅ Confirmar y Guardar ${validationResults.validCount} Prospectos
            </button>
          </form>
        </div>
      ` : ''}

    </div>
  `;
}
