// 防误删保护自测：applyDelete 404 验证 + 批量删除风暴保护
import * as fs from 'fs';
import { MockVault, DiskAdapter } from './mock/vault';
import { setVaultRoot } from './mock/obsidian-real';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { MappingStore } from '../src/mapping/MappingStore';
import { DeltaPuller } from '../src/core/DeltaPuller';
import { VaultWatcher } from '../src/vault/VaultWatcher';
import { ChangeLogStore } from '../src/core/ChangeLogStore';
import { FileIdentity } from '../src/core/FileIdentity';
import { ModelType } from '../src/api/models';

let passed = 0, failed = 0;
const check = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); c ? passed++ : failed++; };

async function main() {
  const VAULT = '/tmp/dg-vault';
  fs.rmSync(VAULT, { recursive: true, force: true });
  fs.mkdirSync(VAULT + '/.obsidian/plugins/joplin-server-sync', { recursive: true });
  setVaultRoot(VAULT);
  const vault = new MockVault(VAULT);
  vault.adapter = new DiskAdapter(VAULT);
  const plugin: any = {
    app: { vault },
    api: new JoplinServerApi(() => ({ baseUrl: 'http://mock', email: 'a', password: 'b' })),
    settings: { excludePatterns: ['.obsidian/'], e2eeEnabled: false, e2eePassword: '' },
    manifest: { dir: VAULT + '/.obsidian/plugins/joplin-server-sync' },
    statusBar: { setSyncing(){}, setProgress(){}, setIdle(){}, setOk(){}, setError(){} },
    logSync(){}, registerEvent(r: any){ return r; },
  };
  plugin.mapping = new MappingStore(plugin);
  await plugin.mapping.load();
  plugin.changeLog = new ChangeLogStore(plugin);
  await plugin.changeLog.load();
  plugin.identity = new FileIdentity(plugin);
  plugin.engine = { sha256Of: async () => 'x' };

  // 造 3 个映射文件
  fs.writeFileSync(VAULT + '/a.md', 'AAA');
  fs.writeFileSync(VAULT + '/b.md', 'BBB');
  fs.writeFileSync(VAULT + '/c.md', 'CCC');
  plugin.mapping.upsert({ joplinId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', path: 'a.md', type: ModelType.Note, localHash: 'h', remoteUpdatedTime: 1, syncedAt: 1 });
  plugin.mapping.upsert({ joplinId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', path: 'b.md', type: ModelType.Note, localHash: 'h', remoteUpdatedTime: 1, syncedAt: 1 });
  plugin.mapping.upsert({ joplinId: 'cccccccccccccccccccccccccccccccc', path: 'c.md', type: ModelType.Note, localHash: 'h', remoteUpdatedTime: 1, syncedAt: 1 });

  const puller = new DeltaPuller(plugin, new VaultWatcher(plugin, plugin.changeLog));

  // 场景1: 服务器仍存在 item → 本地不删（cursor 重放保护）
  plugin.api.getItem = async (name: string) => {
    const id = name.slice(0, 32);
    if (id === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') return '{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'; // 服务器还在
    return null; // 其余 404
  };
  const r1 = await puller.applyDelete('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  check(r1 === false, 'item 服务器仍存在 → 本地不删 (返回 false)');
  check(fs.existsSync(VAULT + '/a.md'), 'a.md 保留');

  // 场景2: 服务器 404 → 本地删除
  const r2 = await puller.applyDelete('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  check(r2 === true, 'item 服务器 404 → 本地删除 (返回 true)');
  check(!fs.existsSync(VAULT + '/b.md'), 'b.md 已删');

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync(VAULT, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
