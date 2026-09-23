import { Hono } from 'hono';
import Papa from 'papaparse';
import { Env, User, Lead, SessionData } from '../lib/types';
import { requireAuth } from '../lib/auth';
import { normalizePhone, checkDuplicatePhone, calculateDynamicSegment, autoAssignAgent } from '../lib/rules';
import { Layout } from '../views/Layout';
import { ImportExportView } from '../views/ImportExportView';

export const importExportRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionData } }>();

importExportRoutes.use('*', requireAuth);

/**
 * Pantalla principal de Importación / Exportación
 */
importExportRoutes.get('/import-export', async (c) => {
  const user = c.get('user');
  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();

  return c.html(
    Layout({
      title: 'Importación & Exportación',
      user,
      currentPath: '/import-export',
      children: ImportExportView({
        user,
        agents: agentsRes.results || [],
      }),
    })
  );
});

/**
 * Carga de CSV de prueba precargado para demostración instantánea
 */
importExportRoutes.get('/import/load-sample', async (c) => {
  const user = c.get('user');
  const sampleCsv = `Nombre Completo,Telefono Movil,Correo,Presupuesto USD,Programa Interes,Objetivo Deportivo,Ciudad,Sede,Tags
Esteban Navarro,+525566778899,esteban.navarro@gmail.com,190,CrossFit Pro,Ganar fuerza y masa muscular,Ciudad de México,Polanco,CrossFit;Fuerza;VIP
Gabriela Meza,+525512345678,gabriela.m@hotmail.com,120,Pilates Reformer,Rehabilitación de espalda,Ciudad de México,Roma Norte,Pilates;Salud
Felipe Rivas,+525544332211,felipe.rivas@empresa.com,220,Personal Trainer,Bajar 8 kilos en 3 meses,Monterrey,San Pedro,Personal Trainer;Nutricion
Andrea Salazar,,andrea.s@yahoo.com,100,Funcional,Tonificación,Guadalajara,Chapultepec,Funcional
Manuel Coronado,+525588990011,manuel.c@live.com,160,Membresía Anual,Mejorar resistencia cardiovascular,Querétaro,Juriquilla,Cardio;Anual`;

  const fileKey = `sample_${Date.now()}.csv`;

  // Almacenar en Cloudflare R2
  if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
    await c.env.STORAGE.put(fileKey, sampleCsv);
  }

  // Guardar en KV temporal
  await c.env.KV.put(`csv:${fileKey}`, sampleCsv, { expirationTtl: 3600 });

  const parsed = Papa.parse<Record<string, string>>(sampleCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();

  return c.html(
    Layout({
      title: 'Mapeo de Columnas CSV',
      user,
      currentPath: '/import-export',
      flash: { type: 'info', message: 'CSV de prueba cargado en Cloudflare R2. Procede a mapear las columnas.' },
      children: ImportExportView({
        user,
        agents: agentsRes.results || [],
        uploadedFileKey: fileKey,
        previewHeaders: parsed.meta.fields || [],
        previewRows: parsed.data.slice(0, 5),
      }),
    })
  );
});

/**
 * Cargar archivo CSV enviado por el usuario
 */
importExportRoutes.post('/import/upload', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body['csv_file'];

  let csvContent = '';

  if (file && typeof file === 'object' && 'text' in file) {
    csvContent = await (file as any).text();
  }

  if (!csvContent || csvContent.trim().length === 0) {
    const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();
    return c.html(
      Layout({
        title: 'Importación',
        user,
        currentPath: '/import-export',
        flash: { type: 'error', message: 'Por favor selecciona un archivo CSV válido o usa el CSV de prueba.' },
        children: ImportExportView({
          user,
          agents: agentsRes.results || [],
        }),
      })
    );
  }

  const fileKey = `import_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.csv`;

  // Almacenar en Cloudflare R2
  if (c.env.STORAGE && typeof c.env.STORAGE.put === 'function') {
    await c.env.STORAGE.put(fileKey, csvContent);
  }
  await c.env.KV.put(`csv:${fileKey}`, csvContent, { expirationTtl: 3600 });

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();

  return c.html(
    Layout({
      title: 'Mapeo de Columnas CSV',
      user,
      currentPath: '/import-export',
      flash: { type: 'success', message: 'Archivo subido a R2 exitosamente. Asocia los campos antes de importar.' },
      children: ImportExportView({
        user,
        agents: agentsRes.results || [],
        uploadedFileKey: fileKey,
        previewHeaders: parsed.meta.fields || [],
        previewRows: parsed.data.slice(0, 5),
      }),
    })
  );
});

