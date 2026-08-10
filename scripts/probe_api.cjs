const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  // 登录
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const loginJson = await loginRes.json();
  const sessionId = loginJson.id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
  // 全量分页
  const all = [];
  let cursor;
  do {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await fetch(base + '/api/items/root:/:/children' + q, { headers: h });
    const j = await res.json();
    if (!Array.isArray(j.items)) { console.log('children error:', res.status, JSON.stringify(j).slice(0,200)); break; }
    all.push(...j.items);
    cursor = j.has_more ? j.cursor : undefined;
  } while (cursor);
  console.log('服务器 root children 总数:', all.length);
  const mdItems = all.filter(i => /^[0-9a-f]{32}\.md$/.test(i.name));
  const blobs = all.filter(i => i.name.startsWith('.resource/'));
  console.log('md 项:', mdItems.length, '| blobs:', blobs.length);
  // 读前 40 个 md 项，提取 title/parent_id/type
  const samples = [];
  for (const it of mdItems.slice(0, 40)) {
    try {
      const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
      if (!res.ok) continue;
      const raw = await res.text();
      const firstLine = raw.split('\n')[0];
      const pidMatch = raw.match(/parent_id:\s*([^\n]*)/);
      const typeMatch = raw.match(/type_:\s*(\d+)/);
      samples.push({ name: it.name.slice(0,8), title: firstLine.slice(0,30), parent: pidMatch ? pidMatch[1].slice(0,8) : '(无)', type: typeMatch ? typeMatch[1] : '?' });
    } catch {}
  }
  console.log('前 40 项采样 (name/title/parent/type):');
  for (const s of samples) console.log(' ', JSON.stringify(s));
  // 统计 parent 分布
  console.log('--- 全量 parent_id 分布（采样 100 个 md 项）---');
  const parentDist = {};
  let checked = 0;
  for (const it of mdItems) {
    if (checked >= 100) break;
    checked++;
    try {
      const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
      if (!res.ok) continue;
      const raw = await res.text();
      const pidMatch = raw.match(/parent_id:\s*([^\n]*)/);
      const typeMatch = raw.match(/type_:\s*(\d+)/);
      const key = (typeMatch ? 'type'+typeMatch[1] : 'type?') + ':' + (pidMatch ? (pidMatch[1] ? pidMatch[1].slice(0,8) : 'ROOT') : 'NONE');
      parentDist[key] = (parentDist[key] || 0) + 1;
    } catch {}
  }
  console.log(JSON.stringify(parentDist, null, 1));
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
