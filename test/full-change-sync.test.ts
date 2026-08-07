// 完整变更类型同步验证：文件/文件夹的 修改、重命名、删除、移动
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

async function cleanServer() {
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

async function baseSetup(tA: any, tB: any, files: Record<string, string>) {
  // tA: 创建文件并推送
  for (const [p, content] of Object.entries(files)) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    if (dir) fs.mkdirSync('/tmp/mv-a/' + dir, { recursive: true });
    fs.writeFileSync('/tmp/mv-a/' + p, content);
    const f = tA.app.vault.getAbstractFileByPath(p);
    const id = await tA.identity.ensureId(f);
    await tA.changeLog.push({ fileId: id, op: 'create', path: p, type: ModelType.Note });
  }
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
}

async function pushAndPull(tA: any, tB: any, desc: string) {
  const stats = await new LocalPusher(tA, tA.changeLog).pushAll();
  console.log('  push:', JSON.stringify(stats));
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  void desc;
}

async function main() {
  console.log('\n=== 完整变更类型同步验证 ===\n');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mv-a');
  const tB = await makeTerminal('/tmp/mv-b');

  console.log('[基线] 文件夹A/文件A.md + 文件夹A/文件B.md');
  await baseSetup(tA, tB, {
    '文件夹A/文件A.md': '# 文件A\nA内容\n',
    '文件夹A/文件B.md': '# 文件B\nB内容\n',
  });
  check(fs.existsSync('/tmp/mv-b/文件夹A/文件A.md') && fs.existsSync('/tmp/mv-b/文件夹A/文件B.md'), '基线建立');

  console.log('\n[1] 修改内容: 文件A.md 内容变更');
  const fA = tA.app.vault.getAbstractFileByPath('文件夹A/文件A.md');
  const idA = await tA.identity.ensureId(fA);
  fs.writeFileSync('/tmp/mv-a/文件夹A/文件A.md', '# 文件A\nA内容已修改\n');
  await tA.changeLog.push({ fileId: idA, op: 'update', path: '文件夹A/文件A.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '修改内容');
  check(fs.readFileSync('/tmp/mv-b/文件夹A/文件A.md', 'utf8').includes('A内容已修改'), 'B 同步了修改');

  console.log('\n[2] 重命名: 文件B.md → 文件B-改名.md');
  const fB = tA.app.vault.getAbstractFileByPath('文件夹A/文件B.md');
  const idB = await tA.identity.ensureId(fB);
  fs.renameSync('/tmp/mv-a/文件夹A/文件B.md', '/tmp/mv-a/文件夹A/文件B-改名.md');
  await tA.changeLog.push({ fileId: idB, op: 'rename', path: '文件夹A/文件B-改名.md', oldPath: '文件夹A/文件B.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '重命名');
  check(!fs.existsSync('/tmp/mv-b/文件夹A/文件B.md'), 'B: 旧名移除');
  check(fs.existsSync('/tmp/mv-b/文件夹A/文件B-改名.md'), 'B: 新名存在');

  console.log('\n[3] 删除: 文件A.md 删除');
  fs.rmSync('/tmp/mv-a/文件夹A/文件A.md');
  await tA.changeLog.push({ fileId: idA, op: 'delete', path: '文件夹A/文件A.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '删除');
  check(!fs.existsSync('/tmp/mv-b/文件夹A/文件A.md'), 'B: 删除同步');

  console.log('\n[4] 移动: 文件B-改名.md → 文件夹A/子目录/文件B-改名.md');
  const fMoved = tA.app.vault.getAbstractFileByPath('文件夹A/文件B-改名.md');
  const idMoved = await tA.identity.ensureId(fMoved);
  fs.mkdirSync('/tmp/mv-a/文件夹A/子目录', { recursive: true });
  fs.renameSync('/tmp/mv-a/文件夹A/文件B-改名.md', '/tmp/mv-a/文件夹A/子目录/文件B-改名.md');
  await tA.changeLog.push({ fileId: idMoved, op: 'rename', path: '文件夹A/子目录/文件B-改名.md', oldPath: '文件夹A/文件B-改名.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '移动');
  check(!fs.existsSync('/tmp/mv-b/文件夹A/文件B-改名.md'), 'B: 旧位置移除');
  check(fs.existsSync('/tmp/mv-b/文件夹A/子目录/文件B-改名.md'), 'B: 新位置存在');

  // ==== 文件夹操作 ====
  console.log('\n[5] 文件夹重命名: 文件夹A → 文件夹X');
  const dirA = '/tmp/mv-a/文件夹A';
  fs.renameSync(dirA, '/tmp/mv-a/文件夹X');
  // Obsidian 移动文件夹会触发文件夹+内部文件 rename；这里模拟文件夹 rename + 内部文件 rename
  await tA.changeLog.push({ fileId: 'dir:文件夹X', op: 'rename', path: '文件夹X', oldPath: '文件夹A', type: ModelType.Folder });
  const fChild = tA.app.vault.getAbstractFileByPath('文件夹X/子目录/文件B-改名.md');
  const idChild = fChild ? await tA.identity.ensureId(fChild) : idMoved;
  await tA.changeLog.push({ fileId: idChild, op: 'rename', path: '文件夹X/子目录/文件B-改名.md', oldPath: '文件夹A/子目录/文件B-改名.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '文件夹重命名');
  check(!fs.existsSync('/tmp/mv-b/文件夹A'), 'B: 旧文件夹移除');
  check(fs.existsSync('/tmp/mv-b/文件夹X/子目录/文件B-改名.md'), 'B: 新文件夹+文件存在');

  console.log('\n[6] 文件夹删除: 文件夹X 删除');
  const fB2 = tA.app.vault.getAbstractFileByPath('文件夹X/子目录/文件B-改名.md');
  const idB2 = fB2 ? await tA.identity.ensureId(fB2) : idMoved;
  fs.rmSync('/tmp/mv-a/文件夹X', { recursive: true });
  // Obsidian 删除文件夹触发：文件夹 delete + 内部文件 delete
  await tA.changeLog.push({ fileId: 'dir:文件夹X', op: 'delete', path: '文件夹X', type: ModelType.Folder });
  await tA.changeLog.push({ fileId: idB2, op: 'delete', path: '文件夹X/子目录/文件B-改名.md', type: ModelType.Note });
  await pushAndPull(tA, tB, '文件夹删除');
  check(!fs.existsSync('/tmp/mv-b/文件夹X'), 'B: 文件夹及内容删除');

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/mv-a', { recursive: true, force: true });
  fs.rmSync('/tmp/mv-b', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
