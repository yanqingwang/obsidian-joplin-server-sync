// 验证3: 同一文件多次变更叠加 → 最终同步状态正确
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
  console.log('\n=== 同一文件多次变更叠加同步 ===\n');
  await cleanServer();
  const tA = await makeTerminal('/tmp/mc-a');
  const tB = await makeTerminal('/tmp/mc-b');
  const W = '/tmp/mc-a';

  // 基线
  fs.writeFileSync(W + '/原始文件.md', 'v1');
  const f0 = tA.app.vault.getAbstractFileByPath('原始文件.md');
  const id0 = f0 ? await tA.identity.ensureId(f0) : '';
  await tA.changeLog.push({ fileId: id0, op: 'create', path: '原始文件.md', type: ModelType.Note });
  await tA.api.login();
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await tB.api.login();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/tmp/mc-b/原始文件.md'), '基线建立');

  // 变更序列：改内容(v2) → 改名 → 改内容(v3) → 移动 → 改内容(v4)
  // 每步都 push+pull，验证最终状态正确
  console.log('[步骤1] 修改内容 v2');
  fs.writeFileSync(W + '/原始文件.md', 'v2');
  const f1 = tA.app.vault.getAbstractFileByPath('原始文件.md');
  const id1 = f1 ? await tA.identity.ensureId(f1) : '';
  await tA.changeLog.push({ fileId: id1, op: 'update', path: '原始文件.md', type: ModelType.Note });
  console.log('  A pending:', JSON.stringify(tA.changeLog.pending().map((e:any)=>e.op+':'+e.path)));
  const s1 = await new LocalPusher(tA, tA.changeLog).pushAll();
  console.log('  A push s1:', JSON.stringify(s1));
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  const bV2 = fs.existsSync('/tmp/mc-b/原始文件.md') ? fs.readFileSync('/tmp/mc-b/原始文件.md', 'utf8') : '(不存在)';
  console.log('  B 内容(期望 v2):', JSON.stringify(bV2));
  check(bV2.includes('v2'), 'B: 内容 v2');

  console.log('[步骤2] 改名 → 新文件.md');
  fs.renameSync(W + '/原始文件.md', W + '/新文件.md');
  const f2 = tA.app.vault.getAbstractFileByPath('新文件.md');
  const id2 = f2 ? await tA.identity.ensureId(f2) : '';
  await tA.changeLog.push({ fileId: id2, op: 'rename', path: '新文件.md', oldPath: '原始文件.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/tmp/mc-b/新文件.md') && !fs.existsSync('/tmp/mc-b/原始文件.md'), 'B: 新名存在旧名移除');

  console.log('[步骤3] 改内容 v3');
  fs.writeFileSync(W + '/新文件.md', 'v3');
  const f3 = tA.app.vault.getAbstractFileByPath('新文件.md');
  const id3 = f3 ? await tA.identity.ensureId(f3) : '';
  await tA.changeLog.push({ fileId: id3, op: 'update', path: '新文件.md', type: ModelType.Note });
  const s3 = await new LocalPusher(tA, tA.changeLog).pushAll();
  console.log('  A push s3:', JSON.stringify(s3));
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.readFileSync('/tmp/mc-b/新文件.md', 'utf8').includes('v3'), 'B: 内容 v3');

  console.log('[步骤4] 移动到子目录');
  fs.mkdirSync(W + '/子目录', { recursive: true });
  fs.renameSync(W + '/新文件.md', W + '/子目录/新文件.md');
  const f4 = tA.app.vault.getAbstractFileByPath('子目录/新文件.md');
  const id4 = f4 ? await tA.identity.ensureId(f4) : '';
  await tA.changeLog.push({ fileId: id4, op: 'rename', path: '子目录/新文件.md', oldPath: '新文件.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.existsSync('/tmp/mc-b/子目录/新文件.md') && !fs.existsSync('/tmp/mc-b/新文件.md'), 'B: 已移动到子目录');

  console.log('[步骤5] 改内容 v4 (最终)');
  fs.writeFileSync(W + '/子目录/新文件.md', 'v4');
  const f5 = tA.app.vault.getAbstractFileByPath('子目录/新文件.md');
  const id5 = f5 ? await tA.identity.ensureId(f5) : '';
  await tA.changeLog.push({ fileId: id5, op: 'update', path: '子目录/新文件.md', type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  check(fs.readFileSync('/tmp/mc-b/子目录/新文件.md', 'utf8').includes('v4'), 'B: 最终内容 v4');
  check(id0 === id5, 'fileId 全程稳定 (' + id5.slice(0,8) + ')');

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/mc-a', { recursive: true, force: true });
  fs.rmSync('/tmp/mc-b', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
