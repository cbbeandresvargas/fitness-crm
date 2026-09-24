import { Hono } from 'hono';
import Papa from 'papaparse';
import { Env, User, Lead, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizePhone, checkDuplicatePhone, calculateDynamicSegment, autoAssignAgent } from '../lib/rules';

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
