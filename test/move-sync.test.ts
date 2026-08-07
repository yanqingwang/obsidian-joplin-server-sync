// 文件移动/重命名同步验证
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

async function main() {
  console.log('\n=== 文件移动/重命名同步验证 ===\n');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mv-a');
  const tB = await makeTerminal('/tmp/mv-b');

  // 基线：文件夹A/文件A.md
  fs.mkdirSync('/tmp/mv-a/文件夹A', { recursive: true });
  fs.writeFileSync('/tmp/mv-a/文件夹A/文件A.md', '# 文件A\nA内容\n');
  const fA = tA.app.vault.getAbstractFileByPath('文件夹A/文件A.md');
  const idA = await tA.identity.ensureId(fA);
  await tA.changeLog.push({ fileId: idA, op: 'create', path: '文件夹A/文件A.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/tmp/mv-b/文件夹A/文件A.md'), '基线: B 拉到文件A');

  // ---- 移动文件A: 文件夹A → 文件夹B ----
  console.log('\n[移动文件: 文件夹A/文件A.md → 文件夹B/文件A.md]');
  fs.mkdirSync('/tmp/mv-a/文件夹B', { recursive: true });
  fs.renameSync('/tmp/mv-a/文件夹A/文件A.md', '/tmp/mv-a/文件夹B/文件A.md');
  // 模拟 watcher rename 事件
  const fMoved = tA.app.vault.getAbstractFileByPath('文件夹B/文件A.md');
  const idMoved = await tA.identity.ensureId(fMoved);
  check(idMoved === idA, '移动后 fileId 不变 (' + idMoved.slice(0,8) + ')');
  await tA.changeLog.push({ fileId: idMoved, op: 'rename', path: '文件夹B/文件A.md', oldPath: '文件夹A/文件A.md', type: ModelType.Note });
  console.log('  A pending:', JSON.stringify(tA.changeLog.pending()));
  const pushMove = await new LocalPusher(tA, tA.changeLog).pushAll();
  console.log('  A push:', JSON.stringify(pushMove));

  // B 拉取
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(!fs.existsSync('/tmp/mv-b/文件夹A/文件A.md'), 'B: 旧路径文件已移除');
  check(fs.existsSync('/tmp/mv-b/文件夹B/文件A.md'), 'B: 新路径文件存在');
  if (fs.existsSync('/tmp/mv-b/文件夹B/文件A.md')) {
    const c = fs.readFileSync('/tmp/mv-b/文件夹B/文件A.md', 'utf8');
    check(c.includes('A内容'), 'B: 移动后内容正确');
  }

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/mv-a', { recursive: true, force: true });
  fs.rmSync('/tmp/mv-b', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
