// Verify the refactored DeltaPuller.pullAll() (parallel downloads + parallel
// delete verification) against the in-memory mock server, exercising the REAL
// sync path the user hits:
//   1. push a large source vault
//   2. first syncCycle on dst -> InitialSync seeds the mapping (root + folders)
//   3. add new notes on src and re-push (appends delta entries)
//   4. second syncCycle on dst -> incremental delta PULL (the refactored path)
// Then assert src and dst trees are byte-for-byte equal (.md + resource).
import * as fs from 'fs';
import * as path from 'path';
import { __setRequestHandler } from './mock/obsidian';
import { MockJoplinServer } from './mock/server';
import { MockVault, MockFileManager } from './mock/vault';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { JoplinSerializer } from '../src/convert/JoplinSerializer';
import { MappingStore } from '../src/mapping/MappingStore';
import { SyncEngine } from '../src/core/SyncEngine';
import { ChangeLogStore } from '../src/core/ChangeLogStore';
import { VaultWatcher } from '../src/vault/VaultWatcher';
import { FileIdentity, stampFrontmatter } from '../src/core/FileIdentity';
import { createJoplinId } from '../src/mapping/IdGenerator';
import { DEFAULT_SETTINGS } from '../src/settings/PluginSettings';

const server = new MockJoplinServer();
server.setPageSize(3); // small page to stress delta pagination
__setRequestHandler((m, u, b) => server.handle(m, u, b));

function makePlugin(vaultRoot: string) {
  const vault = new MockVault(vaultRoot);
  // Both terminals must report the SAME vault name so the server's
  // `_vault_<name>` root matches between push and pull (the mock has no real
  // per-vault account isolation; in production the server account is shared).
  vault.getName = () => 'shared';
  const api = new JoplinServerApi(() => ({ baseUrl: 'http://mock', email: 'a@b.c', password: 'x' }));
  const plugin: any = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api, settings: { ...DEFAULT_SETTINGS },
    manifest: { dir: path.join(vaultRoot, '.obsidian/plugins/joplin-server-sync') },
    statusBar: { setSyncing(){}, setProgress(){}, setIdle(){}, setOk(){}, setError(){} },
    logSync(){}, registerEvent(r: any){ return r; },
    e2ee: { feedMasterKey(){}, isEncrypted(){ return false; }, decryptItem(){ return null; }, activeKeyId: undefined, firstLoadedKeyId: undefined, availableMasterKeys: [] },
  };
  plugin.mapping = new MappingStore(plugin);
  plugin.changeLog = new ChangeLogStore(plugin);
  plugin.identity = new FileIdentity(plugin);
  plugin.engine = undefined;
  return plugin;
}

function walkMd(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (e.isDirectory()) rec(full);
      else if (rel.endsWith('.md')) out.set(rel, fs.readFileSync(full, 'utf8'));
    }
  };
  rec(root);
  return out;
}

function setEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (a.get(k) !== b.get(k)) return false;
  return true;
}

