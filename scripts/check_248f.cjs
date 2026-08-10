const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const sessionId = (await loginRes.json()).id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
  const r = await fetch(base + '/api/items/root:/248f323e4fc53a3e3a49cd5ff4316556.md:/content', { headers: h });
  console.log('248f323e 服务器读取:', r.status);
  if (r.ok) {
    const raw = await r.text();
    console.log('title:', raw.split('\n')[0]);
    console.log('type:', (raw.match(/type_:\s*(\d+)/)||[])[1]);
    console.log('parent:', (raw.match(/parent_id:\s*([0-9a-f]{32}|)/)||[])[1]);
  }
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
