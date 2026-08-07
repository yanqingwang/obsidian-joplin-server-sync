// 验证6: E2EE 模式增量变更同步（真实 test → test1，加密+解密往返）
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
  console.log('\n=== E2EE 模式增量变更同步 (test → test1) ===\n');
  const tA = await makeTerminal('/home/wang/文档/test');
  const tB = await makeTerminal('/home/wang/文档/test1');
  const W = '/home/wang/文档/test';

  // 确认 E2EE 配置
  check(tA.settings.e2eeEnabled === true && !!tA.settings.e2eePassword, 'test: E2EE 开启 + 密码');
  check(tB.settings.e2eeEnabled === true && !!tB.settings.e2eePassword, 'test1: E2EE 开启 + 密码');

  // 修改一个现有文件
  const target = 'AIReports/2026年AI发展深度分析报告.md';
  const orig = fs.readFileSync(W + '/' + target, 'utf8');
  const marker = '\n\n<!-- E2EE增量测试 -->\n';
  fs.writeFileSync(W + '/' + target, orig + marker);
  const f = tA.app.vault.getAbstractFileByPath(target);
  const id = f ? await tA.identity.ensureId(f) : '';
  await tA.changeLog.push({ fileId: id, op: 'update', path: target, type: ModelType.Note });
  await tA.api.login();
  await tA.engine.enableE2EE();
  const push = await new LocalPusher(tA, tA.changeLog).pushAll();
  console.log('  push:', JSON.stringify(push));
  await tB.api.login();
  await tB.engine.enableE2EE();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();
  const bContent = fs.readFileSync('/home/wang/文档/test1/' + target, 'utf8');
  check(bContent.includes('E2EE增量测试'), 'B 解密后同步了 E2EE 加密修改');

  // 服务器验证：存储的是密文
  const raw = await tA.api.getItem((tA.mapping.getByPath(target)?.joplinId ?? '') + '.md');
  check(!!raw && !raw.includes('E2EE增量测试'), '服务器存储的是密文（无明文泄漏）');

  // 还原
  fs.writeFileSync(W + '/' + target, orig);
  const f2 = tA.app.vault.getAbstractFileByPath(target);
  const id2 = f2 ? await tA.identity.ensureId(f2) : '';
  await tA.changeLog.push({ fileId: id2, op: 'update', path: target, type: ModelType.Note });
  await new LocalPusher(tA, tA.changeLog).pushAll();
  await new DeltaPuller(tB, new VaultWatcher(tB, tB.changeLog)).pullAll();

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
