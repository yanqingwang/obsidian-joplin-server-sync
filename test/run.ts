import * as fs from 'fs';
import * as path from 'path';
import { __setRequestHandler } from './mock/obsidian';
import { MockJoplinServer } from './mock/server';
import { MockVault, MockFileManager } from './mock/vault';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { MappingStore } from '../src/mapping/MappingStore';
import { SyncEngine } from '../src/core/SyncEngine';
import { DEFAULT_SETTINGS } from '../src/settings/PluginSettings';

const server = new MockJoplinServer();
server.setPageSize(3); // small page to stress pagination
__setRequestHandler((m, u, b) => server.handle(m, u, b));

function makePlugin(vaultRoot: string) {
  const vault = new MockVault(vaultRoot);
  const api = new JoplinServerApi(() => ({
    baseUrl: 'http://mock', email: 'a@b.c', password: 'x',
  }));
  const plugin: any = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api,
    settings: { ...DEFAULT_SETTINGS },
    manifest: { dir: '/plugin-data' },
    statusBar: { setSyncing(){}, setProgress(){}, setIdle(){}, setOk(){}, setError(){} },
    logSync(){},
    e2ee: { feedMasterKey(){}, isEncrypted(){ return false; }, decryptItem(){ return null; } },
  };
  plugin.mapping = new MappingStore(plugin);
  return plugin;
}

function walkAll(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const rec = (dir: string) => {
    let ents: fs.Dirent[];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (e.isDirectory()) rec(full);
      else out.set(rel, fs.readFileSync(full, 'utf8'));
    }
  };
  rec(root);
  return out;
}

async function main() {
  const base = path.join(__dirname, 'fixtures');
  const srcDir = path.join(base, 'src');
  const dstDir = path.join(base, 'dst');
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(srcDir, { recursive: true });

  // ---- build a representative source vault ----
  const files: Record<string, string> = {
    'Welcome.md': 'hello world\n',                       // trailing newline
    'no-newline.md': 'no trailing newline',               // no trailing newline
    '投资最重要的事.md': '中文内容测试\n',                  // CJK + trailing newline
    'special:name.md': 'colon in name\n',                 // ':' triggers sanitize divergence
    '100 SAP/note.md': 'inside folder\n',                 // folder with space
    '2022 CDP/sub/deep.md': 'nested deep\n',              // nested folder
    'with-attachment.md': 'see ![[pic.png]] here\n',      // references an attachment
    'emptyfolder/placeholder.txt': 'not md, stays behind', // non-md, not referenced -> not synced
    'attachments/pic.png': 'PNGDATA-bytes',               // referenced attachment (synced as resource)
  };
  for (const [p, c] of Object.entries(files)) {
    const full = path.join(srcDir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, c);
  }

  const srcPlugin = makePlugin(srcDir);
  await srcPlugin.mapping.load();
  const enginePush = new SyncEngine(srcPlugin);

  // Simulate a polluted server: orphan note + a duplicate folder that the
  // local vault does NOT have. forcePush must clean these (true overwrite).
  await srcPlugin.api.putItem('deadbeefdeadbeefdeadbeefdeadbeef.md',
    'orphan note\n\nid: deadbeefdeadbeefdeadbeefdeadbeef\nparent_id: \ntype_: 1\n', true);
  await srcPlugin.api.putItem('cafecafecafecafecafecafecafecafe.md',
    'dup folder\n\nid: cafecafecafecafecafecafecafecafe\nparent_id: \ntype_: 2\n', true);

  console.log('=== FORCE PUSH (src -> server) ===');
  await enginePush.forcePush();

  // target vault (empty)
  fs.mkdirSync(dstDir, { recursive: true });
  const dstPlugin = makePlugin(dstDir);
  await dstPlugin.mapping.load();
  const enginePull = new SyncEngine(dstPlugin);

  console.log('=== FORCE PULL (server -> dst) ===');
  await enginePull.forcePull();

  // ---- compare ----
  const src = walkMd(srcDir);
  const dst = walkMd(dstDir);
  const srcKeys = new Set(src.keys());
  const dstKeys = new Set(dst.keys());

  const missingInDst: string[] = [];
  for (const k of srcKeys) if (!dstKeys.has(k)) missingInDst.push(k);
  const extraInDst: string[] = [];
  for (const k of dstKeys) if (!srcKeys.has(k)) extraInDst.push(k);
  const contentDiff: string[] = [];
  for (const k of srcKeys) {
    if (dstKeys.has(k) && src.get(k) !== dst.get(k)) {
      contentDiff.push(k + '  [src ' + JSON.stringify(src.get(k)) + ' | dst ' + JSON.stringify(dst.get(k)) + ']');
    }
  }

  console.log('\n=== CONSISTENCY REPORT (src vs dst, .md only) ===');
  console.log('src .md files :', src.size);
  console.log('dst .md files :', dst.size);
  console.log('MISSING in dst (in src, not in dst):', missingInDst);
  console.log('EXTRA in dst   (in dst, not in src):', extraInDst);
  console.log('CONTENT DIFF   (same path, different bytes):', contentDiff);
  console.log('server items   :', server.snapshot().length, '(before cleanup had orphan + dup folder)');
  console.log('orphan still on server?', server.snapshot().some(n => n.includes('deadbeef') || n.includes('cafecafe')));

  const ok = missingInDst.length === 0 && extraInDst.length === 0 && contentDiff.length === 0;
  console.log('\nRESULT:', ok ? 'CONSISTENT ✅' : 'INCONSISTENT ❌');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
