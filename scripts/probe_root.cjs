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
  // 读取全部 items 的 type/parent
  const items = [];
  for (const it of mdItems) {
    try {
      const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
      if (!res.ok) continue;
      const raw = await res.text();
      const tm = raw.match(/type_:\s*(\d+)/);
      const pm = raw.match(/parent_id:\s*([0-9a-f]{32}|)/);
      const title = raw.split('\n')[0];
      items.push({ id: it.name.slice(0,32), type: tm ? +tm[1] : 0, parent: pm && pm[1] ? pm[1] : '', title: title.slice(0,50) });
    } catch {}
  }
  console.log('读取 items:', items.length, '| test rootId:', rootId);
  // 构建 parent map + belongsToRoot
  const parentMap = new Map(items.map(i => [i.id, i.parent]));
  const cache = new Map();
  const belongsToRoot = (item) => {
    if (item.type === 4 || item.type === 9) return true;
    let pid = item.parent;
    if (!pid) return false;
    const visited = new Set();
    let depth = 0;
    while (pid && !visited.has(pid) && depth < 64) {
      visited.add(pid);
      if (pid === rootId) return true;
      if (cache.has(pid)) return cache.get(pid);
      const next = parentMap.get(pid);
      if (!next || next === pid) { for (const v of visited) cache.set(v, false); return false; }
      pid = next; depth++;
    }
    for (const v of visited) cache.set(v, false);
    return false;
  };
  const owned = items.filter(i => belongsToRoot(i));
  const foreign = items.filter(i => !belongsToRoot(i));
  const cnt = (arr, t) => arr.filter(i => i.type === t).length;
  console.log('属于 test root:', owned.length, '(note:' + cnt(owned,1) + ' folder:' + cnt(owned,2) + ' res:' + cnt(owned,4) + ')');
  console.log('不属于 test root (foreign):', foreign.length, '(note:' + cnt(foreign,1) + ' folder:' + cnt(foreign,2) + ' res:' + cnt(foreign,4) + ')');
  console.log('--- foreign folder 前 10 ---');
  for (const f of foreign.filter(i => i.type === 2).slice(0,10)) console.log(' ', f.title, 'parent:', f.parent.slice(0,8));
  console.log('--- foreign note 前 5 ---');
  for (const f of foreign.filter(i => i.type === 1).slice(0,5)) console.log(' ', f.title, 'parent:', f.parent.slice(0,8));
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