async function main() {
  const base = path.join(__dirname, 'fixtures-dp');
  const srcDir = path.join(base, 'src');
  const dstDir = path.join(base, 'dst');
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(srcDir, { recursive: true });

  // Build a representative large source vault: nested folders + many notes + 1 attachment.
  const N = 150;
  for (let i = 0; i < N; i++) {
    const folder = 'Folder' + (i % 10) + '/Sub' + (i % 5);
    const p = path.join(srcDir, folder, 'note-' + i + '.md');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'Body of note ' + i + ' — 内容测试 ' + i + '\n');
  }
  fs.writeFileSync(path.join(srcDir, 'with-attachment.md'), 'see ![[pic.png]] here\n');
  fs.mkdirSync(path.join(srcDir, 'attachments'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'attachments/pic.png'), 'PNGDATA-bytes');

  const srcPlugin = makePlugin(srcDir);
  await srcPlugin.mapping.load();
  await srcPlugin.changeLog.load();
  const enginePush = new SyncEngine(srcPlugin);
  srcPlugin.engine = enginePush;
  console.log('src markdown files reported by vault:', srcPlugin.app.vault.getMarkdownFiles().length);

  console.log('=== FORCE PUSH (src -> server, ' + N + ' notes + 1 resource) ===');
  await enginePush.forcePush();
  await srcPlugin.mapping.flush();
  console.log('server items after push:', server.snapshot().length);

  // Fresh destination vault; drive it via the real syncCycle flow.
  fs.mkdirSync(dstDir, { recursive: true });
  const dstPlugin = makePlugin(dstDir);
  await dstPlugin.mapping.load();
  await dstPlugin.changeLog.load();
  const enginePull = new SyncEngine(dstPlugin);
  dstPlugin.engine = enginePull;

  console.log('=== SYNC CYCLE 1 (dst): initial sync seeds mapping via forcePull ===');
  await enginePull.syncCycle();
  await dstPlugin.mapping.flush();

  let src = walkMd(srcDir);
  let dst = walkMd(dstDir);
  const consistentInit = setEqual(src, dst);
  console.log('after cycle 1 — src .md:', src.size, ' dst .md:', dst.size,
    ' resource present:', fs.existsSync(path.join(dstDir, 'attachments/pic.png')),
    ' consistent:', consistentInit);

  // ---- Incremental change: append NEW notes directly to the server (appends
  //      delta entries) WITHOUT a forcePush cleanup that would recreate the
  //      root folder. We mirror the chosen parent folder's path on disk so the
  //      two trees stay comparable. ----
  const NEW = 60;
  // Pick an existing folder on the server as the parent for the new notes.
  const parentMap = [...dstPlugin.mapping.all().values()].find(
    e => e.type === 2 /* Folder */ && e.path !== '' && e.path !== 'attachments/',
  );
  const parentId = parentMap!.joplinId;
  const parentPath = parentMap!.path; // e.g. "Folder0/"
  for (let i = 0; i < NEW; i++) {
    const id = createJoplinId();
    const rel = parentPath + 'note-new-' + i + '.md';
    const diskPath = path.join(srcDir, rel);
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, stampFrontmatter('Incremental note ' + i + ' added later\n', id));
    const item = {
      id, parent_id: parentId, title: 'note-new-' + i, body: 'Incremental note ' + i + ' added later\n',
      created_time: Date.now(), updated_time: Date.now(),
      user_created_time: Date.now(), user_updated_time: Date.now(),
      type_: 1, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    };
    await srcPlugin.api.putItem(id + '.md', new JoplinSerializer().serialize(item as any));
  }
  console.log('=== Appended ' + NEW + ' new notes to server (delta) ===');

  console.log('=== SYNC CYCLE 2 (dst): incremental DELTA PULL (refactored path) ===');
  const t0 = Date.now();
  await enginePull.syncCycle();
  console.log('cycle 2 pull done in', (Date.now() - t0) + 'ms');
  await dstPlugin.mapping.flush();

  src = walkMd(srcDir);
  dst = walkMd(dstDir);
  const missing: string[] = [];
  for (const k of src.keys()) if (!dst.has(k)) missing.push(k);
  const extra: string[] = [];
  for (const k of dst.keys()) if (!src.has(k)) extra.push(k);
  const diff: string[] = [];
  for (const k of src.keys()) if (dst.has(k) && src.get(k) !== dst.get(k)) diff.push(k);

  console.log('\nafter cycle 2 — src .md:', src.size, ' dst .md:', dst.size);
  console.log('MISSING in dst:', missing.slice(0, 5), missing.length > 5 ? '...(' + missing.length + ')' : '');
  console.log('EXTRA in dst  :', extra.slice(0, 5), extra.length > 5 ? '...(' + extra.length + ')' : '');
  console.log('CONTENT DIFF  :', diff.slice(0, 5), diff.length > 5 ? '...(' + diff.length + ')' : '');
  const resPulled = fs.existsSync(path.join(dstDir, 'attachments/pic.png'));
  console.log('attachment present in dst:', resPulled);

  const incrementalOk = missing.length === 0 && extra.length === 0 && diff.length === 0 && resPulled;

  // ---- Delete path: remove some notes on server (appends delete deltas) and
  //      on local src disk, then pull — exercises parallel delete verification
  //      + local removal (applyDeleteLocal). ----
  const DEL = 10;
  const toDelete = [...src.keys()].filter(k => k.includes('note-new-')).slice(0, DEL);
  for (const k of toDelete) {
    const mid = dstPlugin.mapping.getByPath(k)?.joplinId;
    if (mid) await srcPlugin.api.deleteItem(mid + '.md');   // appends delete delta
    fs.rmSync(path.join(srcDir, k), { force: true });        // keep src comparable
  }
  console.log('=== Appended ' + toDelete.length + ' deletes to server (delta) ===');
  console.log('=== SYNC CYCLE 3 (dst): incremental DELTA PULL with deletes ===');
  await enginePull.syncCycle();
  await dstPlugin.mapping.flush();

  src = walkMd(srcDir);
  dst = walkMd(dstDir);
  const missing3: string[] = [];
  for (const k of src.keys()) if (!dst.has(k)) missing3.push(k);
  const extra3: string[] = [];
  for (const k of dst.keys()) if (!src.has(k)) extra3.push(k);
  const diff3: string[] = [];
  for (const k of src.keys()) if (dst.has(k) && src.get(k) !== dst.get(k)) diff3.push(k);
  console.log('after cycle 3 — src .md:', src.size, ' dst .md:', dst.size);
  console.log('MISSING in dst:', missing3.length, ' EXTRA in dst:', extra3.length, ' CONTENT DIFF:', diff3.length);
  const deleteOk = missing3.length === 0 && extra3.length === 0 && diff3.length === 0;

  const ok = consistentInit && incrementalOk && deleteOk;
  console.log('\nRESULT:', ok ? 'CONSISTENT ✅' : 'INCONSISTENT ❌');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
