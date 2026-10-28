// Reliability regression tests — run fully offline against the in-memory
// MockJoplinServer (no real Joplin Server / credentials needed).
//
// Build+run:
//   npx esbuild test/reliability.test.ts --bundle --platform=node --format=cjs \
//     --alias:obsidian=./test/mock/obsidian.ts --outfile=test/reliability-out.cjs --log-level=error
//   node test/reliability-out.cjs
import * as fs from 'fs';
import { __setRequestHandler } from './mock/obsidian';
import { MockJoplinServer } from './mock/server';
import { MockVault, MockFileManager, MockAdapter } from './mock/vault';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { MappingStore } from '../src/mapping/MappingStore';
import { BaseSnapshotStore } from '../src/core/BaseSnapshotStore';
import { ChangeLogStore } from '../src/core/ChangeLogStore';
import { DeltaPuller } from '../src/core/DeltaPuller';
import { LocalPusher } from '../src/core/LocalPusher';
import { VaultWatcher } from '../src/vault/VaultWatcher';
import { SyncEngine, sha256 } from '../src/core/SyncEngine';
import { ResourceManager } from '../src/resource/ResourceManager';
import { merge3 } from '../src/core/merge3';
import { remoteLooksIncomplete } from '../src/ui/SafetyGuards';
import { redactSecrets } from '../src/core/netUtil';
import { DEFAULT_SETTINGS } from '../src/settings/PluginSettings';
import { EncryptionService } from '../src/e2ee/EncryptionService';
import { FileIdentity } from '../src/core/FileIdentity';
import { ModelType } from '../src/api/models';

let passed = 0, failed = 0;
const check = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); c ? passed++ : failed++; };

const server = new MockJoplinServer();
server.setPageSize(4);
__setRequestHandler((m, u, b) => server.handle(m, u, b));

async function makePlugin(vaultPath: string) {
  fs.rmSync(vaultPath, { recursive: true, force: true });
  fs.mkdirSync(vaultPath + '/.obsidian/plugins/joplin-server-sync', { recursive: true });
  const vault = new MockVault(vaultPath);
  vault.adapter = new MockAdapter();
  const api = new JoplinServerApi(() => ({ baseUrl: 'http://mock', email: 'a', password: 'b' }));
  const plugin: any = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api,
    settings: { ...DEFAULT_SETTINGS, e2eeEnabled: false, e2eePassword: '', confirmDestructiveOps: false },
    manifest: { dir: vaultPath + '/.obsidian/plugins/joplin-server-sync' },
    statusBar: { setSyncing() {}, setProgress() {}, setIdle() {}, setOk() {}, setError() {} },
    logSync() {}, registerEvent(r: any) { return r; },
    e2ee: new EncryptionService(),
  };
  plugin.mapping = new MappingStore(plugin);
  await plugin.mapping.load();
  plugin.baseSnapshots = new BaseSnapshotStore(plugin);
  await plugin.baseSnapshots.load();
  plugin.changeLog = new ChangeLogStore(plugin);
  await plugin.changeLog.load();
  plugin.identity = new FileIdentity(plugin);
  plugin.engine = new SyncEngine(plugin);
  return plugin;
}

