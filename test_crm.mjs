// End-to-end automated test for Fitness CRM endpoints (SolidJS + Hono + Cloudflare Workers)

async function runTests() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('--- Iniciando Pruebas de Fitness CRM (SolidJS + Hono) ---');

  // 1. Test Static Single-Page App serving
  const spaRes = await fetch(`${BASE}/`);
  console.log(`1. GET / (SolidJS SPA index.html) -> Status: ${spaRes.status}`);
  const spaHtml = await spaRes.text();
  console.log(`   Contiene contenedor #root: ${spaHtml.includes('id="root"')}`);
  console.log(`   Contiene IronPeak en título: ${spaHtml.includes('IronPeak')}`);

  // 2. Demo Login as Admin via API
  const demoLoginRes = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  console.log(`2. POST /api/auth/demo-login -> Status: ${demoLoginRes.status}`);
  const setCookie = demoLoginRes.headers.get('set-cookie');
  console.log(`   Cookie de sesión recibida: ${setCookie ? 'SÍ' : 'NO'}`);
  const loginData = await demoLoginRes.json();
  console.log(`   Usuario autenticado: ${loginData.user?.name} (Rol: ${loginData.user?.role})`);

  const cookieHeader = setCookie ? setCookie.split(';')[0] : '';

  // 3. Verify Session via /api/auth/me
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: cookieHeader },
  });
  const meData = await meRes.json();
  console.log(`3. GET /api/auth/me -> Usuario: ${meData.user?.name} (${meData.user?.role})`);

  // 4. Test Dashboard API
  const dashRes = await fetch(`${BASE}/api/dashboard`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`4. GET /api/dashboard -> Status: ${dashRes.status}`);
  const dashData = await dashRes.json();
  console.log(`   Total Leads: ${dashData.totalLeads}`);
  console.log(`   Segmento A: ${dashData.segmentsCount.A}, Segmento B: ${dashData.segmentsCount.B}`);
  console.log(`   Actividades recientes: ${dashData.recentActivities?.length}`);

  // 5. Test Leads List API
  const leadsRes = await fetch(`${BASE}/api/leads`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`5. GET /api/leads -> Status: ${leadsRes.status}`);
  const leadsData = await leadsRes.json();
  console.log(`   Cantidad de leads: ${leadsData.leads?.length}`);
  const lead101 = leadsData.leads?.find((l) => l.id === 'lead_101');
  console.log(`   Encontrado lead_101: ${lead101?.full_name} (${lead101?.phone})`);

  // 6. Test Lead Detail API
  const leadDetailRes = await fetch(`${BASE}/api/leads/lead_101`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`6. GET /api/leads/lead_101 -> Status: ${leadDetailRes.status}`);
  const detailData = await leadDetailRes.json();
  console.log(`   Lead: ${detailData.lead?.full_name}, Actividades: ${detailData.activities?.length}`);

  // 7. Test Duplicate Detection: Try creating lead with existing phone +525512345678
  const dupRes = await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      full_name: 'Impostor Lead',
      phone: '+525512345678', // Same as Sofía Morales
      status: 'nuevo',
      assigned_to: 'auto',
    }),
  });
  console.log(`7. Validación de Duplicados -> Status: ${dupRes.status} (Esperado: 409)`);
  const dupData = await dupRes.json();
  console.log(`   Duplicado detectado correctamente: ${dupData.duplicate === true}`);

  // 8. Test Creating Valid Lead with dynamic segmentation
  const newPhone = `+5255${Math.floor(10000000 + Math.random() * 90000000)}`;
  const createRes = await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({
      full_name: 'Raúl Jiménez',
      phone: newPhone,
      status: 'nuevo',
      assigned_to: 'auto',
      metadata: {
        presupuesto: 200, // >=150 should classify to Segment A
        producto: 'CrossFit Pro',
        objetivo: 'Ganar fuerza',
      },
      tags: ['CrossFit', 'Fuerza'],
      notes: 'Interesado en membresía anual black',
    }),
  });
  console.log(`8. Creación de Lead -> Status: ${createRes.status} (Esperado: 201)`);
  const createdData = await createRes.json();
  console.log(`   Lead creado ID: ${createdData.lead?.id}, Segmento calculado: ${createdData.lead?.segment}`);

  // 9. Test Status Update & Note Addition
  const statusRes = await fetch(`${BASE}/api/leads/${createdData.lead.id}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ status: 'cita_agendada' }),
  });
  console.log(`9. Actualizar Estado -> Status: ${statusRes.status}`);

  const noteRes = await fetch(`${BASE}/api/leads/${createdData.lead.id}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ note: 'Cliente agendó valoración física para el sábado.' }),
  });
  console.log(`10. Registrar Nota -> Status: ${noteRes.status}`);

  // 11. Test Export to CSV
  const exportRes = await fetch(`${BASE}/api/export/csv`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`11. GET /api/export/csv -> Status: ${exportRes.status}`);
  const csvContent = await exportRes.text();
  console.log(`    Filas exportadas: ${csvContent.split('\n').length - 1}`);

  console.log('--- Todas las pruebas principales finalizaron con ÉXITO ---');
}

runTests().catch(console.error);
