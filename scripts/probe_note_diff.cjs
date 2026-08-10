const fs = require('fs');
const path = '/home/wang/文档/test';
const d = JSON.parse(fs.readFileSync(path + '/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const map = JSON.parse(fs.readFileSync(path + '/.obsidian/plugins/joplin-server-sync/data/mapping.json', 'utf8'));
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const sessionId = (await loginRes.json()).id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
  // mapping 中 type=1 (Note) 的条目
  const notes = (map.entries || []).filter(e => e.type === 1);
  console.log('mapping Note 条目:', notes.length);
  // 服务器上的 note
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
  let serverNotes = 0;
  for (const it of mdItems) {
    const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
    if (!res.ok) continue;
    const raw = await res.text();
    const tm = raw.match(/type_:\s*(\d+)/);
    if (tm && tm[1] === '1') serverNotes++;
  }
  console.log('服务器 Note:', serverNotes);
  // mapping 有但服务器无的
  const serverIds = new Set();
  for (const it of mdItems) serverIds.add(it.name.slice(0,32));
  const missing = notes.filter(n => !serverIds.has(n.joplinId));
  console.log('mapping 有但服务器无的 Note:', missing.length);
  for (const m of missing) console.log('  ', m.path, m.joplinId.slice(0,8));
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