async function main() {
  const VAULT = '/tmp/rel-vault';
  const plugin = await makePlugin(VAULT);
  const vault = plugin.app.vault;

  await plugin.engine.ensureRootFolder();
  const puller = new DeltaPuller(plugin, new VaultWatcher(plugin, plugin.changeLog));
  const resources = new ResourceManager(plugin);

  console.log('\n=== 1. remote delete + local edit → local file is kept ===');
  fs.writeFileSync(VAULT + '/note1.md', 'original body');
  const f1 = vault.getAbstractFileByPath('note1.md');
  const id1 = await plugin.identity.ensureId(f1);
  const content1 = await vault.read(f1);
  plugin.mapping.upsert({ joplinId: id1, path: 'note1.md', type: ModelType.Note, localHash: await sha256(content1), remoteUpdatedTime: 1000, syncedAt: Date.now() });
  plugin.baseSnapshots.set(id1, content1);

  // The user edits the file locally…
  await vault.modify(f1, 'edited locally, not yet pushed');
  // …while another client deletes the note on the server.
  await plugin.api.deleteItem(id1 + '.md');

  const r1 = await puller.pullAll();
  check(r1.deleted === 0, 'protected delete: puller did NOT report a local delete');
  check(fs.existsSync(VAULT + '/note1.md'), 'protected delete: note1.md still exists');
  check((await vault.read(f1)).includes('edited locally'), 'protected delete: local edits preserved');
  check(plugin.mapping.getById(id1)?.remoteUpdatedTime === 0, 'protected delete: mapping zeroed so the file is re-uploaded');

  // Next push must re-upload it.
  plugin.changeLog.push({ fileId: id1, op: 'update', path: 'note1.md', type: ModelType.Note });
  const pusher = new LocalPusher(plugin, plugin.changeLog);
  const pr = await pusher.pushAll();
  check(pr.updated === 1 && pr.fail === 0, 'protected delete: file re-uploaded on next push (updated=' + pr.updated + ' fail=' + pr.fail + ')');
  check(await plugin.api.getItem(id1 + '.md') !== null, 'protected delete: server has the note again');

  console.log('\n=== 2. unchanged local file + remote delete → deleted locally ===');
  fs.writeFileSync(VAULT + '/gone.md', 'to be deleted');
  const f2 = vault.getAbstractFileByPath('gone.md');
  const id2 = await plugin.identity.ensureId(f2);
  const c2 = await vault.read(f2);
  plugin.mapping.upsert({ joplinId: id2, path: 'gone.md', type: ModelType.Note, localHash: await sha256(c2), remoteUpdatedTime: 1000, syncedAt: Date.now() });
  plugin.baseSnapshots.set(id2, c2);
  await plugin.api.deleteItem(id2 + '.md');
  const r2 = await puller.pullAll();
  check(r2.deleted === 1, 'unprotected delete applied');
  check(!fs.existsSync(VAULT + '/gone.md'), 'gone.md removed');
  check(plugin.mapping.getById(id2) === undefined, 'mapping entry removed');

  console.log('\n=== 3. blob-only delta (.resource change, meta untouched) → attachment re-downloaded ===');
  fs.mkdirSync(VAULT + '/attachments', { recursive: true });
  fs.writeFileSync(VAULT + '/attachments/pic.png', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  const pf = vault.getAbstractFileByPath('attachments/pic.png');
  await resources.uploadResource(pf);
  const rid = plugin.mapping.getByPath('attachments/pic.png')?.joplinId;
  check(!!rid, 'resource uploaded and mapped');
  // Overwrite ONLY the blob on the server (meta item untouched — this is what
  // a crashed upload or an external client produces).
  const newBytes = new TextEncoder().encode('NEW-BLOB-CONTENT').buffer as ArrayBuffer;
  await plugin.api.putItem('.resource/' + rid, newBytes);
  const r3 = await puller.pullAll();
  const after = Buffer.from(await vault.readBinary(vault.getAbstractFileByPath('attachments/pic.png'))).toString('utf8');
  check(after === 'NEW-BLOB-CONTENT', 'blob-only change re-downloaded (got: ' + JSON.stringify(after) + ')');
  check(r3.fail === 0, 'blob-only pull had no failures');

  console.log('\n=== 4. incomplete-server guard: mapped vault vs emptied server aborts ===');
  for (let i = 0; i < 6; i++) {
    fs.writeFileSync(VAULT + '/bulk' + i + '.md', 'bulk ' + i);
    const bf = vault.getAbstractFileByPath('bulk' + i + '.md');
    const bid = await plugin.identity.ensureId(bf);
    plugin.mapping.upsert({ joplinId: bid, path: 'bulk' + i + '.md', type: ModelType.Note, localHash: 'h' + i, remoteUpdatedTime: 100, syncedAt: Date.now() });
  }
  const emptyServer = new MockJoplinServer();
  __setRequestHandler((m, u, b) => emptyServer.handle(m, u, b));
  let aborted = false;
  try {
    await plugin.engine.forcePullInner();
  } catch (e) {
    aborted = /incomplete/.test(e instanceof Error ? e.message : String(e));
  }
  check(aborted, 'forcePullInner aborted with "incomplete" error');
  check(fs.existsSync(VAULT + '/bulk0.md'), 'guard tripped BEFORE local wipe: bulk0.md still exists');
  check(fs.existsSync(VAULT + '/note1.md'), 'guard tripped BEFORE local wipe: note1.md still exists');
  __setRequestHandler((m, u, b) => server.handle(m, u, b));

  console.log('\n=== 5. changelog durability: coalesced writes survive flush+reload ===');
  const p2 = await makePlugin('/tmp/rel-vault2');
  p2.changeLog.push({ fileId: 'f1', op: 'create', path: 'a.md', type: ModelType.Note });
  p2.changeLog.push({ fileId: 'f1', op: 'update', path: 'a.md', type: ModelType.Note }); // coalesce
  p2.changeLog.push({ fileId: 'f2', op: 'delete', path: 'b.md', type: ModelType.Note });
  await p2.changeLog.flush();
  // Same adapter → emulates a reload of the persisted file.
  const store2 = new ChangeLogStore(p2);
  await store2.load();
  check(store2.pending().length === 2, 'reload keeps both pending entries (got ' + store2.pending().length + ')');
  check(store2.pending().some(e => e.fileId === 'f1' && e.op === 'create' && e.path === 'a.md'),
    'create+update coalesced, keeping the create op with latest content');

  console.log('\n=== 6. delete+recreate coalesces to update (not delete) ===');
  store2.push({ fileId: 'f2', op: 'create', path: 'b.md', type: ModelType.Note });
  const f2entry = store2.pending().find(e => e.fileId === 'f2');
  check(f2entry?.op === 'update', 'delete+create → update (got ' + f2entry?.op + ')');

  console.log('\n=== 7. three-way merge: non-overlapping edits merge, overlapping conflict ===');
  check(merge3('a\nb\nc', 'A\nb\nc', 'a\nb\nC') === 'A\nb\nC', 'disjoint line edits merged');
  check(merge3('a\nb\nc', 'a\nX\nb\nc', 'a\nb\nc\nY') === 'a\nX\nb\nc\nY', 'insertions on both sides merged');
  check(merge3('a\nb\nc', 'a\nX\nc', 'a\nY\nc') === null, 'same-region edits conflict');
  check(merge3('a\nb\nc', 'a\nb\nc', 'a\nb\nc') === 'a\nb\nc', 'no changes → unchanged');
  check(merge3('1\n2\n3', '1\n2\n3\n4\n5', '1\n2\n3') === '1\n2\n3\n4\n5', 'pure local addition');
  check(merge3('x\ny', 'x\ny', 'z\ny') === 'z\ny', 'remote-only change wins cleanly');

  console.log('\n=== 8. incomplete-server heuristic ===');
  check(remoteLooksIncomplete(100, 3) === true, '100 mapped / 3 remote → incomplete');
  check(remoteLooksIncomplete(100, 60) === false, '100 mapped / 60 remote → plausible');
  check(remoteLooksIncomplete(3, 0) === false, 'tiny vault → never trips');
  check(remoteLooksIncomplete(0, 0) === false, 'fresh vault → never trips');

  console.log('\n=== 9. secret redaction ===');
  check(redactSecrets('{"password":"hunter2","email":"a@b.c"}') === '{"password":"***","email":"a@b.c"}', 'password field redacted');
  check(redactSecrets('X-API-AUTH: deadbeef01') === 'X-API-AUTH: ***', 'auth header redacted');
  check(!redactSecrets('Bearer abcdef123456').includes('abcdef123456'), 'bearer token redacted');

  console.log('\n=== 10. base snapshot store ===');
  plugin.baseSnapshots.set('snap-test', 'body one');
  check(plugin.baseSnapshots.get('snap-test') === 'body one', 'snapshot get/set');
  plugin.baseSnapshots.set('snap-big', 'x'.repeat(600 * 1024)); // > MAX_BODY_BYTES
  check(plugin.baseSnapshots.get('snap-big') === null, 'oversized body refused');
  await plugin.baseSnapshots.flush();
  check(plugin.baseSnapshots.size >= 1, 'snapshot store still live after flush');

  console.log('\n=== 结果: ' + passed + ' PASS, ' + failed + ' FAIL ===');
  fs.rmSync('/tmp/rel-vault', { recursive: true, force: true });
  fs.rmSync('/tmp/rel-vault2', { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
