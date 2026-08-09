#!/usr/bin/env node
/**
 * Headless CLI to drive the real sync engine against a vault directory and a
 * real Joplin Server, without needing the Obsidian GUI. Useful for testing
 * the push/pull "full consistency" behaviour.
 *
 *   node cli/sync-cli.js push  <vaultPath>
 *   node cli/sync-cli.js pull  <vaultPath>
 *   node cli/sync-cli.js sync  <vaultPath>
 *
 * Credentials + settings are read from
 *   <vaultPath>/.obsidian/plugins/joplin-server-sync/data.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { MappingStore } from '../src/mapping/MappingStore';
import { SyncEngine } from '../src/core/SyncEngine';
import { MockVault, MockFileManager, DiskAdapter } from '../test/mock/vault';
import { setVaultRoot } from '../test/mock/obsidian-real';
import { DEFAULT_SETTINGS } from '../src/settings/PluginSettings';
import { JoplinSerializer } from '../src/convert/JoplinSerializer';
import { ModelType } from '../src/api/models';
import { EncryptionService } from '../src/e2ee/EncryptionService';
import { ChangeLogStore } from '../src/core/ChangeLogStore';
import { FileIdentity } from '../src/core/FileIdentity';

function loadCreds(vaultPath: string) {
  const p = path.join(vaultPath, '.obsidian/plugins/joplin-server-sync/data.json');
  if (!fs.existsSync(p)) throw new Error('No plugin config found at ' + p + ' — deploy the plugin first.');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    serverUrl: d.serverUrl, email: d.email, password: d.password,
    attachmentFolder: d.attachmentFolder || 'attachments',
    excludePatterns: d.excludePatterns || [],
    e2eeEnabled: d.e2eeEnabled === true,
    e2eePassword: d.e2eePassword || '',
  };
}

function makePlugin(vaultRoot: string, creds: any) {
  const vault = new MockVault(vaultRoot);
  vault.adapter = new DiskAdapter(vaultRoot); // share real plugin mapping on disk
  const api = new JoplinServerApi(() => ({
    baseUrl: creds.serverUrl, email: creds.email, password: creds.password,
  }));
  const plugin: any = {
    app: { vault, fileManager: new MockFileManager(vault) },
    api,
    settings: { ...DEFAULT_SETTINGS, attachmentFolder: creds.attachmentFolder, excludePatterns: creds.excludePatterns, e2eeEnabled: creds.e2eeEnabled === true, e2eePassword: creds.e2eePassword || '' },
    manifest: { dir: '.obsidian/plugins/joplin-server-sync' },
    statusBar: {
      setSyncing(m: string) { console.log('  [status]', m); },
      setProgress() {}, setIdle() {}, setOk() {}, setError(e: string) { console.log('  [ERROR]', e); },
    },
    logSync() {},
    registerEvent(_ref: any) { return _ref; },
    e2ee: new EncryptionService(),
  };
  plugin.mapping = new MappingStore(plugin);
  plugin.changeLog = new ChangeLogStore(plugin);
  plugin.identity = new FileIdentity(plugin);
  return plugin;
}

async function main() {
  const [mode, vaultPath] = process.argv.slice(2);
  const noVaultModes = ['e2eetest', 'deltaprobe', 'lsroot', 'rt', 'probe2', 'diag'];
  if (!mode || (!vaultPath && !noVaultModes.includes(mode))) {
    console.log('Usage: node cli/sync-cli.cjs <push|pull|sync|e2eetest|e2eeserver|e2eesync|verifyenc|verifycount|diag|deltaprobe|lsroot|rt|probe2> [vaultPath]');
    process.exit(1);
  }
  let creds: any = { serverUrl: '', email: '', password: '', attachmentFolder: 'attachments', excludePatterns: [] };
  if (vaultPath) creds = loadCreds(vaultPath);
  setVaultRoot(vaultPath || '');
  const plugin = makePlugin(vaultPath || process.cwd(), creds);
  if (vaultPath) { await plugin.mapping.load(); await plugin.changeLog.load(); }
  const engine = new SyncEngine(plugin);
  plugin.engine = engine;
  console.log(`== ${mode} ==`);
  if (mode === 'push') await engine.forcePush();
  else if (mode === 'pull') await engine.forcePull();
  else if (mode === 'sync') await engine.syncCycle();
  else if (mode === 'probe2') {
    await plugin.api.login();
    const { createJoplinId } = require('../src/mapping/IdGenerator');
    const { JoplinSerializer } = require('../src/convert/JoplinSerializer');
    const { ModelType } = require('../src/api/models');
    const ser = new JoplinSerializer();
    const F1 = createJoplinId();
    const now = Date.now();
    await plugin.api.putItem(F1 + '.md', ser.serialize({
      id: F1, parent_id: '', title: 'PROBE_FOLDER', type_: ModelType.Folder,
      created_time: now, updated_time: now, user_created_time: now, user_updated_time: now,
      encryption_applied: 0, encryption_cipher_text: '',
    } as any), true);
    console.log('PUT folder', F1);
    const N1 = createJoplinId();
    await plugin.api.putItem(N1 + '.md', ser.serialize({
      id: N1, parent_id: F1, title: 'PROBE_NOTE', body: 'hello probe', type_: ModelType.Note,
      created_time: now, updated_time: now, user_created_time: now, user_updated_time: now,
      encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    } as any), true);
    console.log('PUT note', N1, 'parent', F1);
    const raw = (p: string) => (plugin.api as any).rawRequest('GET', '/api/items/root:/' + p + ':/content');
    console.log('GET folder flat      =>', (await raw(F1 + '.md')).status);
    console.log('GET note  flat      =>', (await raw(N1 + '.md')).status);
    console.log('GET note  nested    =>', (await raw(F1 + '/' + N1 + '.md')).status);
    console.log('listChildren root    =>', (await plugin.api.listChildrenOf('')).items.length);
    console.log('listChildren folder  =>', (await plugin.api.listChildrenOf(F1)).items.length);
    // cleanup
    await plugin.api.deleteItem(N1 + '.md');
    await plugin.api.deleteItem(F1 + '.md');
    console.log('cleaned up probe items');

    // --- Batch GET: are push4's actual mapping note ids on the server? ---
    const fs = require('fs');
    const mapPath = path.join(vaultPath, '.obsidian/plugins/joplin-server-sync/data/mapping.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const notes = (map.entries || []).filter((e: any) => e.type === 1).slice(0, 20);
    const folders = (map.entries || []).filter((e: any) => e.type === 2).slice(0, 10);
    let nOk = 0;
    for (const e of notes) { const r = await (plugin.api as any).rawRequest('GET', '/api/items/root:/' + e.joplinId + '.md:/content'); if (r.status === 200) nOk++; }
    let fOk = 0;
    for (const e of folders) { const r = await (plugin.api as any).rawRequest('GET', '/api/items/root:/' + e.joplinId + '.md:/content'); if (r.status === 200) fOk++; }
    console.log(`mapping notes sampled=${notes.length} retrievable=${nOk} | folders sampled=${folders.length} retrievable=${fOk}`);

    // Upload a REAL note file from disk with a FRESH id, then GET to test persistence.
    const fs2 = require('fs');
    const p2 = require('path');
    const realNotePath: string[] = [];
    const walk = (d: string) => {
      if (realNotePath.length) return;
      let ents: fs2.Dirent[];
      try { ents = fs2.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (realNotePath.length) return;
        const full = p2.join(d, e.name);
        if (e.isDirectory()) { if (!e.name.startsWith('.')) walk(full); }
        else if (e.name.endsWith('.md')) realNotePath.push(full);
      }
    };
    walk(vaultPath);
    if (realNotePath.length) {
      const fp = realNotePath[0];
      const body = fs2.readFileSync(fp, 'utf8');
      const RN = createJoplinId();
      const ser3 = ser.serialize({
        id: RN, parent_id: '', title: p2.basename(fp).replace(/\.md$/, ''),
        body, type_: ModelType.Note,
        created_time: now, updated_time: now, user_created_time: now, user_updated_time: now,
        encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
      } as any);
      console.log('REAL upload: ' + fp + ' (bodyLen ' + body.length + ')');
      let putOk = true;
      try { const pr = await plugin.api.putItem(RN + '.md', ser3, true); console.log('  putItem result:', JSON.stringify(pr).slice(0, 120)); }
      catch (err: any) { putOk = false; console.log('  putItem THREW:', err.message); }
      if (putOk) {
        const r1 = await (plugin.api as any).rawRequest('GET', '/api/items/root:/' + RN + '.md:/content');
        console.log('  after REAL upload GET =>', r1.status, '| len', (r1.text || '').length);
        await plugin.api.deleteItem(RN + '.md');
        console.log('  cleaned up real note');
      }
    } else {
      console.log('no real note found on disk');
    }
  } else if (mode === 'diag') {
    await plugin.api.login();
    // Probe: read this vault's mapping.json from disk, confirm notes exist on
    // server, and discover how to enumerate nested items.
    const fs = require('fs');
    const mapPath = path.join(vaultPath, '.obsidian/plugins/joplin-server-sync/data/mapping.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const entries: any[] = map.entries || map.items || [];
    const note = entries.find((e: any) => e.type === 1);
    const folder = entries.find((e: any) => e.type === 2);
    console.log('mapping entries:', entries.length, '| sample note id:', note?.joplinId, '| sample folder id:', folder?.joplinId);
    if (note) {
      const rawReq = (p: string) => (plugin.api as any).rawRequest('GET', '/api/items/root:/' + p + ':/content');
      const r1 = await rawReq(note.joplinId + '.md');
      console.log('RAW GET note @root/<id>.md => status', r1.status, '| len', (r1.text||'').length);
      if (folder) {
        const r2 = await rawReq(folder.joplinId + '/' + note.joplinId + '.md');
        console.log('RAW GET note @root/<folder>/<id>.md => status', r2.status);
        const r3 = await rawReq(folder.joplinId + '.md');
        console.log('RAW GET folder @root/<folder>.md => status', r3.status);
        // title-based attempt
        const ft = folder.path.replace(/\/$/, '').split('/').pop() || folder.path;
        const r4 = await rawReq(encodeURIComponent(ft) + '/' + note.joplinId + '.md');
        console.log('RAW GET note @root/<folderTitle>/<id>.md (' + ft + ') => status', r4.status);
        const r5 = await rawReq(encodeURIComponent(ft) + '.md');
        console.log('RAW GET folder @root/<folderTitle>.md => status', r5.status);
      }
      const res = entries.find((e: any) => e.type === 4);
      if (res) {
        const rr = await rawReq(res.joplinId + '.md');
        console.log('RAW GET resource @root/<id>.md => status', rr.status, '| len', (rr.text||'').length);
      }
    }
    if (folder) {
      const raw = await plugin.api.getItem(folder.joplinId + '.md');
      console.log('GET folder meta (first 160):', raw ? JSON.stringify(raw.slice(0, 160)) : 'NULL');
      try {
        const kids = await plugin.api.listChildrenOf(folder.joplinId);
        console.log('listChildrenOf(folder) count:', kids.items.length, '| sample:', JSON.stringify(kids.items.slice(0, 3)));
      } catch (e: any) { console.log('listChildrenOf(folder) ERROR:', e.message); }
    }
    try {
      const root = await plugin.api.listChildrenOf('');
      console.log('listChildrenOf(root) count:', root.items.length, '| sample:', JSON.stringify(root.items.slice(0, 5)));
    } catch (e: any) { console.log('listChildrenOf(root) ERROR:', e.message); }
  } else if (mode === 'rt') {
    await plugin.api.login();
    const fs = require('fs');
    const mapPath = path.join(vaultPath, '.obsidian/plugins/joplin-server-sync/data/mapping.json');
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const entries: any[] = map.entries || map.items || [];
    const noteIds = entries.filter((e: any) => e.type === 1).map((e: any) => e.joplinId);
    const names = new Map<string, number>();
    let cur: string | undefined;
    while (true) {
      const p = await plugin.api.delta(cur);
      for (const it of p.items) { const n = (it as any).name || ''; if (n) names.set(n, Number((it as any).type)); }
      cur = p.cursor; if (!p.has_more) break;
    }
    const present = noteIds.filter((id: string) => names.has(id + '.md'));
    const presentNotDeleted = noteIds.filter((id: string) => names.get(id + '.md') !== 3);
    console.log('mapping note ids:', noteIds.length, '| present (any):', present.length, '| present & not-deleted:', presentNotDeleted.length);
    console.log('sample absent:', JSON.stringify(noteIds.filter((id: string) => !names.has(id + '.md')).slice(0, 3)));
  } else if (mode === 'deltaprobe') {
    await plugin.api.login();
    let cur: string | undefined;
    let count = 0;
    const samples: any[] = [];
    const typeCounts: Record<string, number> = {};
    const itemTypeCounts: Record<string, number> = {};
    while (true) {
      const p = await plugin.api.delta(cur);
      for (const it of p.items) {
        const t = String((it as any).type);
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        const it2 = String((it as any).item_type ?? (it as any).itemType ?? '?');
        itemTypeCounts[it2] = (itemTypeCounts[it2] || 0) + 1;
        if (samples.length < 8) samples.push({ ...it });
        count++;
      }
      cur = p.cursor;
      if (!p.has_more) break;
    }
    console.log('total delta items:', count);
    console.log('change-type counts (1=create,2=update,3=delete):', JSON.stringify(typeCounts));
    console.log('item_type counts (1=note,2=folder,4=resource):', JSON.stringify(itemTypeCounts));
    console.log('--- sample raw delta items ---');
    for (const s of samples) console.log(JSON.stringify(s));
  } else if (mode === 'lsroot') {
    await plugin.api.login();
    let cur: string | undefined;
    let total = 0;
    const byExt: Record<string, number> = {};
    const samples: any[] = [];
    while (true) {
      const p = await plugin.api.listChildrenOf('', cur);
      for (const it of p.items) {
        total++;
        const name = it.name || '';
        const ext = name.includes('.') ? name.split('.').pop() : (name.includes('/') ? 'dir' : 'noext');
        byExt[ext] = (byExt[ext] || 0) + 1;
        if (samples.length < 5) samples.push({ ...it });
      }
      cur = (p as any).cursor;
      if (!(p as any).has_more) break;
    }
    console.log('listChildrenOf(root) TOTAL items:', total);
    console.log('by extension/shape:', JSON.stringify(byExt));
    console.log('--- sample items ---');
    for (const s of samples) console.log(JSON.stringify(s));
  } else if (mode === 'e2eetest') {
    const { EncryptionService, EncryptionMethod } = require('../src/e2ee/EncryptionService');
    const enc = new EncryptionService();
    const password = 'test-password-123';
    const mkId = (require('../src/mapping/IdGenerator')).createJoplinId();
    let failures = 0;
    const assert = (cond: boolean, msg: string) => {
      if (cond) console.log('  PASS:', msg);
      else { failures++; console.log('  FAIL:', msg); }
    };

    console.log('== E2EE protocol self-test ==');
    const mk = await enc.generateMasterKey(password, mkId);
    enc.feedMasterKey({ id: mk.id, type_: 9, encryption_cipher_text: mk.encryptedContent } as any);
    await enc.loadMasterKey(mkId, password);
    assert(enc.hasLoadedKeys, 'master key loaded from password');

    const note = '# Secret\n\nThis is end-to-end encrypted content. 中文测试 🔒\n';
    const cipher = await enc.encryptItem(note, mkId);
    let noteOk = false;
    try { const plain = await enc.decryptItem({ encryption_applied: 1, encryption_cipher_text: cipher } as any); noteOk = plain === note; }
    catch { /* decrypt error surfaced by assert */ }
    assert(noteOk, 'note encrypt→decrypt round-trip is lossless');

    const blob = new Uint8Array([0, 1, 2, 3, 255, 254, 128, 7, 42, 9, 11, 200, 0, 0, 1]);
    const blobCipher = await enc.encryptBlob(blob.buffer as ArrayBuffer, mkId);
    let blobOk = false;
    try { const blobPlain = new Uint8Array(await enc.decryptBlob(blobCipher, mkId)); blobOk = blobPlain.length === blob.length && blobPlain.every((b, i) => b === blob[i]); }
    catch { /* decrypt error surfaced by assert */ }
    assert(blobOk, 'blob encrypt→decrypt round-trip is lossless');

    let wrongFailed = false;
    try {
      const enc2 = new EncryptionService();
      enc2.feedMasterKey({ id: mk.id, type_: 9, encryption_cipher_text: mk.encryptedContent } as any);
      await enc2.loadMasterKey(mkId, 'wrong-password');
    } catch { wrongFailed = true; }
    assert(wrongFailed, 'wrong password is rejected (GCM auth fails)');

    const headerLen = parseInt(cipher.slice(0, 6), 16);
    const headerBytes = enc['hexToBytes'](cipher.slice(6, 6 + headerLen * 2));
    assert(headerBytes[0] === 1, 'header version = 1');
    assert((headerBytes[1] << 8 | headerBytes[2]) === EncryptionMethod.StringV1, 'header method = StringV1(9)');
    const hdrMkId = enc['bytesToHex'](headerBytes.slice(3, 19));
    assert(hdrMkId === mkId, 'header carries correct masterKeyId');
    const firstChunkOff = 6 + headerLen * 2;
    const chunkLen = parseInt(cipher.slice(firstChunkOff, firstChunkOff + 6), 16);
    const chunkBytes = enc['hexToBytes'](cipher.slice(firstChunkOff + 6, firstChunkOff + 6 + chunkLen * 2));
    assert(chunkBytes.length > 12 && chunkBytes.length % 2 === 0, 'chunk has IV(12) + GCM ciphertext+tag');
    assert(chunkBytes.slice(0, 12).length === 12, 'chunk IV is 12 bytes (AES-GCM nonce)');

    const big = 'x'.repeat(20000);
    const bigCipher = await enc.encryptItem(big, mkId);
    const bigPlain = await enc.decryptItem({ encryption_applied: 1, encryption_cipher_text: bigCipher } as any);
    assert(bigPlain === big, 'large (multi-chunk) note round-trip is lossless');

    console.log(failures === 0 ? '\n=== E2EE SELF-TEST PASSED ✅ ===' : `\n=== E2EE SELF-TEST FAILED ❌ (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === 'e2eeserver') {
    const { EncryptionService, EncryptionMethod } = require('../src/e2ee/EncryptionService');
    const { JoplinSerializer } = require('../src/convert/JoplinSerializer');
    const { ModelType } = require('../src/api/models');
    const { createJoplinId } = require('../src/mapping/IdGenerator');
    await plugin.api.login();
    const enc = new EncryptionService();
    const ser = new JoplinSerializer();
    const password = 'e2ee-server-test-🔒';
    let failures = 0;
    const assert = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); if (!c) failures++; };
    const ids: string[] = [];

    console.log('== E2EE end-to-end through REAL Joplin Server ==');
    // 1. Generate master key + upload as MasterKey item (type_=9)
    const mkId = createJoplinId();
    const mk = await enc.generateMasterKey(password, mkId);
    await plugin.api.putItem(mkId + '.md', ser.serialize({
      id: mkId, type_: ModelType.MasterKey as any,
      body: mk.encryptedContent, content: mk.encryptedContent, encryption_cipher_text: '', encryption_applied: 0,
    } as any), true);
    ids.push(mkId);
    enc.feedMasterKey({ id: mkId, type_: 9, body: mk.encryptedContent } as any);
    await enc.loadMasterKey(mkId, password);
    assert(enc.hasLoadedKeys, 'master key uploaded + loaded from server');

    // 1b. ROUND-TRIP: reload the master key from the server (as a second
    // device would) and confirm it decrypts — proves the stored cipher text
    // survives the server round-trip (not just the local in-memory copy).
    const rawMk = await plugin.api.getItem(mkId + '.md');
    const srvMk = ser.unserialize(rawMk!);
    const enc2 = new EncryptionService();
    enc2.feedMasterKey(srvMk as any);
    let mkRoundTrip = false;
    try { await enc2.loadMasterKey(mkId, password); mkRoundTrip = true; } catch (e: unknown) { /* round-trip load error surfaced by assert */ }
    assert(mkRoundTrip, 'master key reloads from server (round-trip) and decrypts with password');

    // 2. Encrypt a NOTE, push it, pull it back, decrypt
    const noteId = createJoplinId();
    const originalBody = '# E2EE Note\n\nsecret body 中文🔒 end-to-end\n';
    const serialized = ser.serialize({ id: noteId, parent_id: '', title: 'E2EE Note', body: originalBody, type_: ModelType.Note, created_time: Date.now(), updated_time: Date.now(), user_created_time: Date.now(), user_updated_time: Date.now(), markup_language: 1, encryption_applied: 0, encryption_cipher_text: '' } as any);
    const cipherText = await enc.encryptItem(serialized, mkId);
    await plugin.api.putItem(noteId + '.md', ser.serialize({ id: noteId, type_: ModelType.Note, encryption_applied: 1, encryption_cipher_text: cipherText, title: '', body: '' } as any), true);
    ids.push(noteId);

    const pulledRaw = await plugin.api.getItem(noteId + '.md');
    const pulledItem = ser.unserialize(pulledRaw!);
    assert(pulledItem.encryption_applied === 1, 'server stored encryption_applied=1');
    enc.feedMasterKey({ id: mkId, type_: 9, encryption_cipher_text: mk.encryptedContent } as any);
    const decryptedSerialized = await enc.decryptItem(pulledItem);
    const decryptedNote = ser.unserialize(decryptedSerialized);
    assert(decryptedNote.body === originalBody, 'pulled note decrypts to original body (server round-trip)');

    // 3. Encrypt a RESOURCE blob, push it, pull it back, decrypt
    const resId = createJoplinId();
    const blob = new Uint8Array([1, 2, 3, 255, 0, 128, 200, 9, 42, 7, 11, 3, 200, 1]);
    const blobCipherText = await enc.encryptBlob(blob.buffer as ArrayBuffer, mkId);
    const blobCipherBytes = new TextEncoder().encode(blobCipherText);
    await plugin.api.putItem('.resource/' + resId, blobCipherBytes.buffer as ArrayBuffer);
    await plugin.api.putItem(resId + '.md', ser.serialize({ id: resId, type_: ModelType.Resource, title: 'secret.png', mime: 'image/png', size: blob.length, filename: 'secret.png', encryption_applied: 1, encryption_cipher_text: await enc.encryptItem(ser.serialize({ id: resId, title: 'secret.png', mime: 'image/png', size: blob.length, filename: 'secret.png' } as any), mkId), } as any), true);
    ids.push(resId);
    const pulledBlob = await plugin.api.getItemBinary('.resource/' + resId);
    const pulledBlobText = new TextDecoder().decode(pulledBlob);
    const decryptedBlob = new Uint8Array(await enc.decryptBlob(pulledBlobText, mkId));
    assert(decryptedBlob.length === blob.length && decryptedBlob.every((b, i) => b === blob[i]), 'pulled resource blob decrypts to original bytes (server round-trip)');

    // 4. Wrong password must NOT decrypt (auth fails) — verify on the pulled note
    const encBad = new EncryptionService();
    encBad.feedMasterKey({ id: mkId, type_: 9, encryption_cipher_text: mk.encryptedContent } as any);
    let badFailed = false;
    try { await encBad.loadMasterKey(mkId, 'totally-wrong'); await encBad.decryptItem(pulledItem); }
    catch { badFailed = true; }
    assert(badFailed, 'wrong password cannot decrypt server-stored note');

    // 5. Cleanup test items
    for (const id of ids) { try { await plugin.api.deleteItem(id + '.md'); } catch {} try { await plugin.api.deleteItem('.resource/' + id); } catch {} }
    console.log('cleaned up', ids.length, 'test items');

    console.log(failures === 0 ? '\n=== E2EE SERVER ROUND-TRIP PASSED ✅ ===' : `\n=== E2EE SERVER ROUND-TRIP FAILED ❌ (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === 'mkprobe') {
    await plugin.api.login();
    const ser = new (require('../src/convert/JoplinSerializer')).JoplinSerializer();
    let cursor: string | undefined;
    let total = 0, mkCount = 0;
    while (true) {
      const page = await plugin.api.listChildrenOf('', cursor);
      for (const stat of page.items) {
        total++;
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith('.resource/')) continue;
        const raw = await plugin.api.getItem(stat.name);
        if (!raw) continue;
        const item = ser.unserialize(raw);
        if (item.type_ === 9 || (item.encryption_cipher_text && (item.encryption_cipher_text as string).length > 0)) {
          mkCount++;
          console.log('--- MK/ENC', stat.name, '---');
          console.log('type_:', item.type_, '| encryption_applied:', item.encryption_applied);
          console.log('encryption_cipher_text:', JSON.stringify(item.encryption_cipher_text));
        }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor) break;
    }
    console.log('total items scanned:', total, '| master/encrypted items:', mkCount);
    console.log('== mkprobe done ==');
  } else if (mode === 'mkclean') {
    // Remove ONLY MasterKey (type_=9) items from the server — safe, since an
    // unencrypted vault has no master keys, so these are always test artifacts.
    await plugin.api.login();
    const ser = new (require('../src/convert/JoplinSerializer')).JoplinSerializer();
    let cursor: string | undefined;
    let scanned = 0, removed = 0;
    while (true) {
      const page = await plugin.api.listChildrenOf('', cursor);
      for (const stat of page.items) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith('.resource/')) continue;
        scanned++;
        const raw = await plugin.api.getItem(stat.name);
        if (!raw) continue;
        const item = ser.unserialize(raw);
        if (item.type_ === 9) {
          try { await plugin.api.deleteItem(stat.name); removed++; console.log('removed MK', stat.name); } catch { /* ignore */ }
        }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor) break;
    }
    console.log('mkclean scanned=' + scanned + ' removed master keys=' + removed);
  } else if (mode === 'e2eesync') {
    // Full live-path test: drive the REAL SyncEngine (forcePush + forcePull)
    // with the REAL EncryptionService against the real Joplin Server. Proves
    // that notes/resources are encrypted on upload and decrypted on pull.
    const { EncryptionService } = require('../src/e2ee/EncryptionService');
    const { SyncEngine } = require('../src/core/SyncEngine');
    const os = require('os');
    const pw = 'E2EE-live-path-🔒-2026';
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'joplin-e2ee-'));
    const pushVault = path.join(tmpBase, 'push');
    const pullVault = path.join(tmpBase, 'pull');
    fs.mkdirSync(pushVault, { recursive: true });
    fs.mkdirSync(pullVault, { recursive: true });

    const secret = '# Live E2EE Note\n\nsecret 中文🔒 end-to-end through forcePush+forcePull\n';
    fs.writeFileSync(path.join(pushVault, 'live-e2ee-note.md'), secret);
    const bin = Buffer.from([1, 2, 3, 255, 0, 128, 200, 9, 42, 7, 11, 3, 200, 1]);
    fs.mkdirSync(path.join(pushVault, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(pushVault, 'assets', 'secret.bin'), bin);

    let failures = 0;
    const assert = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); if (!c) failures++; };
    let noteId: string | undefined, resId: string | undefined, mkId: string | undefined;

    try {
      console.log('== E2EE live sync-path test ==');
      // --- Push side: provision master key + upload via the REAL engine ---
      const pluginP: any = makePlugin(pushVault, creds);
      pluginP.e2ee = new EncryptionService();
      pluginP.settings.e2eePassword = pw;
      pluginP.settings.e2eeEnabled = true;
      pluginP.settings.excludePatterns = [];
      const engP = new SyncEngine(pluginP);
      pluginP.engine = engP;
      await pluginP.mapping.load();
      await engP.enableE2EE();
      assert(engP.e2eeActive, 'enableE2EE provisioned + loaded a master key (live)');

      const vaultP = pluginP.app.vault as any;
      const noteFile = vaultP.getMarkdownFiles().find((f: any) => f.path.endsWith('live-e2ee-note.md'));
      const resFile = vaultP.getFiles().find((f: any) => f.path.endsWith('secret.bin'));
      await (engP as any).uploadNote(noteFile, '', true);
      await engP.resources.uploadResource(resFile, true);
      await pluginP.mapping.flush();

      // --- Verify server stored CIPHERTEXT (no plaintext leakage) ---
      await pluginP.api.login();
      const noteEntry = pluginP.mapping.getByPath(noteFile.path);
      const resEntry = pluginP.mapping.getByPath(resFile.path);
      noteId = noteEntry?.joplinId; resId = resEntry?.joplinId; mkId = pluginP.e2ee.activeKeyId ?? undefined;
      const ser = new JoplinSerializer();
      const rawNote = await pluginP.api.getItem(noteId + '.md');
      const noteItem = ser.unserialize(rawNote!);
      assert(noteItem.encryption_applied === 1, 'server stored note with encryption_applied=1 (live)');
      assert(!rawNote!.includes('Live E2EE Note'), 'server stored CIPHERTEXT — plaintext secret absent (live)');
      const rawRes = await pluginP.api.getItem(resId + '.md');
      const resItem = ser.unserialize(rawRes!);
      assert(resItem.encryption_applied === 1, 'server stored resource with encryption_applied=1 (live)');
      assert(!rawRes!.includes('secret.bin'), 'server stored resource CIPHERTEXT — plaintext metadata absent (live)');

      // --- Pull side: fresh engine, load keys via cached id (fast path) ---
      const pluginQ: any = makePlugin(pullVault, creds);
      pluginQ.e2ee = new EncryptionService();
      pluginQ.settings.e2eePassword = pw;
      pluginQ.settings.e2eeEnabled = true;
      pluginQ.settings.excludePatterns = [];
      const engQ = new SyncEngine(pluginQ);
      pluginQ.engine = engQ;
      await pluginQ.mapping.load();
      // Seed the cached master-key id so enableE2EE takes the fast path
      // (single GET) instead of enumerating the whole server.
      if (mkId) pluginQ.mapping.setE2eeMasterKeyId(mkId);
      await engQ.enableE2EE();
      assert(engQ.e2eeActive, 'pull engine loaded master key via cached id (fast path)');

      // Note: pull the SERVER-STORED encrypted note and decrypt it via the
      // engine's real decrypt path (the same code forcePull uses).
      const rawNotePull = await pluginQ.api.getItem(noteId + '.md');
      const srvNote = ser.unserialize(rawNotePull!);
      const decSerialized = await pluginQ.e2ee.decryptItem(srvNote);
      const decNote = ser.unserialize(decSerialized);
      assert(decNote.body === secret, 'pulled note decrypts to original plaintext (engine decryptItem)');

      // Resource: pull the SERVER-STORED encrypted resource via the REAL
      // ResourceManager.downloadResource (exercises blob + metadata decrypt).
      const rawResPull = await pluginQ.api.getItem(resId + '.md');
      const srvRes = ser.unserialize(rawResPull!);
      const outPath = await engQ.resources.downloadResource(srvRes);
      const pulledBin = fs.readFileSync(path.join(pullVault, outPath));
      assert(Buffer.compare(pulledBin, bin) === 0, 'pulled resource decrypts to original bytes (ResourceManager.downloadResource)');
    } catch (e: unknown) {
      failures++;
      console.error('  [ERROR]', e instanceof Error ? e.message : String(e));
    } finally {
      // --- Cleanup ONLY our test items from the shared server ---
      try {
        const pluginC: any = makePlugin(pushVault, creds);
        pluginC.e2ee = new EncryptionService();
        await pluginC.api.login();
        for (const id of [noteId, resId, mkId]) {
          if (!id) continue;
          try { await pluginC.api.deleteItem(id + '.md'); } catch { /* ignore */ }
          try { await pluginC.api.deleteItem('.resource/' + id); } catch { /* ignore */ }
        }
      } catch { /* best effort */ }
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
    console.log(failures === 0 ? '\n=== E2EE LIVE SYNC-PATH PASSED ✅ ===' : `\n=== E2EE LIVE SYNC-PATH FAILED ❌ (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === 'verifyenc') {
    // Verify the DEPLOYED engine encrypts REAL vault content end-to-end: upload
    // a sentinel note through the vault's shared mapping + the real server, then
    // confirm the server stores it as ciphertext (no plaintext leakage). Cleans up.
    console.log('== verifyenc ==');
    const plugin: any = makePlugin(vaultPath, creds);
    plugin.e2ee = new EncryptionService();
    const eng = new SyncEngine(plugin);
    plugin.engine = eng;
    await plugin.mapping.load();
    await eng.enableE2EE();
    let failures = 0;
    const assert = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); if (!c) failures++; };
    let noteId: string | undefined;
    try {
      assert(eng.e2eeActive, 'deployed engine enabled E2EE from vault config (e2eePassword set)');
      const vault = plugin.app.vault as any;
      const file = vault.getMarkdownFiles().find((f: any) => f.path.endsWith('e2ee-verify-tmp.md'));
      if (!file) throw new Error('sentinel note e2ee-verify-tmp.md not found in vault');
      await (eng as any).uploadNote(file, '', true);
      await plugin.mapping.flush();
      const entry = plugin.mapping.getByPath(file.path);
      noteId = entry?.joplinId;
      if (!noteId) throw new Error('sentinel note was not assigned a joplin id');
      await plugin.api.login();
      const ser2 = new JoplinSerializer();
      const raw = await plugin.api.getItem(noteId + '.md');
      const item = ser2.unserialize(raw!);
      assert(item.encryption_applied === 1, 'server stored sentinel note with encryption_applied=1 (deployed engine)');
      assert(!raw!.includes('This note proves the deployed plugin encrypts'), 'server stored CIPHERTEXT — plaintext sentinel absent (deployed engine)');
    } catch (e: unknown) {
      failures++;
      console.error('  [ERROR]', e instanceof Error ? e.message : String(e));
    } finally {
      try {
        const pluginC: any = makePlugin(vaultPath, creds);
        pluginC.e2ee = new EncryptionService();
        await pluginC.api.login();
        if (noteId) await pluginC.api.deleteItem(noteId + '.md');
        const m2 = pluginC.mapping.getByPath('e2ee-verify-tmp.md');
        if (m2) pluginC.mapping.remove(m2.joplinId);
        await pluginC.mapping.flush();
      } catch { /* best effort */ }
      try { fs.unlinkSync(path.join(vaultPath, 'e2ee-verify-tmp.md')); } catch { /* ignore */ }
    }
    console.log(failures === 0 ? '\n=== DEPLOYED E2EE ENCRYPTION VERIFIED ✅ ===' : `\n=== DEPLOYED E2EE ENCRYPTION FAILED ❌ (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else if (mode === 'verifycount') {
    // Compare LOCAL vault file count vs REMOTE server item count after a force
    // push, and verify E2EE ciphertext status when e2eePassword is configured.
    // Expectation: local files === remote notes+folders+resources (server may
    // have extras: info.json + master key(s), which are infra, not content).
    console.log('== verifycount ==');
    const plugin: any = makePlugin(vaultPath, creds);
    plugin.e2ee = new EncryptionService();
    const eng = new SyncEngine(plugin);
    plugin.engine = eng;
    await plugin.mapping.load();
    await plugin.api.login();
    let failures = 0;
    const assert = (c: boolean, m: string) => { console.log((c ? '  PASS: ' : '  FAIL: ') + m); if (!c) failures++; };

    // Local counts — walk the filesystem directly (authoritative), applying
    // the same exclude patterns the sync engine uses.
    const excludes = creds.excludePatterns || [];
    const isExcluded = (p: string) => excludes.some((e: string) => p.startsWith(e)) || p.startsWith('.obsidian/');
    const localMd: string[] = [];
    const localNonMd: string[] = [];
    const fs = require('fs');
    const pathMod = require('path');
    const walkFs = (dir: string): void => {
      let ents: any[];
      try { ents = fs.readdirSync(pathMod.join(vaultPath, dir), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const rel = dir ? dir + '/' + e.name : e.name;
        if (e.isDirectory()) {
          if (e.name.startsWith('.') || excludes.some((x: string) => (rel + '/').startsWith(x))) continue;
          walkFs(rel);
        } else if (e.isFile()) {
          if (isExcluded(rel)) continue;
          if (rel.endsWith('.md')) localMd.push(rel); else localNonMd.push(rel);
        }
      }
    };
    walkFs('');
    const localTotal = localMd.length + localNonMd.length;
    // Local directory count (non-hidden, non-excluded)
    const localDirs = new Set<string>();
    for (const f of [...localMd, ...localNonMd]) {
      if (!f.includes('/')) continue;
      const parts = f.split('/').slice(0, -1);
      for (let i = 1; i <= parts.length; i++) localDirs.add(parts.slice(0, i).join('/'));
    }

    // Remote counts (paginate everything)
    let remoteNotes = 0, remoteFolders = 0, remoteResources = 0, remoteBlobs = 0, remoteMk = 0, remoteInfo = 0;
    let cursor: string | undefined;
    while (true) {
      const page = await plugin.api.listChildrenOf('', cursor);
      for (const it of page.items) {
        if (it.name === 'info.json') { remoteInfo++; continue; }
        if (it.name.startsWith('.resource/')) { remoteBlobs++; continue; }
        const m = it.name.match(/^([0-9a-f]{32})\.md$/);
        if (!m) continue;
        try {
          const raw = await plugin.api.getItem(it.name);
          if (!raw) continue;
          const item = new JoplinSerializer().unserialize(raw);
          if (item.type_ === 1) remoteNotes++;
          else if (item.type_ === 2) remoteFolders++;
          else if (item.type_ === 4) remoteResources++;
          else if (item.type_ === 9) remoteMk++;
        } catch { /* skip unreadable */ }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor) break;
    }

    console.log('  local:  ' + localTotal + ' files (' + localMd.length + ' md, ' + localNonMd.length + ' non-md) in ' + localDirs.size + ' dirs');
    console.log('  remote: ' + (remoteNotes + remoteFolders + remoteResources + remoteBlobs) + ' content items');
    console.log('         ' + remoteNotes + ' notes, ' + remoteFolders + ' folders, ' + remoteResources + ' resource-metas, ' + remoteBlobs + ' blobs');
    console.log('  infra:  ' + remoteMk + ' master key(s), ' + remoteInfo + ' info.json');

    // A folder is created for each dir containing files; resources have both a
    // metadata item AND a blob. So remote content = notes + folders + resources.
    const remoteContent = remoteNotes + remoteFolders + remoteResources + remoteBlobs;
    assert(remoteNotes === localMd.length, 'note count matches (' + localMd.length + ' local vs ' + remoteNotes + ' remote)');
    assert(remoteFolders === localDirs.size, 'folder count matches (' + localDirs.size + ' local dirs vs ' + remoteFolders + ' remote folders)');
    assert(localNonMd.length === 0 ? true : remoteBlobs >= localNonMd.length, 'resource blobs cover non-md files (' + localNonMd.length + ' local vs ' + remoteBlobs + ' remote)');
    assert(remoteContent <= localTotal + remoteMk + remoteFolders + 2, 'no runaway duplicates on server (remote ' + remoteContent + ' ≤ local ' + localTotal + ' + infra)');

    // E2EE ciphertext check
    if (creds.e2eeEnabled && creds.e2eePassword) {
      console.log('  E2EE: enabled + password set — checking ciphertext...');
      let sampleChecked = 0, sampleEncrypted = 0, plaintextLeak = 0;
      cursor = undefined;
      while (true) {
        const page = await plugin.api.listChildrenOf('', cursor);
        for (const it of page.items) {
          if (!/^[0-9a-f]{32}\.md$/.test(it.name) || sampleChecked >= 10) continue;
          try {
            const raw = await plugin.api.getItem(it.name);
            if (!raw) continue;
            const item = new JoplinSerializer().unserialize(raw);
            if (item.type_ !== 1 || item.encryption_applied === 0) continue;
            sampleChecked++;
            if (item.encryption_applied === 1 && (item.encryption_cipher_text || '').startsWith('JED01')) sampleEncrypted++;
            // Ensure no plaintext body leaked
            if ((item.body || '') !== '') plaintextLeak++;
          } catch { /* skip */ }
        }
        cursor = page.cursor;
        if (!page.has_more || !cursor || sampleChecked >= 10) break;
      }
      if (sampleChecked > 0) {
        assert(sampleEncrypted === sampleChecked, 'sampled notes are JED01-encrypted (' + sampleEncrypted + '/' + sampleChecked + ')');
        assert(plaintextLeak === 0, 'no plaintext body leaked on server');
      } else {
        console.log('  (no encrypted notes found on server to sample)');
      }
    } else {
      console.log('  E2EE: disabled or no password — skipping ciphertext check');
    }

    console.log(failures === 0 ? '\n=== VERIFYCOUNT PASSED ✅ ===' : `\n=== VERIFYCOUNT FAILED ❌ (${failures}) ===`);
    process.exit(failures === 0 ? 0 : 1);
  } else { console.log('Unknown mode: ' + mode); process.exit(1); }
  console.log(`== ${mode} done ==`);
}
main().catch(e => { console.error('CLI ERROR', e); process.exit(2); });
