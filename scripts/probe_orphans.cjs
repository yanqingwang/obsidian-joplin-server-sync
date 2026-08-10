const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data/mapping.json', 'utf8'));
const rootId = map.rootFolderId;
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const sessionId = (await loginRes.json()).id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
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
  // 全部 folder 项
  const folders = [];
  for (const it of mdItems) {
    const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
    if (!res.ok) continue;
    const raw = await res.text();
    const tm = raw.match(/type_:\s*(\d+)/);
    if (tm && tm[1] === '2') {
      const pm = raw.match(/parent_id:\s*([0-9a-f]{32}|)/);
      folders.push({ id: it.name.slice(0,32), title: raw.split('\n')[0].slice(0,50), parent: pm && pm[1] ? pm[1].slice(0,8) : 'ROOT' });
    }
  }
  console.log('服务器 folder 总数:', folders.length);
  console.log('--- 全部 folder 列表 ---');
  for (const f of folders) console.log(' ', f.id.slice(0,8), '|', f.title, '| parent:', f.parent);
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
