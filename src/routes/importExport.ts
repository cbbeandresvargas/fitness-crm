import { Hono, Context } from 'hono';
import Papa from 'papaparse';
import { Env, User, Lead, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizePhone, checkDuplicatePhone, calculateDynamicSegment, autoAssignAgent } from '../lib/rules';
import {
  parseFcWorkbook,
  classifyFcRows,
  buildImportedMetadata,
  FcImportError,
  FcExistingLeadRef,
  FcRowClassification,
} from '../lib/fcImport';

export const importExportRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

importExportRoutes.use('*', requireAuth);

/**
 * Carga de CSV de prueba precargado
 */
importExportRoutes.get('/api/import/load-sample', async (c) => {
  const sampleCsv = `Nombre Completo,Telefono Movil,Correo,Presupuesto USD,Programa Interes,Objetivo Deportivo,Ciudad,Sede,Tags
Esteban Navarro,+525566778899,esteban.navarro@gmail.com,190,CrossFit Pro,Ganar fuerza y masa muscular,Ciudad de México,Polanco,CrossFit;Fuerza;VIP
Gabriela Meza,+525512345678,gabriela.m@hotmail.com,120,Pilates Reformer,Rehabilitación de espalda,Ciudad de México,Roma Norte,Pilates;Salud
Felipe Rivas,+525544332211,felipe.rivas@empresa.com,220,Personal Trainer,Bajar 8 kilos en 3 meses,Monterrey,San Pedro,Personal Trainer;Nutricion
Andrea Salazar,+525533221100,andrea.s@yahoo.com,100,Funcional,Tonificación,Guadalajara,Chapultepec,Funcional
Manuel Coronado,+525588990011,manuel.c@live.com,160,Membresía Anual,Mejorar resistencia cardiovascular,Querétaro,Juriquilla,Cardio;Anual`;

  const fileKey = `sample_${Date.now()}.csv`;

  // Almacenar en Cloudflare R2 si está configurado
  if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
    try {
      await c.env.STORAGE.put(fileKey, sampleCsv);
    } catch (e) {
      console.warn('R2 put error:', e);
    }
  }

  // Guardar en KV temporal
  await c.env.KV.put(`csv:${fileKey}`, sampleCsv, { expirationTtl: 3600 });

  const parsed = Papa.parse<Record<string, string>>(sampleCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const agentsRes = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE is_active = 1').all<User>();

  return c.json({
    success: true,
    fileKey,
    headers: parsed.meta.fields || [],
    previewRows: (parsed.data || []).slice(0, 5),
    totalRows: parsed.data.length,
    agents: agentsRes.results || [],
  });
});

/**
 * Previsualizar archivo CSV subido
 */
importExportRoutes.post('/api/import/preview', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  let csvText = '';

  if (file && typeof file === 'object' && 'text' in file) {
    csvText = await (file as File).text();
  } else if (typeof body['csvText'] === 'string') {
    csvText = body['csvText'];
  }

  if (!csvText) {
    return c.json({ error: 'No se subió ningún archivo CSV o está vacío.' }, 400);
  }

  const fileKey = `upload_${Date.now()}.csv`;
  if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
    try {
      await c.env.STORAGE.put(fileKey, csvText);
    } catch (e) {
      console.warn('R2 put error:', e);
    }
  }
  await c.env.KV.put(`csv:${fileKey}`, csvText, { expirationTtl: 3600 });

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const agentsRes = await c.env.DB.prepare('SELECT id, name, role FROM users WHERE is_active = 1').all<User>();

  return c.json({
    success: true,
    fileKey,
    headers: parsed.meta.fields || [],
    previewRows: (parsed.data || []).slice(0, 5),
    totalRows: parsed.data.length,
    agents: agentsRes.results || [],
  });
});

/**
 * Procesar importación por lotes
 */