/**
 * Validar filas y reporte de errores previo a la inserción
 */
importExportRoutes.post('/import/validate', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();

  const fileKey = body['file_key'] as string;
  const assignedToDefault = (body['assigned_to'] as string) || 'auto';

  // Obtener CSV de KV o R2
  let csvContent = await c.env.KV.get(`csv:${fileKey}`);
  if (!csvContent && c.env.STORAGE) {
    const obj = await c.env.STORAGE.get(fileKey);
    if (obj) csvContent = await obj.text();
  }

  if (!csvContent) {
    return c.redirect('/import-export');
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields || [];

  // Extraer mapeo de columnas indicado por el usuario
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k.startsWith('map_') && v) {
      map[k.replace('map_', '')] = v as string;
    }
  }

  const details: {
    index: number;
    data: Record<string, string>;
    status: 'valid' | 'duplicate' | 'error';
    message: string;
  }[] = [];

  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  const validRowsToStore: any[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const rawRow = parsed.data[i];
    const fullName = (rawRow[map['full_name']] || '').trim();
    const rawPhone = (rawRow[map['phone']] || '').trim();
    const email = map['email'] ? (rawRow[map['email']] || '').trim() : null;
    const status = map['status'] ? (rawRow[map['status']] || 'nuevo').trim() : 'nuevo';
    const presupuesto = map['presupuesto'] ? Number(rawRow[map['presupuesto']]) || 0 : 0;
    const producto = map['producto'] ? rawRow[map['producto']] || 'General' : 'General';
    const objetivo = map['objetivo'] ? rawRow[map['objetivo']] || 'Fitness' : 'Fitness';
    const ciudad = map['ciudad'] ? rawRow[map['ciudad']] || 'CDMX' : 'CDMX';
    const sede = map['sede'] ? rawRow[map['sede']] || 'Principal' : 'Principal';
    const rawTags = map['tags'] ? rawRow[map['tags']] || '' : '';

    const rowData = { full_name: fullName, phone: rawPhone, email: email || '', producto, presupuesto: String(presupuesto) };

    // 1. Validar nombre
    if (!fullName) {
      errorCount++;
      details.push({
        index: i,
        data: rowData,
        status: 'error',
        message: 'Fila descartada: Falta nombre del prospecto',
      });
      continue;
    }

    // 2. Validar teléfono
    if (!rawPhone || rawPhone.length < 8) {
      errorCount++;
      details.push({
        index: i,
        data: rowData,
        status: 'error',
        message: 'Fila descartada: Número de teléfono inválido o vacío',
      });
      continue;
    }

    const normalizedPhone = normalizePhone(rawPhone);

    // 3. Validar duplicado en base de datos D1
    const dupCheck = await checkDuplicatePhone(c.env.DB, normalizedPhone);
    if (dupCheck.exists) {
      duplicateCount++;
      details.push({
        index: i,
        data: rowData,
        status: 'duplicate',
        message: `Teléfono ya registrado (${dupCheck.existingLead?.full_name})`,
      });
      continue;
    }

    // Fila válida
    validCount++;
    details.push({
      index: i,
      data: rowData,
      status: 'valid',
      message: 'Listo para importar',
    });

    const tagsArray = rawTags
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    validRowsToStore.push({
      full_name: fullName,
      phone: normalizedPhone,
      email,
      status,
      assigned_to: assignedToDefault,
      tags: tagsArray,
      metadata: {
        presupuesto,
        producto,
        objetivo,
        ciudad,
        sede,
      },
    });
  }

  // Guardar filas válidas en KV para el paso de confirmación
  await c.env.KV.put(`import:valid:${fileKey}`, JSON.stringify(validRowsToStore), { expirationTtl: 3600 });

  const agentsRes = await c.env.DB.prepare('SELECT * FROM users WHERE is_active = 1').all<User>();

  return c.html(
    Layout({
      title: 'Validación de Importación',
      user,
      currentPath: '/import-export',
      flash: {
        type: validCount > 0 ? 'success' : 'error',
        message: `Análisis completado: ${validCount} válidas, ${duplicateCount} duplicados y ${errorCount} errores.`,
      },
      children: ImportExportView({
        user,
        agents: agentsRes.results || [],
        uploadedFileKey: fileKey,
        previewHeaders: headers,
        validationResults: {
          validCount,
          duplicateCount,
          errorCount,
          details,
        },
      }),
    })
  );
});

/**
 * Confirmar importación masiva e insertar en D1
 */
