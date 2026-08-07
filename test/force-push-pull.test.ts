// 验证4+5: forcePush 先删远程再重传; forcePull 先删本地再下载
import * as fs from 'fs';
import { MockVault, DiskAdapter } from './mock/vault';
import { setVaultRoot } from './mock/obsidian-real';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { MappingStore } from '../src/mapping/MappingStore';
import { SyncEngine } from '../src/core/SyncEngine';
import { DEFAULT_SETTINGS } from '../src/settings/PluginSettings';
import { EncryptionService } from '../src/e2ee/EncryptionService';
import { ChangeLogStore } from '../src/core/ChangeLogStore';
import { FileIdentity } from '../src/core/FileIdentity';

let passed = 0, failed = 0;
const check = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); c ? passed++ : failed++; };

async function makeTerminal(vaultPath: string) {
  fs.rmSync(vaultPath, { recursive: true, force: true });
  fs.mkdirSync(vaultPath + '/.obsidian/plugins/joplin-server-sync', { recursive: true });
  const creds = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
  creds.e2eeEnabled = false; creds.e2eePassword = '';
  fs.writeFileSync(vaultPath + '/.obsidian/plugins/joplin-server-sync/data.json', JSON.stringify(creds, null, 2));
  setVaultRoot(vaultPath);
  const vault = new MockVault(vaultPath);
  vault.adapter = new DiskAdapter(vaultPath);
  const api = new JoplinServerApi(() => ({ baseUrl: creds.serverUrl, email: creds.email, password: creds.password }));
  const plugin: any = { app: { vault }, api, settings: { ...DEFAULT_SETTINGS, e2eeEnabled: false, e2eePassword: '' },
    manifest: { dir: vaultPath + '/.obsidian/plugins/joplin-server-sync' },
    statusBar: { setSyncing(){}, setProgress(){}, setIdle(){}, setOk(){}, setError(){} },
    logSync(){}, registerEvent(r: any){ return r; }, e2ee: new EncryptionService() };
  plugin.mapping = new MappingStore(plugin);
  await plugin.mapping.load();
  plugin.changeLog = new ChangeLogStore(plugin);
  await plugin.changeLog.load();
  plugin.identity = new FileIdentity(plugin);
  plugin.engine = new SyncEngine(plugin);
  return plugin;
}

async function countServerItems() {
  const creds = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
  const api = new JoplinServerApi(() => ({ baseUrl: creds.serverUrl, email: creds.email, password: creds.password }));
  await api.login();
  let cursor: string | undefined;
  let notes = 0, folders = 0;
  while (true) {
    const page = await api.listChildrenOf('', cursor);
    for (const it of page.items) {
      if (it.name === 'info.json') continue;
      if (it.name.startsWith('.resource/')) continue;
      try {
        const raw = await api.getItem(it.name);
        if (raw && raw.includes('type_: 1')) notes++;
        if (raw && raw.includes('type_: 2')) folders++;
      } catch {}
    }
    cursor = page.cursor;
    if (!page.has_more || !cursor) break;
  }
  return { notes, folders };
}