importExportRoutes.post('/api/import/process', async (c) => {
  const user = c.get('user');
  const body = await (c.req.header('content-type')?.includes('application/json')
    ? c.req.json()
    : c.req.parseBody());

  const fileKey = body.file_key as string;
  if (!fileKey) return c.json({ error: 'Falta la clave del archivo' }, 400);

  let csvText = await c.env.KV.get(`csv:${fileKey}`);
  if (!csvText && c.env.STORAGE && typeof c.env.STORAGE.get === 'function') {
    const r2Obj = await c.env.STORAGE.get(fileKey);
    if (r2Obj) csvText = await r2Obj.text();
  }

  if (!csvText) {
    return c.json({ error: 'El archivo temporal ha expirado. Por favor cárgalo de nuevo.' }, 404);
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const nameCol = (body.col_name as string) || 'Nombre Completo';
  const phoneCol = (body.col_phone as string) || 'Telefono Movil';
  const emailCol = (body.col_email as string) || 'Correo';
  const budgetCol = (body.col_budget as string) || 'Presupuesto USD';
  const goalCol = (body.col_goal as string) || 'Objetivo Deportivo';
  const cityCol = (body.col_city as string) || 'Ciudad';
  const branchCol = (body.col_branch as string) || 'Sede';
  const productCol = (body.col_product as string) || 'Programa Interes';
  const tagsCol = (body.col_tags as string) || 'Tags';

  let assignedTo = (body.assigned_to as string) || 'auto';
  let importedCount = 0;
  let skippedDuplicates = 0;
  let errorsCount = 0;

  for (const row of parsed.data) {
    const fullName = row[nameCol]?.trim();
    const rawPhone = row[phoneCol]?.trim();
    const email = row[emailCol]?.trim().toLowerCase() || null;

    if (!fullName || !rawPhone) {
      errorsCount++;
      continue;
    }

    const phone = normalizePhone(rawPhone);
    const dupCheck = await checkDuplicatePhone(c.env.DB, phone);
    if (dupCheck.exists) {
      skippedDuplicates++;
      continue;
    }

    let targetAgent = assignedTo;
    if (targetAgent === 'auto' || !targetAgent) {
      targetAgent = (await autoAssignAgent(c.env.DB)) || '';
    }

    const presupuesto = Number(row[budgetCol]) || 0;
    const metadata = {
      presupuesto,
      objetivo: row[goalCol]?.trim() || '',
      ciudad: row[cityCol]?.trim() || '',
      sede: row[branchCol]?.trim() || '',
      producto: row[productCol]?.trim() || '',
    };

    const rawTags = row[tagsCol] || '';
    const tags = rawTags
      ? rawTags.split(/[;,]/).map((t) => t.trim()).filter(Boolean)
      : [];

    const dynamicSeg = calculateDynamicSegment({
      status: 'nuevo',
      metadata,
    });

    const leadId = `lead_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      INSERT INTO leads (
        id, full_name, phone, email, status, segment, assigned_to, tags, metadata, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'nuevo', ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        leadId,
        fullName,
        phone,
        email,
        dynamicSeg.segment,
        targetAgent,
        JSON.stringify(tags),
        JSON.stringify(metadata),
        user.userId,
        user.userId,
        now,
        now
      )
      .run();

    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
      VALUES (?, ?, ?, 'creation', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        leadId,
        user.userId,
        `Lead importado desde archivo CSV (${fileKey}).`,
        now
      )
      .run();

    importedCount++;
  }

  // Eliminar KV temporal
  await c.env.KV.delete(`csv:${fileKey}`).catch(() => {});

  return c.json({
    success: true,
    importedCount,
    skippedDuplicates,
    errorsCount,
    totalRows: parsed.data.length,
  });
});

/**
 * FC: Parsear el Excel subido y obtener los leads existentes clasificados.
 * Compartido por preview y commit para que ambos deriven el mismo resultado del mismo archivo.
 */
async function parseAndClassifyFc(
  c: Context<{ Bindings: Env; Variables: { user: SessionData } }>
): Promise<
  { ok: true; parsed: ReturnType<typeof parseFcWorkbook>; classifications: FcRowClassification[] }
  | { ok: false; error: string; status: number }
> {
  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
    return { ok: false, error: 'No se recibió ningún archivo Excel (.xlsx).', status: 400 };
  }

  let parsed: ReturnType<typeof parseFcWorkbook>;
  try {
    parsed = parseFcWorkbook(new Uint8Array(await (file as File).arrayBuffer()));
  } catch (err: any) {
    if (err instanceof FcImportError) {
      return { ok: false, error: err.message, status: 400 };
    }
    console.error('FC import parse error:', err);
    return { ok: false, error: err.message || 'Error al procesar el archivo Excel.', status: 500 };
  }

  const leadsRes = await c.env.DB.prepare(
    'SELECT id, full_name, phone, email, status, metadata FROM leads'
  ).all<Lead>();

  const existingLeads: FcExistingLeadRef[] = (leadsRes.results || []).map((l) => ({
    id: l.id,
    full_name: l.full_name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata || {},
  }));

  return { ok: true, parsed, classifications: classifyFcRows(parsed, existingLeads) };
}

/**
 * FC: Previsualizar importación de Excel (.xlsx, hoja "Clientes").
 * No escribe nada en la base de datos: sólo clasifica filas (nuevas / existentes / inválidas).
 *
 * Distinción clave: la columna "Estado" del Excel es el Estado de Membresía (metadata.estado_membresia)
 * y NUNCA el Estado del Lead (columna status). Los leads nuevos importados inician en 'nuevo'.
 */
importExportRoutes.post('/api/import/fc/preview', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Acceso Denegado: La importación masiva está reservada para administradores.' }, 403);
  }

  const result = await parseAndClassifyFc(c);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as any);
  }

  const { parsed, classifications } = result;

  return c.json({
    success: true,
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    summary: {
      totalRows: parsed.rows.length,
      newCount: classifications.filter((r) => r.type === 'new').length,
      existingCount: classifications.filter((r) => r.type === 'existing').length,
      invalidCount: classifications.filter((r) => r.type === 'invalid').length,
    },
    rows: classifications,
  });
});

/**
 * FC: Confirmar importación del Excel (hoja "Clientes").
 * - Filas nuevas: se crean con Estado del Lead = 'nuevo' preservando todos los valores del Excel.
 * - Filas existentes (match por WhatsApp/Email/CI): NO se sobrescribe información no vacía;
 *   sólo se completan campos vacíos del CRM con los valores del Excel.
 * - Filas inválidas: se omiten y se reportan con su razón.
 */
importExportRoutes.post('/api/import/fc/commit', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Acceso Denegado: La importación masiva está reservada para administradores.' }, 403);
  }

  const result = await parseAndClassifyFc(c);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status as any);
  }

  const { parsed, classifications } = result;

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const invalidRows: { rowNumber: number; name: string; reason: string }[] = [];

  for (const row of classifications) {
    const now = new Date().toISOString();
    const fullName = `${row.data.firstName} ${row.data.lastName}`.trim();

    if (row.type === 'invalid') {
      invalidRows.push({ rowNumber: row.rowNumber, name: fullName, reason: row.reason || 'Fila inválida' });
      continue;
    }

    if (row.type === 'new') {
      const phone = normalizePhone(row.data.whatsapp || '');
      const email = row.data.email || null;
      const metadata = buildImportedMetadata(row.data);
      const dynamicSeg = calculateDynamicSegment({ status: 'nuevo', metadata });
      const assignedTo = await autoAssignAgent(c.env.DB);
      const leadId = `lead_${crypto.randomUUID().slice(0, 8)}`;

      await c.env.DB.prepare(`
        INSERT INTO leads (
          id, full_name, phone, email, status, segment, assigned_to, tags, metadata, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'nuevo', ?, ?, '[]', ?, ?, ?, ?, ?)
      `)
        .bind(
          leadId,
          fullName,
          phone,
          email,
          dynamicSeg.segment,
          assignedTo,
          JSON.stringify(metadata),
          user.userId,
          user.userId,
          now,
          now
        )
        .run();

      const detailParts = [`Importado desde Excel FC (hoja "Clientes", fila ${row.rowNumber}).`];
      if (row.data.membershipStatus) detailParts.push(`Estado de Membresía: "${row.data.membershipStatus}".`);
      if (row.data.membershipCount !== undefined) detailParts.push(`Cantidad de Membresías: ${row.data.membershipCount}.`);

      await c.env.DB.prepare(`
        INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
        VALUES (?, ?, ?, 'creation', ?, ?)
      `)
        .bind(
          `act_${crypto.randomUUID().slice(0, 8)}`,
          leadId,
          user.userId,
          detailParts.join(' '),
          now
        )
        .run();

      created++;
      continue;
    }

    // Fila existente: sincronizar SOLO campos vacíos del CRM (nunca sobrescribir datos válidos)
    const lead = row.matchedLead!;
    const metadata = { ...lead.metadata };
    const fills: string[] = [];

    if (!lead.email && row.data.email) fills.push('email');
    if (metadata.ci === undefined && row.data.ci) { metadata.ci = row.data.ci; fills.push('ci'); }
    if (metadata.nro === undefined && row.data.nro !== undefined) { metadata.nro = row.data.nro; fills.push('nro'); }
    if (metadata.first_name === undefined) { metadata.first_name = row.data.firstName; fills.push('nombre'); }
    if (metadata.last_name === undefined) { metadata.last_name = row.data.lastName; fills.push('apellido'); }
    if (metadata.email_verificado === undefined && row.data.emailVerified !== undefined) { metadata.email_verificado = row.data.emailVerified; fills.push('email verificado'); }
    if (metadata.cantidad_membresias === undefined && row.data.membershipCount !== undefined) { metadata.cantidad_membresias = row.data.membershipCount; fills.push('cantidad de membresías'); }
    if (metadata.estado_membresia === undefined && row.data.membershipStatus) { metadata.estado_membresia = row.data.membershipStatus; fills.push('estado de membresía'); }

    if (fills.length === 0) {
      unchanged++;
      continue;
    }

    const sets: string[] = [];
    const params: any[] = [];
    if (fills.includes('email')) {
      sets.push('email = ?');
      params.push(row.data.email);
    }
    sets.push('metadata = ?');
    params.push(JSON.stringify(metadata));
    sets.push('updated_by = ?');
    params.push(user.userId);
    sets.push('updated_at = ?');
    params.push(now);
    params.push(lead.id);

    await c.env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, lead_id, user_id, action_type, details, created_at)
      VALUES (?, ?, ?, 'update', ?, ?)
    `)
      .bind(
        `act_${crypto.randomUUID().slice(0, 8)}`,
        lead.id,
        user.userId,
        `Sincronizado desde Excel FC (fila ${row.rowNumber}, coincidencia por ${row.matchedBy}): se completaron campos vacíos (${fills.join(', ')}).`,
        now
      )
      .run();

    updated++;
  }

  return c.json({
    success: true,
    sheetName: parsed.sheetName,
    summary: {
      totalRows: parsed.rows.length,
      created,
      updated,
      unchanged,
      invalid: invalidRows.length,
    },
    invalidRows,
  });
});

