// 增量变更同步验证（真实 test/test1，非 forcePush/Pull）
// 在 test 中做变更 → syncCycle 增量 → 验证 test1
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
const check = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); c ? passed++ : failed++; };

async function makeTerminal(vaultPath: string) {
  setVaultRoot(vaultPath);
  const vault = new MockVault(vaultPath);
  vault.adapter = new DiskAdapter(vaultPath);
  const creds = JSON.parse(fs.readFileSync(vaultPath + '/.obsidian/plugins/joplin-server-sync/data.json', 'utf8'));
  const api = new JoplinServerApi(() => ({ baseUrl: creds.serverUrl, email: creds.email, password: creds.password }));
  const plugin: any = { app: { vault }, api, settings: { ...DEFAULT_SETTINGS, ...creds },
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
  console.log('\n=== 增量变更同步验证 (真实 test → test1) ===\n');
  const tA = await makeTerminal('/home/wang/文档/test');
  const tB = await makeTerminal('/home/wang/文档/test1');
  const W = '/home/wang/文档/test';

  // [1] 修改内容：找一个现有文件修改
  console.log('[1] 修改内容');
  const target = 'AIReports/00-Index.md';
  const orig = fs.readFileSync(W + '/' + target, 'utf8');
  fs.writeFileSync(W + '/' + target, orig + '\n\n<!-- 增量测试标记 -->\n');
  const f1 = tA.app.vault.getAbstractFileByPath(target);
  const id1 = f1 ? await tA.identity.ensureId(f1) : '';
  await tA.changeLog.push({ fileId: id1, op: 'update', path: target, type: ModelType.Note });
  await tA.api.login();
  const push1 = await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  const b1 = fs.readFileSync('/home/wang/文档/test1/' + target, 'utf8');
  check(b1.includes('增量测试标记'), 'B 同步了内容修改');
  // 还原
  fs.writeFileSync(W + '/' + target, orig);

  // [2] 新建文件
  console.log('[2] 新建文件');
  fs.writeFileSync(W + '/增量测试新文件.md', '# 新文件\n新内容\n');
  const f2 = tA.app.vault.getAbstractFileByPath('增量测试新文件.md');
  const id2 = f2 ? await tA.identity.ensureId(f2) : '';
  await tA.changeLog.push({ fileId: id2, op: 'create', path: '增量测试新文件.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/home/wang/文档/test1/增量测试新文件.md'), 'B 同步了新建文件');
  // 清理
  fs.rmSync(W + '/增量测试新文件.md');
  await tA.changeLog.push({ fileId: id2, op: 'delete', path: '增量测试新文件.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/home/wang/文档/test1/增量测试新文件.md'), 'B 同步了删除');

  // [3] 重命名
  console.log('[3] 重命名文件');
  const orig2 = 'AIReports/00-Index.md';
  const newName = 'AIReports/00-Index-重命名.md';
  fs.renameSync(W + '/' + orig2, W + '/' + newName);
  const f3 = tA.app.vault.getAbstractFileByPath(newName);
  const id3 = f3 ? await tA.identity.ensureId(f3) : '';
  await tA.changeLog.push({ fileId: id3, op: 'rename', path: newName, oldPath: orig2, type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/home/wang/文档/test1/' + newName), 'B: 新名存在');
  check(!fs.existsSync('/home/wang/文档/test1/' + orig2), 'B: 旧名移除');
  // 还原
  fs.renameSync(W + '/' + newName, W + '/' + orig2);
  await tA.changeLog.push({ fileId: id3, op: 'rename', path: orig2, oldPath: newName, type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();

  await folderTests();
  await folderMoveTest();

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });

// ==== 文件夹增量操作 ====
async function folderTests() {
  const tA = await makeTerminal('/home/wang/文档/test');
  const tB = await makeTerminal('/home/wang/文档/test1');
  const W = '/home/wang/文档/test';

  console.log('\n[4] 文件夹重命名');
  // 建一个临时文件夹
  fs.mkdirSync(W + '/增量测试目录', { recursive: true });
  fs.writeFileSync(W + '/增量测试目录/笔记.md', '# 笔记\n内容\n');
  const f4 = tA.app.vault.getAbstractFileByPath('增量测试目录/笔记.md');
  const id4 = f4 ? await tA.identity.ensureId(f4) : '';
  await tA.changeLog.push({ fileId: id4, op: 'create', path: '增量测试目录/笔记.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/home/wang/文档/test1/增量测试目录/笔记.md'), '基线: B 拉到目录+文件');

  // 重命名文件夹
  fs.renameSync(W + '/增量测试目录', W + '/增量测试目录X');
  await tA.changeLog.push({ fileId: 'dir:增量测试目录X', op: 'rename', path: '增量测试目录X', oldPath: '增量测试目录', type: ModelType.Folder });
  const fMoved = tA.app.vault.getAbstractFileByPath('增量测试目录X/笔记.md');
  const idMoved = fMoved ? await tA.identity.ensureId(fMoved) : '';
  await tA.changeLog.push({ fileId: idMoved, op: 'rename', path: '增量测试目录X/笔记.md', oldPath: '增量测试目录/笔记.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/home/wang/文档/test1/增量测试目录'), 'B: 旧目录移除');
  check(fs.existsSync('/home/wang/文档/test1/增量测试目录X/笔记.md'), 'B: 新目录+文件存在');

  // 清理
  fs.rmSync(W + '/增量测试目录X', { recursive: true });
  await tA.changeLog.push({ fileId: 'dir:增量测试目录X', op: 'delete', path: '增量测试目录X', type: ModelType.Folder });
  await tA.changeLog.push({ fileId: idMoved, op: 'delete', path: '增量测试目录X/笔记.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/home/wang/文档/test1/增量测试目录X'), 'B: 文件夹删除同步');
}

// ==== 文件夹移动（到另一父目录）====
async function folderMoveTest() {
  const tA = await makeTerminal('/home/wang/文档/test');
  const tB = await makeTerminal('/home/wang/文档/test1');
  const W = '/home/wang/文档/test';

  console.log('\n[5] 文件夹移动: 增量测试目录A → 增量测试目录B/增量测试目录A');
  // 建两个目录，A 里有文件
  fs.mkdirSync(W + '/增量测试目录A', { recursive: true });
  fs.mkdirSync(W + '/增量测试目录B', { recursive: true });
  fs.writeFileSync(W + '/增量测试目录A/笔记.md', '# 笔记\n内容\n');
  const f5 = tA.app.vault.getAbstractFileByPath('增量测试目录A/笔记.md');
  const id5 = f5 ? await tA.identity.ensureId(f5) : '';
  await tA.changeLog.push({ fileId: id5, op: 'create', path: '增量测试目录A/笔记.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/home/wang/文档/test1/增量测试目录A/笔记.md'), '基线: B 拉到目录A');

  // 移动目录A → 目录B/A
  fs.renameSync(W + '/增量测试目录A', W + '/增量测试目录B/增量测试目录A');
  // Obsidian 移动文件夹：文件夹 rename + 内部文件 rename
  await tA.changeLog.push({ fileId: 'dir:增量测试目录B/增量测试目录A', op: 'rename', path: '增量测试目录B/增量测试目录A', oldPath: '增量测试目录A', type: ModelType.Folder });
  const fMoved2 = tA.app.vault.getAbstractFileByPath('增量测试目录B/增量测试目录A/笔记.md');
  const idMoved2 = fMoved2 ? await tA.identity.ensureId(fMoved2) : '';
  await tA.changeLog.push({ fileId: idMoved2, op: 'rename', path: '增量测试目录B/增量测试目录A/笔记.md', oldPath: '增量测试目录A/笔记.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/home/wang/文档/test1/增量测试目录A'), 'B: 旧目录移除');
  check(fs.existsSync('/home/wang/文档/test1/增量测试目录B/增量测试目录A/笔记.md'), 'B: 新位置目录+文件存在');

  // 清理
  fs.rmSync(W + '/增量测试目录B', { recursive: true });
  await tA.changeLog.push({ fileId: 'dir:增量测试目录B', op: 'delete', path: '增量测试目录B', type: ModelType.Folder });
  await tA.changeLog.push({ fileId: idMoved2, op: 'delete', path: '增量测试目录B/增量测试目录A/笔记.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/home/wang/文档/test1/增量测试目录B'), 'B: 移动+删除后清理');
}