async function main() {
  console.log('\n=== Force Push/Pull 语义验证 ===\n');
  const tA = await makeTerminal('/tmp/fp-a');
  const tB = await makeTerminal('/tmp/fp-b');
  const W = '/tmp/fp-a';

  // ---- 基线：3 文件 2 文件夹 ----
  console.log('[基线] 文件夹A/文件1.md + 文件夹A/文件2.md + 文件夹B/文件3.md');
  fs.mkdirSync(W + '/文件夹A', { recursive: true });
  fs.mkdirSync(W + '/文件夹B', { recursive: true });
  fs.writeFileSync(W + '/文件夹A/文件1.md', '内容1');
  fs.writeFileSync(W + '/文件夹A/文件2.md', '内容2');
  fs.writeFileSync(W + '/文件夹B/文件3.md', '内容3');
  const files = ['文件夹A/文件1.md', '文件夹A/文件2.md', '文件夹B/文件3.md'];
  for (const p of files) {
    const f = tA.app.vault.getAbstractFileByPath(p);
    const id = f ? await tA.identity.ensureId(f) : '';
    await tA.changeLog.push({ fileId: id, op: 'create', path: p, type: 1 as const });
  }
  await tA.api.login();
  const push0 = await tA.engine.forcePush();
  void push0;
  let srv = await countServerItems();
  console.log('  服务器: notes=' + srv.notes + ' folders=' + srv.folders);
  check(srv.notes === 3 && srv.folders === 2, '基线: 服务器 3 notes + 2 folders');

  // ---- forcePush 语义：本地删文件2，forcePush 后服务器应只剩 2 notes ----
  console.log('\n[验证4] forcePush: 本地删 文件2.md → 服务器应删掉该文件');
  fs.rmSync(W + '/文件夹A/文件2.md');
  const f2 = tA.app.vault.getAbstractFileByPath('文件夹A/文件2.md');
  const id2 = f2 ? await tA.identity.ensureId(f2) : '';
  await tA.changeLog.push({ fileId: id2, op: 'delete', path: '文件夹A/文件2.md', type: 1 as const });
  // forcePush 会 reset 服务器 + 重传全部本地
  await tA.engine.forcePush();
  srv = await countServerItems();
  console.log('  服务器: notes=' + srv.notes + ' folders=' + srv.folders);
  check(srv.notes === 2, 'forcePush 后服务器只剩 2 notes（文件2 已删）');
  check(srv.folders === 2, '文件夹保留 2 个');

  // ---- forcePush 语义：本地新增文件 → 服务器出现 ----
  console.log('\n[验证4b] forcePush: 本地新增 文件4.md → 服务器出现');
  fs.writeFileSync(W + '/文件夹B/文件4.md', '内容4');
  const f4 = tA.app.vault.getAbstractFileByPath('文件夹B/文件4.md');
  const id4 = f4 ? await tA.identity.ensureId(f4) : '';
  await tA.changeLog.push({ fileId: id4, op: 'create', path: '文件夹B/文件4.md', type: 1 as const });
  await tA.engine.forcePush();
  srv = await countServerItems();
  console.log('  服务器: notes=' + srv.notes + ' folders=' + srv.folders);
  check(srv.notes === 3, 'forcePush 后服务器 3 notes（含新增文件4）');

  await forcePullTest();

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/fp-a', { recursive: true, force: true });
  fs.rmSync('/tmp/fp-b', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });

// ==== 验证5: forcePull 先删本地再下载 ====
async function forcePullTest() {
  const tA = await makeTerminal('/tmp/fp-a');
  const tB = await makeTerminal('/tmp/fp-b');
  const WA = '/tmp/fp-a';
  const WB = '/tmp/fp-b';

  // A 建立服务器内容：2 文件
  fs.mkdirSync(WA + '/文件夹A', { recursive: true });
  fs.writeFileSync(WA + '/文件夹A/文件1.md', '内容1');
  fs.writeFileSync(WA + '/文件夹A/文件2.md', '内容2');
  for (const p of ['文件夹A/文件1.md', '文件夹A/文件2.md']) {
    const f = tA.app.vault.getAbstractFileByPath(p);
    const id = f ? await tA.identity.ensureId(f) : '';
    await tA.changeLog.push({ fileId: id, op: 'create', path: p, type: 1 as const });
  }
  await tA.api.login();
  await tA.engine.forcePush();

  // B 本地有垃圾文件（服务器没有的）
  fs.writeFileSync(WB + '/垃圾文件.md', '垃圾');
  fs.mkdirSync(WB + '/垃圾目录', { recursive: true });
  fs.writeFileSync(WB + '/垃圾目录/垃圾笔记.md', '垃圾笔记');

  // B forcePull：应清空本地垃圾 + 下载服务器内容
  await tB.api.login();
  await tB.engine.forcePull();

  check(!fs.existsSync(WB + '/垃圾文件.md'), 'forcePull: 本地垃圾文件已删');
  check(!fs.existsSync(WB + '/垃圾目录'), 'forcePull: 本地垃圾目录已删');
  check(fs.existsSync(WB + '/文件夹A/文件1.md'), 'forcePull: 下载了文件1');
  check(fs.existsSync(WB + '/文件夹A/文件2.md'), 'forcePull: 下载了文件2');
  const ok = fs.existsSync(WB + '/文件夹A/文件1.md') && fs.existsSync(WB + '/文件夹A/文件2.md') &&
    !fs.existsSync(WB + '/垃圾文件.md') && !fs.existsSync(WB + '/垃圾目录');
  check(ok, 'forcePull: 本地 = 服务器内容');
}