/**
 * Exportar Leads a CSV
 */
importExportRoutes.get('/api/export/csv', async (c) => {
  const user = c.get('user');
  const leadWhere = user.role === 'agent' ? 'WHERE l.assigned_to = ?' : '';
  const leadParams = user.role === 'agent' ? [user.userId] : [];

  const leadsRes = await c.env.DB.prepare(`
    SELECT l.*, u.name as assigned_name 
    FROM leads l 
    LEFT JOIN users u ON u.id = l.assigned_to 
    ${leadWhere} 
    ORDER BY l.created_at DESC
  `)
    .bind(...leadParams)
    .all<Lead>();

  const flattened = (leadsRes.results || []).map((l) => {
    const meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata || {};
    const tags = typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags || [];

    return {
      ID: l.id,
      'Nombre Completo': l.full_name,
      'Teléfono': l.phone,
      'Correo': l.email || '',
      'Estado': l.status,
      'Segmento': l.segment,
      'Asesor Asignado': l.assigned_name || '',
      'Presupuesto USD': meta.presupuesto || 0,
      'Objetivo': meta.objetivo || '',
      'Ciudad': meta.ciudad || '',
      'Sede': meta.sede || '',
      'Producto': meta.producto || '',
      'Etiquetas': tags.join('; '),
      'Último Contacto': l.last_contacted_at || '',
      'Fecha Creación': l.created_at,
    };
  });

  const csv = Papa.unparse(flattened);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads_export_${Date.now()}.csv"`,
    },
  });
});

