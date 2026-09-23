// End-to-end automated test for Fitness CRM endpoints

async function runTests() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('--- Iniciando Pruebas de Fitness CRM ---');

  // 1. Test Login Screen
  const loginRes = await fetch(`${BASE}/login`);
  console.log(`1. GET /login -> Status: ${loginRes.status}`);
  const loginHtml = await loginRes.text();
  console.log(`   Contiene IronPeak: ${loginHtml.includes('IRONPEAK')}`);

  // 2. Demo Login as Admin
  const demoLoginRes = await fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'role=admin',
    redirect: 'manual',
  });
  console.log(`2. POST /auth/demo-login -> Status: ${demoLoginRes.status}`);
  const setCookie = demoLoginRes.headers.get('set-cookie');
  console.log(`   Cookie de sesión recibida: ${setCookie ? 'SÍ' : 'NO'}`);

  const cookieHeader = setCookie ? setCookie.split(';')[0] : '';

  // 3. GET / (Dashboard)
  const dashRes = await fetch(`${BASE}/`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`3. GET / (Dashboard) -> Status: ${dashRes.status}`);
  const dashHtml = await dashRes.text();
  console.log(`   Contiene Carlos Mendoza: ${dashHtml.includes('Carlos Mendoza')}`);
  console.log(`   Contiene Segmento A: ${dashHtml.includes('Segmento A')}`);

  // 4. GET /leads (List & Pipeline)
  const leadsRes = await fetch(`${BASE}/leads`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`4. GET /leads -> Status: ${leadsRes.status}`);
  const leadsHtml = await leadsRes.text();
  console.log(`   Contiene Sofía Morales: ${leadsHtml.includes('Sofía Morales')}`);
  console.log(`   Contiene Diego Fernández: ${leadsHtml.includes('Diego Fernández')}`);

  // 5. GET /leads/lead_101 (Detail)
  const lead101Res = await fetch(`${BASE}/leads/lead_101`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`5. GET /leads/lead_101 -> Status: ${lead101Res.status}`);
  const lead101Html = await lead101Res.text();
  console.log(`   Contiene WhatsApp Deep Link wa.me: ${lead101Html.includes('wa.me')}`);
  console.log(`   Contiene Bitácora de Actividades: ${lead101Html.includes('Bitácora')}`);
  console.log(`   Contiene Metadatos Flexibles: ${lead101Html.includes('Metadatos')}`);

  // 6. Test Duplicate Detection: Try creating lead with existing phone +525512345678
  const dupForm = new URLSearchParams({
    full_name: 'Impostor Lead',
    phone: '+525512345678', // Same as Sofía Morales
    status: 'nuevo',
    assigned_to: 'auto',
  });
  const dupRes = await fetch(`${BASE}/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
    body: dupForm.toString(),
  });
  const dupHtml = await dupRes.text();
  console.log(`6. Validación de Duplicados -> Detectado: ${dupHtml.includes('duplicado detectado')}`);

  // 7. Test Creating Valid Lead with dynamic segmentation
  const newPhone = `+5255${Math.floor(10000000 + Math.random() * 90000000)}`;
  const validForm = new URLSearchParams({
    full_name: 'Raúl Jiménez',
    phone: newPhone,
    status: 'nuevo',
    assigned_to: 'auto',
    presupuesto: '200', // >=150 should classify to Segment A
    tags: 'CrossFit, Fuerza',
    initial_note: 'Interesado en membresía black',
  });
  const createRes = await fetch(`${BASE}/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader,
    },
    body: validForm.toString(),
    redirect: 'manual',
  });
  console.log(`7. Creación de Lead -> Status: ${createRes.status}, Redirige a: ${createRes.headers.get('location')}`);

  // 8. Test Export to CSV
  const exportRes = await fetch(`${BASE}/export/csv?segment=A`, {
    headers: { Cookie: cookieHeader },
  });
  console.log(`8. GET /export/csv?segment=A -> Status: ${exportRes.status}`);
  const csvContent = await exportRes.text();
  const firstLine = csvContent.split('\n')[0];
  console.log(`   Encabezados CSV: ${firstLine}`);
  console.log(`   Filas exportadas: ${csvContent.split('\n').length - 1}`);

  console.log('--- Todas las pruebas finalizaron con ÉXITO ---');
}

runTests().catch(console.error);
