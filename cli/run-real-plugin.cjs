#!/usr/bin/env node
/**
 * Runs the ACTUAL deployed plugin bundle (main.js) through its real lifecycle:
 *   new JoplinSyncPlugin(app, manifest) -> onload() -> VaultWatcher registers
 *   file events -> we simulate a file "create" -> the real ChangeQueue ->
 *   the real syncCycle() -> the real E2EE push -> server stores ciphertext.
 *
 * This is as close to "inside Obsidian" as possible without a display (the real
 * Obsidian GUI cannot launch headlessly here: Chromium's GPU process is unusable
 * on this display). It loads main.js (the same bundle Obsidian loads), not a
 * reimplementation. The only simulation is firing the vault 'create' event that
 * the OS file-watcher would fire in real Obsidian.
 */
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const Module = require('module');

// ---- globals Obsidian provides ----
globalThis.window = globalThis.window || globalThis;
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const VAULT = process.argv[2] || '/home/wang/文档/test';
const PLUGIN_DIR = path.join(VAULT, '.obsidian/plugins/joplin-server-sync');
const DATA_JSON = path.join(PLUGIN_DIR, 'data.json');
const creds = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));
const SERVER = (creds.serverUrl || '').replace(/\/$/, '');

// ---- minimal TFile/TFolder (must be the SAME classes used by the vault) ----
class TFile {
  constructor(p) {
    this.path = p; this.name = p.split('/').pop() || p;
    const d = this.name.lastIndexOf('.');
    this.extension = d >= 0 ? this.name.slice(d + 1) : '';
    this.basename = d >= 0 ? this.name.slice(0, d) : this.name;
    const dir = path.dirname(p);
    // Real Obsidian always sets TFile.parent to the parent TFolder.
    this.parent = (dir && dir !== '.' && dir !== '/') ? new TFolder(dir + '/') : new TFolder('');
    const abs = path.isAbsolute(p) ? p : path.join(VAULT, p);
    try { const s = fs.statSync(abs); this.stat = { ctime: s.ctimeMs, mtime: s.mtimeMs, size: s.size }; }
    catch { const t = Date.now(); this.stat = { ctime: t, mtime: t, size: 0 }; }
  }
}
class TFolder { constructor(p) { this.path = p; } }
class TAbstractFile { constructor(p) { this.path = p; } }

// ---- requestUrl like obsidian provides ----
async function requestUrl(param) {
  const headers = { ...(param.headers || {}) };
  if (param.contentType) headers['Content-Type'] = param.contentType;
  const res = await fetch(param.url, { method: param.method, headers, body: param.body });
  const buf = await res.arrayBuffer();
  let text = ''; try { text = new TextDecoder().decode(buf); } catch {}
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, arrayBuffer: buf };
}
function normalizePath(p) { return p; }
class Notice { constructor(m) { console.log('  [Notice]', m); } }

// ---- Plugin base class (what Obsidian provides) ----
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this._dataFile = path.join(manifest.dir, 'data.json'); }
  async loadData() { try { return JSON.parse(fs.readFileSync(this._dataFile, 'utf8')); } catch { return null; } }
  async saveData(d) { fs.mkdirSync(path.dirname(this._dataFile), { recursive: true }); fs.writeFileSync(this._dataFile, JSON.stringify(d, null, 2)); }
  addCommand(c) { (global.__cmds = global.__cmds || {})[c.id] = c; }
  addSettingTab() {}
  addStatusBarItem() { return new Proxy({}, { get: () => (() => {}) }); }
  registerEvent(r) { return r; }
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = {}; } display() {} }

// ---- obsidian shim (Proxy: known symbols + generic fallback) ----
const obsidianBase = { Plugin, Notice, PluginSettingTab, Setting: class {}, TFile, TFolder, TAbstractFile, normalizePath, requestUrl };
const obsidianShim = new Proxy(obsidianBase, {
  get(t, prop) {
    if (prop in t) return t[prop];
    if (typeof prop === 'symbol') return undefined;
    return class { constructor() {} };
  },
});
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return obsidianShim;
  return origLoad.apply(this, arguments);
};

