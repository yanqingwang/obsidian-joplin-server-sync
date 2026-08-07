// 多终端一致性：A建→push→B pull→B改→push→A pull→内容一致（服务器从零开始）
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
import { ModelType } from '../src/api/models';
import { LocalPusher } from '../src/core/LocalPusher';
import { DeltaPuller } from '../src/core/DeltaPuller';
import { VaultWatcher } from '../src/vault/VaultWatcher';

let passed = 0, failed = 0;

async function cleanServer() {
  // 清理服务器上所有非 info.json 项（场景间隔离）
  const creds = JSON.parse(fs.readFileSync('/home/wang/文档/test/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
  const api = new JoplinServerApi(() => ({ baseUrl: creds.serverUrl, email: creds.email, password: creds.password }));
  await api.login();
  let cursor: string | undefined;
  while (true) {
    const page = await api.listChildrenOf('', cursor);
    for (const it of page.items) {
      if (it.name === 'info.json') continue;
      try { await api.deleteItem(it.name); } catch {}
    }
    cursor = page.cursor;
    if (!page.has_more || !cursor) break;
  }
}
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

async function main() {
  console.log('\n=== 多终端一致性（干净环境）===\n');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mt-a');
  const tB = await makeTerminal('/tmp/mt-b');

  console.log('[1] 终端A 新建文件 + 推送');
  fs.writeFileSync('/tmp/mt-a/共享笔记.md', '# 共享笔记\n初始内容\n');
  const fileA = tA.app.vault.getAbstractFileByPath('共享笔记.md');
  const idA = await tA.identity.ensureId(fileA);
  await tA.changeLog.push({ fileId: idA, op: 'create', path: '共享笔记.md', type: ModelType.Note });
  await tA.api.login();
  const pushA = await new LocalPusher(tA, tA.changeLog).pushAll();
  check(pushA.created === 1, 'A 推送 1 新建');

  console.log('[2] 终端B 拉取');
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  const bFile = '/tmp/mt-b/共享笔记.md';
  check(fs.existsSync(bFile), 'B 拉到文件');
  const bInit = fs.existsSync(bFile) ? fs.readFileSync(bFile, 'utf8') : '';
  check(bInit.includes('初始内容'), 'B 内容正确');

  console.log('[3] 终端B 修改 + 推送');
  fs.writeFileSync(bFile, '# 共享笔记\nB 的修改\n');
  const fileB = tB.app.vault.getAbstractFileByPath('共享笔记.md');
  const idB = await tB.identity.ensureId(fileB);
  check(idA === idB, 'B 与 A 同一 fileId (' + idB.slice(0,8) + ')');
  await tB.changeLog.push({ fileId: idB, op: 'update', path: '共享笔记.md', type: ModelType.Note });
  const pushB = await new LocalPusher(tB, tB.changeLog).pushAll();
  check(pushB.updated === 1, 'B 推送 1 更新');

  console.log('[4] 终端A 拉取 B 的修改');
  await new DeltaPuller(tA, new VaultWatcher(tA, tA.changeLog)).pullAll();
  const aContent = fs.readFileSync('/tmp/mt-a/共享笔记.md', 'utf8');
  const bContent = fs.readFileSync(bFile, 'utf8');
  check(aContent.includes('B 的修改'), 'A 拉到 B 的修改');
  check(aContent === bContent, 'A 与 B 内容完全一致');

  await testDelete();
  await testMerge();

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/mt-a', { recursive: true, force: true });
  fs.rmSync('/tmp/mt-b', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });

// ==== 场景 2：删除墓碑跨终端同步 ====
async function testDelete() {
  console.log('\n[5] 终端A 删除文件 → B 感知删除');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mt-a2');
  const tB = await makeTerminal('/tmp/mt-b2');

  fs.writeFileSync('/tmp/mt-a2/待删文件.md', '# 待删\n内容\n');
  const fA = tA.app.vault.getAbstractFileByPath('待删文件.md');
  const idA = await tA.identity.ensureId(fA);
  await tA.changeLog.push({ fileId: idA, op: 'create', path: '待删文件.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/tmp/mt-b2/待删文件.md'), 'B 先拉到文件');

  // A 删除：记录 delete 变更
  fs.rmSync('/tmp/mt-a2/待删文件.md');
  await tA.changeLog.push({ fileId: idA, op: 'delete', path: '待删文件.md', type: ModelType.Note });
  const delA = await new LocalPusher(tA, tA.changeLog).pushAll();
  check(delA.deleted === 1, 'A 推送删除 (deleted=' + delA.deleted + ')');

  // B 拉取：delta 的 Delete 事件 → 本地删除
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/tmp/mt-b2/待删文件.md'), 'B 感知删除，本地文件消失');

  fs.rmSync('/tmp/mt-a2', { recursive: true, force: true });
  fs.rmSync('/tmp/mt-b2', { recursive: true, force: true });
}

// ==== 场景 3：三方合并 ====
async function testMerge() {
  console.log('\n[6] 终端A/B 同时修改不同位置 → 自动合并');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mt-a3');
  const tB = await makeTerminal('/tmp/mt-b3');

  const base = '# 文档\n\n第一段\n\n第二段\n';
  fs.writeFileSync('/tmp/mt-a3/合并文档.md', base);
  const fA = tA.app.vault.getAbstractFileByPath('合并文档.md');
  const idA = await tA.identity.ensureId(fA);
  await tA.changeLog.push({ fileId: idA, op: 'create', path: '合并文档.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();

  // B 修改第一段并推送
  fs.writeFileSync('/tmp/mt-b3/合并文档.md', '# 文档\n\n第一段(B改)\n\n第二段\n');
  const fB = tB.app.vault.getAbstractFileByPath('合并文档.md');
  const idB = await tB.identity.ensureId(fB);
  await tB.changeLog.push({ fileId: idB, op: 'update', path: '合并文档.md', type: ModelType.Note });
  await new LocalPusher(tB, tB.changeLog).pushAll();

  // A 修改第二段（基于 base）并推送
  fs.writeFileSync('/tmp/mt-a3/合并文档.md', '# 文档\n\n第一段\n\n第二段(A改)\n');
  await tA.changeLog.push({ fileId: idA, op: 'update', path: '合并文档.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();

  // 双方拉取
  await new DeltaPuller(tA, new VaultWatcher(tA, tA.changeLog)).pullAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  const aC = fs.readFileSync('/tmp/mt-a3/合并文档.md', 'utf8');
  const bC = fs.readFileSync('/tmp/mt-b3/合并文档.md', 'utf8');
  check(aC.includes('第一段(B改)'), 'A 内容含 B 的修改');
  check(bC.includes('第二段(A改)'), 'B 内容含 A 的修改');
  check(aC === bC, 'A 与 B 合并后一致');

  fs.rmSync('/tmp/mt-a3', { recursive: true, force: true });
  fs.rmSync('/tmp/mt-b3', { recursive: true, force: true });
}