/**
 * Exportar Leads a JSON
 */
importExportRoutes.get('/api/export/json', async (c) => {
  const user = c.get('user');
  const leadWhere = user.role === 'agent' ? 'WHERE l.assigned_to = ?' : '';
  const leadParams = user.role === 'agent' ? [user.userId] : [];

  const leadsRes = await c.env.DB.prepare(`
    SELECT l.*, u.name as assigned_name 
    FROM leads l 
    LEFT JOIN users u ON u.id = l.assigned_to 
    ${leadWhere} 
    ORDER BY l.created_at DESC
  `)
    .bind(...leadParams)
    .all<Lead>();

  const parsed = (leadsRes.results || []).map((l) => ({
    ...l,
    tags: typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags,
    metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata,
  }));

  return new Response(JSON.stringify(parsed, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="leads_backup_${Date.now()}.json"`,
    },
  });
});

/**
 * Guardar copia de seguridad en Cloudflare R2
 */
importExportRoutes.post('/api/export/r2-backup', async (c) => {
  const leadsRes = await c.env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  const backupData = JSON.stringify(leadsRes.results || [], null, 2);
  const backupKey = `backups/fitness_crm_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
    await c.env.STORAGE.put(backupKey, backupData);
    return c.json({ success: true, key: backupKey, count: leadsRes.results?.length || 0 });
  }

  // Si R2 no está activo localmente, guardarlo en KV
  await c.env.KV.put(`backup:${backupKey}`, backupData);
  return c.json({ success: true, key: backupKey, stored_in: 'KV', count: leadsRes.results?.length || 0 });
});