// ---- DiskAdapter: writes to absolute plugin-data paths (shares mapping.json) ----
class DiskAdapter {
  async exists(p) { return fs.existsSync(p); }
  async read(p) { return fs.readFileSync(p, 'utf8'); }
  async write(p, c) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
  async mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
  async rename(f, t) { fs.mkdirSync(path.dirname(t), { recursive: true }); fs.renameSync(f, t); }
  async remove(p) { fs.rmSync(p, { force: true }); }
}

// ---- MockVault: fs-backed, event-capable (fires callbacks like real Obsidian) ----
class MockVault {
  constructor(root) {
    this.root = root; this.adapter = new DiskAdapter(); this.configDir = '.obsidian';
    this._cbs = {};
  }
  abs(p) { return path.join(this.root, String(p).replace(/^\/+/, '')); }
  walk() {
    const out = []; const rec = (dir) => {
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const full = path.join(dir, e.name);
        const rel = path.relative(this.root, full).split(path.sep).join('/');
        if (e.isDirectory()) rec(full); else out.push(rel);
      }
    }; rec(this.root); return out;
  }
  getMarkdownFiles() { return this.walk().filter(f => f.endsWith('.md')).map(f => new TFile(f)); }
  getFiles() { return this.walk().map(f => new TFile(f)); }
  getAbstractFileByPath(p) {
    const clean = p.replace(/\/+$/, ''); const a = this.abs(clean);
    try { const s = fs.statSync(a); if (s.isDirectory()) return new TFolder(clean + '/'); if (s.isFile()) return new TFile(clean); } catch {}
    return null;
  }
  async read(file) { const p = typeof file === 'string' ? file : file.path; return fs.readFileSync(this.abs(p), 'utf8'); }
  async readBinary(file) { const p = typeof file === 'string' ? file : file.path; const b = fs.readFileSync(this.abs(p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  async create(p, c) { fs.mkdirSync(path.dirname(this.abs(p)), { recursive: true }); fs.writeFileSync(this.abs(p), c); }
  async createBinary(p, c) { fs.mkdirSync(path.dirname(this.abs(p)), { recursive: true }); fs.writeFileSync(this.abs(p), Buffer.from(c)); }
  async modify() {}
  async modifyBinary() {}
  async createFolder(p) { fs.mkdirSync(this.abs(p), { recursive: true }); }
  async rename(f, t) { fs.mkdirSync(path.dirname(this.abs(t)), { recursive: true }); fs.renameSync(this.abs(f), this.abs(t)); }
  async delete(f) { try { fs.rmSync(this.abs(f), { recursive: true }); } catch {} }
  async trash(f) { await this.delete(f); }
  on(ev, cb) { (this._cbs[ev] = this._cbs[ev] || []).push(cb); return { unload: () => {} }; }
  off(ev, cb) { if (this._cbs[ev]) this._cbs[ev] = this._cbs[ev].filter(x => x !== cb); }
  fire(ev, ...args) { (this._cbs[ev] || []).forEach(cb => cb(...args)); }
}

// ---- build app + manifest ----
const vault = new MockVault(VAULT);
const app = {
  vault,
  fileManager: { trashFile: async () => {} },
  workspace: { on() { return { unload() {} }; }, off() {} },
};
const manifest = { dir: PLUGIN_DIR, id: 'joplin-server-sync', name: 'Joplin Server Sync', version: '0.3.56' };

// ---- load the REAL deployed bundle ----
const PluginClass = require(path.join(PLUGIN_DIR, 'main.js')).default;
const plugin = new PluginClass(app, manifest);

let failures = 0;
const assert = (c, m) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); if (!c) failures++; };

