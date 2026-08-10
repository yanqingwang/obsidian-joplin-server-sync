const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
const base = d.serverUrl.replace(/\/+$/, '');
(async () => {
  const loginRes = await fetch(base + '/api/sessions', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: d.email, password: d.password }) });
  const sessionId = (await loginRes.json()).id;
  const h = { 'X-API-AUTH': sessionId, 'X-API-MIN-VERSION': '2.6.0' };
  // mapping.rootFolderId
  const map = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data/mapping.json', 'utf8'));
  const rootId = map.rootFolderId;
  console.log('mapping.rootFolderId:', rootId);
  // 服务器上这个 id 存在吗？title 是什么？
  const r1 = await fetch(base + '/api/items/root:/' + rootId + '.md:/content', { headers: h });
  console.log('rootFolderId item 读取:', r1.status);
  if (r1.ok) {
    const raw = await r1.text();
    console.log('title:', raw.split('\n')[0]);
    console.log('parent_id:', (raw.match(/parent_id:\s*([^\n]*)/) || [])[1] || '(无)');
    console.log('type_:', (raw.match(/type_:\s*(\d+)/) || [])[1] || '?');
  }
  // 全量收集 folder 项，看顶层文件夹 parent
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
  // 读全部 folder 项（type_=2）
  const folders = [];
  for (const it of mdItems) {
    const res = await fetch(base + '/api/items/root:/' + encodeURIComponent(it.name) + ':/content', { headers: h });
    if (!res.ok) continue;
    const raw = await res.text();
    const tm = raw.match(/type_:\s*(\d+)/);
    if (tm && tm[1] === '2') {
      const title = raw.split('\n')[0];
      const pm = raw.match(/parent_id:\s*([^\n]*)/);
      folders.push({ id: it.name.slice(0,8), title: title.slice(0,40), parent: pm ? (pm[1].slice(0,8) || 'ROOT') : 'NONE' });
    }
  }
  console.log('folder 总数:', folders.length);
  console.log('顶层文件夹（parent=ROOT/NONE）:', folders.filter(f => f.parent === 'ROOT' || f.parent === 'NONE').length);
  console.log('--- 前 30 个 folder ---');
  for (const f of folders.slice(0,30)) console.log(' ', JSON.stringify(f));
  // _vault_ 开头的 folder
  const vaultFolders = folders.filter(f => f.title.startsWith('_vault_'));
  console.log('_vault_* folders:', vaultFolders.length, JSON.stringify(vaultFolders));
  await fetch(base + '/api/sessions/' + sessionId, { method: 'DELETE', headers: h }).catch(()=>{});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
