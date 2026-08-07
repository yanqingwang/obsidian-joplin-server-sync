// 恢复: forcePush 测试清空服务器后, 用 test 恢复服务器 + test1 恢复本地
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
  console.log('\n=== 恢复: test forcePush → 服务器, test1 forcePull → 本地 ===\n');
  const tA = await makeTerminal('/home/wang/文档/test');
  check(tA.settings.e2eeEnabled === true && !!tA.settings.e2eePassword, 'test: E2EE 开启 + 密码');

  // 1. test forcePush 恢复服务器 (清空残留 + 上传全部)
  await tA.api.login();
  await tA.engine.enableE2EE();
  await tA.engine.forcePush();
  console.log('  forcePush done');

  // 等待限流恢复
  console.log('  等待 60s 避开限流...');
  await new Promise(r => setTimeout(r, 60000));

  // 2. test1 forcePull 恢复本地
  const tB = await makeTerminal('/home/wang/文档/test1');
  check(tB.settings.e2eeEnabled === true && !!tB.settings.e2eePassword, 'test1: E2EE 开启 + 密码');
  await tB.api.login();
  await tB.engine.enableE2EE();
  await tB.engine.forcePull();
  console.log('  forcePull done');

  // 3. 验证 test1 文件数
  const md1 = countMd('/home/wang/文档/test1');
  const md0 = countMd('/home/wang/文档/test');
  console.log(`  test md: ${md0}, test1 md: ${md1}`);
  check(md1 === md0, `test1 文件数 = test (${md1} === ${md0})`);

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  process.exit(failed ? 1 : 0);
}
function countMd(dir: string): number {
  let n = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'home') continue;
      const p = d + '/' + e.name;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) n++;
    }
  };
  walk(dir);
  return n;
}
main().catch(e => { console.error(e); process.exit(2); });
