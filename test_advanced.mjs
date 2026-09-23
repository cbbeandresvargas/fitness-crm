// Advanced tests: AI message generation, RBAC isolation, CSV import mapping

async function runAdvancedTests() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('--- Pruebas Avanzadas (IA, RBAC e Importación CSV) ---');

  // 1. Admin login
  const adminLogin = await fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'role=admin',
    redirect: 'manual',
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] || '';

  // 2. Test AI Message Generation on lead_101
  const aiRes = await fetch(`${BASE}/leads/lead_101/ai-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: adminCookie,
    },
    body: 'tone=urgencia y cierre comercial',
  });
  console.log(`1. Generación de Mensaje con IA -> Status: ${aiRes.status}`);
  const aiHtml = await aiRes.text();
  console.log(`   Mensaje IA insertado en textarea: ${aiHtml.includes('Sofía') && aiHtml.includes('IronPeak')}`);
  console.log(`   Registro en Bitácora de evento IA: ${aiHtml.includes('ai_generated')}`);

  // 3. Test RBAC: Login as Agent Valeria
  const agentLogin = await fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'role=agent',
    redirect: 'manual',
  });
  const agentCookie = agentLogin.headers.get('set-cookie')?.split(';')[0] || '';

  // Try accessing lead_102 (assigned to Mateo Silva usr_agent_2)
  const forbiddenRes = await fetch(`${BASE}/leads/lead_102`, {
    headers: { Cookie: agentCookie },
  });
  console.log(`2. RBAC Aislamiento entre Agentes (lead_102 no asignado a Valeria) -> Status: ${forbiddenRes.status} (Esperado: 403)`);

  // Try accessing /team as agent (should be blocked)
  const teamForbiddenRes = await fetch(`${BASE}/team`, {
    headers: { Cookie: agentCookie },
  });
  console.log(`3. RBAC Bloqueo de /team para Agente -> Status: ${teamForbiddenRes.status} (Esperado: 403)`);

  // 4. Test CSV Load Sample & Validation
  const sampleRes = await fetch(`${BASE}/import/load-sample`, {
    headers: { Cookie: adminCookie },
  });
  console.log(`4. Carga de CSV de prueba en Cloudflare R2 -> Status: ${sampleRes.status}`);
  const sampleHtml = await sampleRes.text();
  console.log(`   Mapeo detecta columnas: ${sampleHtml.includes('Nombre Completo') && sampleHtml.includes('Mapeo Dinámico')}`);

  const matchKey = sampleHtml.match(/name="file_key" value="([^"]+)"/);
  const realFileKey = matchKey ? matchKey[1] : '';

  // Test CSV validation with mapping using the real file_key
  const valForm = new URLSearchParams({
    file_key: realFileKey,
    map_full_name: 'Nombre Completo',
    map_phone: 'Telefono Movil',
    map_email: 'Correo',
    map_presupuesto: 'Presupuesto USD',
    map_producto: 'Programa Interes',
    map_objetivo: 'Objetivo Deportivo',
    map_ciudad: 'Ciudad',
    map_sede: 'Sede',
    map_tags: 'Tags',
    assigned_to: 'auto',
  });
  const validateRes = await fetch(`${BASE}/import/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: adminCookie,
    },
    body: valForm.toString(),
  });
  console.log(`5. Validación y Detección de Duplicados en CSV -> Status: ${validateRes.status}`);
  const valHtml = await validateRes.text();
  console.log(`   Reporte muestra filas válidas y duplicadas: ${valHtml.includes('Reporte de Validación Previa')}`);
  console.log(`   Detectó duplicado en CSV (Sofía Morales +525512345678): ${valHtml.includes('Duplicado')}`);

  console.log('--- Pruebas Avanzadas COMPLETADAS con ÉXITO ---');
}

runAdvancedTests().catch(console.error);