async function login() {
  const r = await fetch(SERVER + '/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: creds.email, password: creds.password }) });
  const j = await r.json();
  if (r.status !== 200 || !j.id) throw new Error('Login failed (' + r.status + '): ' + JSON.stringify(j));
  return j.id; // Joplin Server uses the session id as the auth token (X-API-AUTH)
}
// Fetch the RAW stored note content (independent of the plugin's decrypt path) so
// we can confirm the server holds ciphertext, not plaintext. Joplin Server item
// content lives at /api/items/root:/<joplinId>.md:/content (the trailing colon is
// REQUIRED — root:/<id>.md without it returns 400 "Invalid path format").
async function getItemRaw(joplinId) {
  const tok = await login();
  const r = await fetch(SERVER + '/api/items/root:/' + joplinId + '.md:/content', {
    headers: { 'X-API-AUTH': tok },
  });
  return { status: r.status, text: await r.text() };
}
async function deleteItem(joplinId) {
  const tok = await login();
  await fetch(SERVER + '/api/items/root:/' + joplinId + '.md', {
    method: 'DELETE', headers: { 'X-API-AUTH': tok },
  });
}
function findMappingEntry(file) {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'data/mapping.json'), 'utf8'));
  return (m.entries || []).find(e => e.path === file);
}

(async () => {
  console.log('== run-real-plugin (deployed main.js lifecycle) ==');
  const sentinel = 'obsidian-real-e2ee-verify.md';
  const sentinelPath = path.join(VAULT, sentinel);
  const sentinelBody = '# Obsidian Real E2EE Verify\n\nEncrypted by the real plugin onload+sync. sentinel-🔒-' + Date.now() + '\n';
  fs.writeFileSync(sentinelPath, sentinelBody);

  console.log('[1] loading plugin (new JoplinSyncPlugin + onload)...');
  await plugin.onload();
  assert(!!plugin.engine, 'plugin.onload() registered engine + commands');
  assert(!!global.__cmds['joplin-sync-now'], 'command "Sync now" registered by onload');

  console.log('[2] simulating real Obsidian file-watcher "create" event for the sentinel note...');
  vault.fire('create', new TFile(sentinel));

  console.log('[3] triggering the REAL "Sync now" command -> syncCycle (E2EE push)...');
  // Stop the auto scheduler so it can't collide; then call the real command
  // handler (syncCycle) and AWAIT it so pushAll reliably drains the queue.
  try { plugin.engine.shutdown(); } catch {}
  // The startup setTimeout (syncOnStartup) may still fire at +5s; if it does it
  // will see state=Pushing and bail, so our explicit call owns the run.
  const syncRun = global.__cmds['joplin-sync-now'].callback();
  await Promise.race([syncRun, new Promise(r => setTimeout(r, 120000))]);

  const entry = findMappingEntry(sentinel);
  assert(!!entry, 'sentinel note got a joplin id (mapped)');
  let encApplied = false, plaintextAbsent = false;
  if (entry) {
    const raw = await getItemRaw(entry.joplinId);
    console.log('  [diag] sentinel id', entry.joplinId, '| status', raw.status);
    console.log('  [diag] raw head:', raw.text.slice(0, 240).replace(/\n/g, '⏎'));
    encApplied = /encryption_applied:\s*1/.test(raw.text);
    plaintextAbsent = !raw.text.includes('Encrypted by the real plugin');
    assert(encApplied, 'server stored sentinel note with encryption_applied=1 (real plugin E2EE push)');
    assert(plaintextAbsent, 'server stored CIPHERTEXT — plaintext sentinel absent (real plugin)');
  }

  console.log('[4] cleanup');
  try {
    if (entry) await deleteItem(entry.joplinId);
    const m = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'data/mapping.json'), 'utf8'));
    if (entry) m.entries = (m.entries || []).filter(e => e.joplinId !== entry.joplinId);
    fs.writeFileSync(path.join(PLUGIN_DIR, 'data/mapping.json'), JSON.stringify(m, null, 2));
  } catch (e) { console.error('  cleanup err', e.message); }
  try { fs.unlinkSync(sentinelPath); } catch {}
  try { plugin.onunload(); } catch {}

  console.log(failures === 0 ? '\n=== REAL PLUGIN E2EE SYNC VERIFIED ✅ ===' : `\n=== REAL PLUGIN E2EE SYNC FAILED ❌ (${failures}) ===`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
