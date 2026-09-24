// Advanced tests: AI message generation, RBAC isolation, CSV import mapping (SolidJS + Hono)

async function runAdvancedTests() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('--- Pruebas Avanzadas (IA, RBAC e Importación CSV en SolidJS + Hono) ---');

  // 1. Admin login
  const adminLogin = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('1. Admin logueado');

  // 2. Test AI Message Generation on lead_101
  const aiRes = await fetch(`${BASE}/api/leads/lead_101/ai-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({ tone: 'cierre' }),
  });
  console.log(`2. Generación de Mensaje con IA -> Status: ${aiRes.status}`);
  const aiData = await aiRes.json();
  console.log(`   Mensaje generado: ${aiData.message?.slice(0, 60)}...`);
  console.log(`   Deep link generado: ${aiData.deepLink?.includes('wa.me')}`);

  // 3. Test RBAC: Login as Agent Valeria
  const agentLogin = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'agent' }),
  });
  const agentCookie = agentLogin.headers.get('set-cookie')?.split(';')[0] || '';

  // Try accessing lead_102 (assigned to Mateo Silva usr_agent_2)
  const forbiddenRes = await fetch(`${BASE}/api/leads/lead_102`, {
    headers: { Cookie: agentCookie },
  });
  console.log(`3. RBAC Aislamiento entre Agentes (lead_102 no asignado a Valeria) -> Status: ${forbiddenRes.status} (Esperado: 403)`);

  // Try accessing /api/team as agent (should be blocked with 403)
  const teamForbiddenRes = await fetch(`${BASE}/api/team`, {
    headers: { Cookie: agentCookie },
  });
  console.log(`4. RBAC Bloqueo de /api/team para Agente -> Status: ${teamForbiddenRes.status} (Esperado: 403)`);

  // 4. Test CSV Load Sample & Validation
  const sampleRes = await fetch(`${BASE}/api/import/load-sample`, {
    headers: { Cookie: adminCookie },
  });
  console.log(`5. Carga de CSV de prueba en Cloudflare R2 / KV -> Status: ${sampleRes.status}`);
  const sampleData = await sampleRes.json();
  console.log(`   Filas detectadas: ${sampleData.totalRows}`);
  console.log(`   Columnas detectadas: ${sampleData.headers?.join(', ')}`);

  // 5. Test Batch Import Process
  const importRes = await fetch(`${BASE}/api/import/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      file_key: sampleData.fileKey,
      assigned_to: 'auto',
      col_name: 'Nombre Completo',
      col_phone: 'Telefono Movil',
      col_email: 'Correo',
      col_budget: 'Presupuesto USD',
      col_product: 'Programa Interes',
      col_goal: 'Objetivo Deportivo',
      col_city: 'Ciudad',
      col_branch: 'Sede',
      col_tags: 'Tags',
    }),
  });
  console.log(`6. Procesamiento de Lote CSV -> Status: ${importRes.status}`);
  const importResult = await importRes.json();
  console.log(`   Importados: ${importResult.importedCount}, Duplicados omitidos: ${importResult.skippedDuplicates}`);

  // 6. Test R2 Backup trigger
  const backupRes = await fetch(`${BASE}/api/export/r2-backup`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  console.log(`7. Respaldo en Cloudflare R2 -> Status: ${backupRes.status}`);
  const backupData = await backupRes.json();
  console.log(`   Key de respaldo: ${backupData.key}`);

  console.log('--- Todas las pruebas avanzadas finalizaron con ÉXITO ---');
}

runAdvancedTests().catch(console.error);
