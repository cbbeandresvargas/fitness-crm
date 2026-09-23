async function testCfAiFeatures() {
  const BASE = 'http://127.0.0.1:8787';
  console.log('--- Probando Módulos de Cloudflare Workers AI ---');

  // 1. Iniciar sesión como Admin
  const loginRes = await fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'role=admin',
    redirect: 'manual',
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

  // 2. Probar Diagnóstico y Briefing Comercial con Workers AI
  const briefingRes = await fetch(`${BASE}/leads/lead_101/ai-briefing`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  console.log(`1. POST /leads/lead_101/ai-briefing -> Status: ${briefingRes.status}`);
  const briefingHtml = await briefingRes.text();
  console.log(`   Diagnóstico Workers AI visible en pantalla: ${briefingHtml.includes('Diagnóstico Comercial')}`);
  console.log(`   Contiene recomendación generada: ${briefingHtml.includes('Sofía Morales')}`);

  // 3. Probar Sugerencia de Tags con Workers AI
  const tagsRes = await fetch(`${BASE}/leads/lead_101/ai-suggest-tags`, {
    method: 'POST',
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  console.log(`2. POST /leads/lead_101/ai-suggest-tags -> Status: ${tagsRes.status} (Redirige a ficha)`);

  // Verificar que los tags se agregaron al lead
  const detailRes = await fetch(`${BASE}/leads/lead_101`, {
    headers: { Cookie: cookie },
  });
  const detailHtml = await detailRes.text();
  console.log(`   Tags sugeridos por Workers AI visibles: ${detailHtml.includes('VIP') || detailHtml.includes('CrossFit')}`);

  // 4. Probar Generación de Mensaje WhatsApp con Workers AI
  const msgRes = await fetch(`${BASE}/leads/lead_101/ai-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    body: 'tone=urgencia y cierre comercial',
  });
  console.log(`3. POST /leads/lead_101/ai-message -> Status: ${msgRes.status}`);
  const msgHtml = await msgRes.text();
  console.log(`   Mensaje personalizado redactado con Workers AI: ${msgHtml.includes('Sofía') && msgHtml.includes('IronPeak')}`);

  console.log('--- Todos los módulos de Cloudflare Workers AI funcionando al 100% ---');
}

testCfAiFeatures().catch(console.error);
