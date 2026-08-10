const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const sessionId = (await loginRes.json()).id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
  // 检查关键文件是否在服务器（通过 mapping 或搜索 title）
  const map = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data/mapping.json', 'utf8'));
  const entries = map.entries || [];
  const target = entries.filter(e => (e.path || '').includes('探寻生命的意义'));
  console.log('mapping 中 探寻生命的意义 相关条目:', target.length);
  for (const e of target.slice(0, 8)) console.log(' ', e.path, e.joplinId.slice(0,8), 'type:', e.type);
  // 服务器上搜 title 含 探寻生命的意义 的
  const all = [];
  let cursor;
  do {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await fetch(base + '/api/items/root:/:/children' + q, { headers: h });
    const j = await res.json();
    if (Array.isArray(j.items)) all.push(...j.items);
    cursor = j.has_more ? j.cursor : undefined;
  } while (cursor);
  const mdItems = all.filter(i => /^[0-9a-f]{32}\.md$/.test(i.name));
  let found = 0;
  for (const it of mdItems) {
    const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
    if (!res.ok) continue;
    const raw = await res.text();
    if (raw.split('\n')[0].includes('探寻生命的意义') || raw.includes('探寻生命的意义')) {
      found++;
      if (found <= 5) console.log('  服务器 item:', it.name.slice(0,8), '| title:', raw.split('\n')[0].slice(0,50));
    }
  }
  console.log('服务器上含 探寻生命的意义 的 items:', found);
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
