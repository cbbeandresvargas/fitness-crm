import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Auditoría y Validación de Optimización de Lecturas en Cloudflare D1 (0002)', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const schemaPath = path.join(rootDir, 'src/db/schema.sql');
  const migrationPath = path.join(rootDir, 'src/db/migrations/0002_optimize_d1_reads.sql');
  const waRoutePath = path.join(rootDir, 'src/routes/whatsapp.ts');
  const activitiesRoutePath = path.join(rootDir, 'src/routes/activities.ts');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
  const waRouteContent = fs.readFileSync(waRoutePath, 'utf-8');
  const activitiesRouteContent = fs.readFileSync(activitiesRoutePath, 'utf-8');

  it('el esquema y la migración contienen las columnas desnormalizadas en leads', () => {
    const requiredColumns = [
      'last_message_text',
      'last_message_time',
      'last_message_sender',
      'last_message_status',
      'unread_count',
    ];

    for (const col of requiredColumns) {
      expect(schemaContent).toContain(col);
      expect(migrationContent).toContain(`ALTER TABLE leads ADD COLUMN ${col}`);
    }
  });

  it('el esquema y la migración contienen los índices críticos de inbox y covering indexes', () => {
    const requiredIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_leads_last_message_time ON leads(last_message_time DESC);',
      'CREATE INDEX IF NOT EXISTS idx_leads_assigned_last_msg ON leads(assigned_to, last_message_time DESC);',
      'CREATE INDEX IF NOT EXISTS idx_leads_unread ON leads(unread_count) WHERE unread_count > 0;',
      'CREATE INDEX IF NOT EXISTS idx_prospect_activities_lead_created ON prospect_activities(lead_id, created_at ASC);',
      'CREATE INDEX IF NOT EXISTS idx_whatsapp_user_id ON whatsapp_messages(user_id);',
    ];

    for (const idx of requiredIndexes) {
      expect(schemaContent).toContain(idx);
      expect(migrationContent).toContain(idx);
    }
  });

  it('la migración contiene el script de backfill idempotente para sincronizar mensajes históricos', () => {
    expect(migrationContent).toContain('UPDATE leads');
    expect(migrationContent).toContain('last_message_text = (');
    expect(migrationContent).toContain('unread_count = (');
    expect(migrationContent).toContain('WHERE EXISTS (');
  });

  it('el esquema y la migración contienen los triggers atómicos de sincronización de inbox', () => {
    const triggers = [
      'trg_whatsapp_messages_after_insert',
      'trg_whatsapp_messages_after_update_status',
      'trg_whatsapp_messages_after_delete',
    ];

    for (const trg of triggers) {
      expect(schemaContent).toContain(trg);
      expect(migrationContent).toContain(trg);
    }
  });

  it('/api/whatsapp/inbox ya NO ejecuta los CTEs con Full Table Scan (ranked_messages / unread_counts)', () => {
    // La consulta no debe contener la CTE con Window Function que escaneaba toda la tabla
    expect(waRouteContent).not.toContain('WITH ranked_messages AS');
    expect(waRouteContent).not.toContain('ROW_NUMBER() OVER (PARTITION BY lead_id');
    expect(waRouteContent).not.toContain('unread_counts AS (');

    // Debe consultar directamente sobre leads con ORDER BY last_message_time DESC LIMIT 50
    expect(waRouteContent).toContain('l.last_message_time DESC');
    expect(waRouteContent).toContain('LIMIT 50');
  });

  it('/api/activities no ejecuta subconsultas correlacionadas duplicadas en el SELECT/ORDER BY', () => {
    expect(activitiesRouteContent).toContain('LEFT JOIN prospect_activities pa ON pa.activity_id = a.id');
    expect(activitiesRouteContent).toContain('GROUP BY');
    expect(activitiesRouteContent).not.toContain('(SELECT COUNT(*) FROM prospect_activities pa WHERE pa.activity_id = a.id) as prospect_count');
  });
});