importExportRoutes.post('/import/confirm', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const fileKey = c.req.header('Referer')?.split('uploadedFileKey=')[1] || '';

  // Buscar última clave de importación en KV
  const rawValid = await c.env.KV.get(`import:valid:${fileKey}`) || (await findLatestImportBatch(c.env.KV));
  if (!rawValid) {
    return c.redirect('/import-export');
  }

  const validRows = JSON.parse(rawValid);
  const now = new Date().toISOString();
  let importedCount = 0;

  for (const row of validRows) {
    let assigned = row.assigned_to;
    if (assigned === 'auto' || !assigned) {
      assigned = (await autoAssignAgent(c.env.DB)) || user.userId;
    }

    const { segment, reason } = calculateDynamicSegment({
      status: row.status,
      metadata: row.metadata,
      created_at: now,
    });

    const leadId = `lead_${crypto.randomUUID().slice(0, 8)}`;

    await c.env.DB.prepare(`
      INSERT INTO leads (
        id, full_name, phone, email, status, segment, assigned_to, tags, metadata, notes_summary, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        leadId,
        row.full_name,
        row.phone,
        row.email,
        row.status,
        segment,
        assigned,
        JSON.stringify(row.tags),
        JSON.stringify(row.metadata),
        'Importado masivamente vía CSV.',
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
      .bind(`act_${crypto.randomUUID().slice(0, 8)}`, leadId, user.userId, `Lead importado vía CSV. Clasificado en Segmento ${segment} (${reason})`, now)
      .run();

    importedCount++;
  }

  await c.env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, details)
    VALUES (?, ?, 'import', 'csv', 'bulk_import', ?)
  `)
    .bind(`aud_${crypto.randomUUID().slice(0, 8)}`, user.userId, `Importación completada de ${importedCount} leads.`)
    .run();

  return c.redirect(`/leads?imported=${importedCount}`);
});

/**
 * Exportar leads a CSV con filtros activos
 */
importExportRoutes.get('/export/csv', async (c) => {
  const user = c.get('user');
  const segment = c.req.query('segment');
  const status = c.req.query('status');
  const agentId = c.req.query('agentId');

  let whereClauses: string[] = [];
  let params: any[] = [];

  // RBAC: Agente solo exporta los suyos
  if (user.role === 'agent') {
    whereClauses.push('l.assigned_to = ?');
    params.push(user.userId);
  } else if (agentId) {
    whereClauses.push('l.assigned_to = ?');
    params.push(agentId);
  }

  if (segment) {
    whereClauses.push('l.segment = ?');
    params.push(segment);
  }

  if (status) {
    whereClauses.push('l.status = ?');
    params.push(status);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `
    SELECT l.*, u.name as assigned_agent_name 
    FROM leads l 
    LEFT JOIN users u ON u.id = l.assigned_to 
    ${whereSql} 
    ORDER BY l.created_at DESC
  `;

  const leadsRes = await c.env.DB.prepare(query).bind(...params).all<Lead & { assigned_agent_name: string }>();

  // Map to flat export objects
  const exportData = (leadsRes.results || []).map((l) => {
    let meta: Record<string, any> = {};
    try {
      meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : l.metadata || {};
    } catch {}

    let tags: string[] = [];
    try {
      tags = typeof l.tags === 'string' ? JSON.parse(l.tags || '[]') : l.tags || [];
    } catch {}

    return {
      'ID Prospecto': l.id,
      'Nombre Completo': l.full_name,
      'Teléfono / WhatsApp': l.phone,
      'Correo': l.email || '',
      'Segmento': l.segment,
      'Etapa Pipeline': l.status,
      'Agente Asignado': l.assigned_agent_name || 'Sin Asignar',
      'Presupuesto USD': meta.presupuesto || '',
      'Programa Interés': meta.producto || '',
      'Objetivo': meta.objetivo || '',
      'Ciudad': meta.ciudad || '',
      'Sede': meta.sede || '',
      'Tags': tags.join(', '),
      'Último Contacto': l.last_contacted_at || '',
      'Fecha Creación': l.created_at,
    };
  });

  const csv = Papa.unparse(exportData);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fitness_leads_export_${Date.now()}.csv"`,
    },
  });
});

async function findLatestImportBatch(kv: any): Promise<string | null> {
  try {
    const list = await kv.list({ prefix: 'import:valid:' });
    if (list.keys && list.keys.length > 0) {
      const latestKey = list.keys[list.keys.length - 1].name;
      return await kv.get(latestKey);
    }
  } catch {}
  return null;
}
