// Comprehensive QA & End-to-End Test Suite for IronPeak Fitness CRM
// Covers: Auth, RBAC, Leads CRUD, Dynamic Segmentation, WhatsApp Chat & Media, AI & Exports

async function runTestSuite() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('====================================================');
  console.log('🧪 INICIANDO SUITE DE QA Y PRUEBAS AUTOMATIZADAS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // 1. Verificar SPA
  const spaRes = await fetch(`${BASE}/`);
  const spaText = await spaRes.text();
  assert(spaRes.status === 200, 'Servir SPA SolidJS', `Status: ${spaRes.status}`);
  assert(spaText.includes('IronPeak'), 'Contenido HTML contiene título de la marca');

  // 2. Auth Admin
  const adminLogin = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0] || '';
  const adminData = await adminLogin.json();
  assert(adminLogin.status === 200 && adminData.user?.role === 'admin', 'Login Admin 1-clic', adminData.user?.name);

  // 3. Auth Me
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Cookie: adminCookie },
  });
  const meData = await meRes.json();
  assert(meData.user?.role === 'admin', 'Sesión activa verificada vía /api/auth/me');

  // 4. Dashboard KPIs
  const dashRes = await fetch(`${BASE}/api/dashboard`, {
    headers: { Cookie: adminCookie },
  });
  const dashData = await dashRes.json();
  assert(dashRes.status === 200 && typeof dashData.totalLeads === 'number', 'Obtención de métricas del Dashboard', `Total Leads: ${dashData.totalLeads}`);
  assert(dashData.segmentsCount && typeof dashData.segmentsCount.A === 'number', 'Conteo de segmentos en Dashboard');

  // 5. Crear Lead con Segmento A automático (Presupuesto >= 150)
  const testPhone = `+5255${Math.floor(10000000 + Math.random() * 90000000)}`;
  const createLeadRes = await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      full_name: 'Atleta QA Test',
      phone: testPhone,
      email: 'atleta.qa@ironpeak.fit',
      status: 'nuevo',
      assigned_to: 'auto',
      tags: ['CrossFit', 'QA', 'VIP'],
      metadata: {
        presupuesto: 220,
        producto: 'CrossFit Élite',
        objetivo: 'Mejorar resistencia y fuerza olímpica',
        sede: 'Polanco',
        ciudad: 'Ciudad de México',
      },
      notes: 'Lead creado durante la ejecución de suite de QA automatizada.',
    }),
  });
  const createdLeadData = await createLeadRes.json();
  assert(createLeadRes.status === 201, 'Crear Lead nuevo', `ID: ${createdLeadData.lead?.id}`);
  assert(createdLeadData.lead?.segment === 'A', 'Segmentación Dinámica automática a Segmento A', `Segmento: ${createdLeadData.lead?.segment}`);

  const leadId = createdLeadData.lead?.id;

  // 6. Detección estricta de duplicados por teléfono
  const dupCheckRes = await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      full_name: 'Lead Duplicado Falso',
      phone: testPhone,
      status: 'nuevo',
    }),
  });
  assert(dupCheckRes.status === 409, 'Bloqueo de teléfono duplicado (HTTP 409 Conflict)');

  // 7. Actualizar datos del Lead (Edición Completa)
  const updateRes = await fetch(`${BASE}/api/leads/${leadId}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      full_name: 'Atleta QA Actualizado',
      metadata: {
        presupuesto: 250,
        objetivo: 'Competencia nacional de CrossFit',
        sede: 'Polanco',
      },
      notes_summary: 'Datos actualizados con éxito en prueba QA.',
    }),
  });
  const updateData = await updateRes.json();
  assert(updateRes.status === 200, 'Actualizar información general del Lead (PUT / POST /update)', updateData.lead?.full_name);
  assert(updateData.lead?.full_name === 'Atleta QA Actualizado', 'Persistencia de nombre modificado');

  // 8. WhatsApp Messages: Enviar mensaje de texto
  const sendMsgRes = await fetch(`${BASE}/api/leads/${leadId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      content: '¡Hola! Te compartimos el acceso a las instalaciones para tu clase de prueba.',
      message_type: 'text',
      sender: 'agent',
    }),
  });
  const sendMsgData = await sendMsgRes.json();
  assert(sendMsgRes.status === 201, 'Enviar y registrar mensaje de texto en WhatsApp', `ID: ${sendMsgData.message?.id}`);
  assert(sendMsgData.deepLink?.includes('wa.me'), 'Generación de Deep Link wa.me con codificación segura');

  // 9. WhatsApp Messages: Enviar mensaje con imagen
  const sendImgRes = await fetch(`${BASE}/api/leads/${leadId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      content: 'Comprobante y Plan Nutricional Personalizado',
      message_type: 'image',
      media_url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800&auto=format&fit=crop&q=80',
      sender: 'agent',
    }),
  });
  const sendImgData = await sendImgRes.json();
  assert(sendImgRes.status === 201, 'Enviar y registrar mensaje con imagen para WhatsApp', `Tipo: ${sendImgData.message?.message_type}`);

  // 10. WhatsApp Messages: Recuperar historial completo de chat
  const chatHistoryRes = await fetch(`${BASE}/api/leads/${leadId}/messages`, {
    headers: { Cookie: adminCookie },
  });
  const chatHistoryData = await chatHistoryRes.json();
  assert(chatHistoryRes.status === 200 && chatHistoryData.messages?.length >= 2, 'Recuperar conversación de chat completa', `Mensajes: ${chatHistoryData.messages?.length}`);

  // 11. Generación de Mensaje con IA (Llama 3.1)
  const aiRes = await fetch(`${BASE}/api/leads/${leadId}/ai-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({ tone: 'cierre' }),
  });
  const aiData = await aiRes.json();
  assert(aiRes.status === 200 && Boolean(aiData.message), 'Generar mensaje hiper-personalizado con Workers AI', `${aiData.message?.slice(0, 45)}...`);

  // 12. RBAC: Acceso de Coach Valeria
  const coachLogin = await fetch(`${BASE}/api/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'agent' }),
  });
  const coachCookie = coachLogin.headers.get('set-cookie')?.split(';')[0] || '';
  const coachData = await coachLogin.json();
  assert(coachLogin.status === 200 && coachData.user?.role === 'agent', 'Login Coach Valeria');

  // Coach intenta entrar a /api/team (debe ser bloqueado con 403)
  const teamForbidden = await fetch(`${BASE}/api/team`, {
    headers: { Cookie: coachCookie },
  });
  assert(teamForbidden.status === 403, 'Aislamiento RBAC: Coach bloqueado de sección de Equipo/Admin (403)');

  // 13. Eliminar Lead de prueba de QA
  const deleteRes = await fetch(`${BASE}/api/leads/${leadId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  const deleteData = await deleteRes.json();
  assert(deleteRes.status === 200 && deleteData.deletedId === leadId, 'Eliminar Lead de forma segura (DELETE /api/leads/:id)');

  // 14. Exportar CSV
  const exportCsvRes = await fetch(`${BASE}/api/export/csv`, {
    headers: { Cookie: adminCookie },
  });
  const csvText = await exportCsvRes.text();
  assert(exportCsvRes.status === 200 && csvText.includes('Nombre Completo'), 'Exportación a CSV generada con encabezados correctos');

  console.log('\n====================================================');
  console.log(`📊 RESULTADO DE LA AUDITORÍA DE QA:`);
  console.log(`   Pruebas Exitosas: ${passed}`);
  console.log(`   Pruebas Fallidas: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Error no controlado en suite de pruebas:', err);
  process.exit(1);
});
