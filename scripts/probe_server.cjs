const { loadCreds, makePlugin } = require('../cli/sync-cli.cjs');
const path = '/home/wang/文档/test';
const creds = loadCreds(path);
const plugin = makePlugin(path, creds);
(async () => {
  await plugin.api.login();
  const all = [];
  let cursor;
  while (true) {
    const page = await plugin.api.listChildrenOf('', cursor);
    all.push(...page.items);
    if (!page.has_more) break;
    cursor = page.cursor;
  }
  console.log('服务器 root children 总数:', all.length);
  const mdItems = all.filter(i => /^[0-9a-f]{32}\.md$/.test(i.name));
  const blobs = all.filter(i => i.name.startsWith('.resource/'));
  const others = all.filter(i => !/^[0-9a-f]{32}\.md$/.test(i.name) && !i.name.startsWith('.resource/'));
  console.log('md 项:', mdItems.length, '| blobs:', blobs.length, '| 其他:', others.map(o=>o.name).join(','));
  let vaultRoots = [], folders = 0, notes = 0, masterKeys = 0, undef = 0;
  const folderTitles = [];
  for (const it of mdItems) {
    try {
      const raw = await plugin.api.getItem(it.name);
      if (!raw) { undef++; continue; }
      const head = raw.split('\n')[0];
      if (head.startsWith('_vault_')) { vaultRoots.push(head); continue; }
      const body = raw.split('\n\n')[1] || '';
      if (body.includes('type_: 2')) { folders++; folderTitles.push(head); }
      else if (body.includes('type_: 9')) masterKeys++;
      else notes++;
    } catch { undef++; }
  }
  console.log('vault 根文件夹(_vault_*):', JSON.stringify(vaultRoots));
  console.log('folder 数:', folders, '| notes:', notes, '| masterKey:', masterKeys, '| 读取失败:', undef);
  console.log('前 20 个 folder title:', JSON.stringify(folderTitles.slice(0, 20)));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
