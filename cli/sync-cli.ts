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

function loadCreds(vaultPath: string) {
  const p = path.join(vaultPath, '.obsidian/plugins/joplin-server-sync/data.json');
  if (!fs.existsSync(p)) throw new Error('No plugin config found at ' + p + ' — deploy the plugin first.');
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    serverUrl: d.serverUrl, email: d.email, password: d.password,
    attachmentFolder: d.attachmentFolder || 'attachments',
    excludePatterns: d.excludePatterns || [],
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
    settings: { ...DEFAULT_SETTINGS, attachmentFolder: creds.attachmentFolder, excludePatterns: creds.excludePatterns },
    manifest: { dir: path.join(vaultRoot, '.obsidian/plugins/joplin-server-sync') },
    statusBar: {
      setSyncing(m: string) { console.log('  [status]', m); },
      setProgress() {}, setIdle() {}, setOk() {}, setError(e: string) { console.log('  [ERROR]', e); },
    },
    logSync() {},
    e2ee: { feedMasterKey() {}, isEncrypted() { return false; }, decryptItem() { return null; } },
  };
  plugin.mapping = new MappingStore(plugin);
  return plugin;
}

async function main() {
  const [mode, vaultPath] = process.argv.slice(2);
  if (!mode || !vaultPath) {
    console.log('Usage: node cli/sync-cli.js <push|pull|sync|diag> <vaultPath>');
    process.exit(1);
  }
  const creds = loadCreds(vaultPath);
  setVaultRoot(vaultPath);
  const plugin = makePlugin(vaultPath, creds);
  await plugin.mapping.load();
  const engine = new SyncEngine(plugin);
  console.log(`== ${mode} on ${vaultPath} ==`);
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
  } else { console.log('Unknown mode: ' + mode); process.exit(1); }
  console.log(`== ${mode} done ==`);
}
main().catch(e => { console.error('CLI ERROR', e); process.exit(2); });
