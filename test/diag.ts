import { JoplinServerApi } from '../src/api/JoplinServerApi';
import { JoplinSerializer } from '../src/convert/JoplinSerializer';
import { ModelType } from '../src/api/models';

const api = new JoplinServerApi(() => ({
  baseUrl: 'https://joplin.8.130.118.200.sslip.io/',
  email: '289@qq.com',
  password: 'gcJG.<|QU6"`',
}));

async function main() {
  await api.login();
  console.log('logged in');

  // 1. list all items
  const names: string[] = [];
  let cursor: string | undefined;
  while (true) {
    const page = await api.listChildren(cursor);
    for (const it of page.items) names.push(it.name);
    cursor = page.cursor;
    if (!page.has_more) break;
  }
  console.log('total items on server:', names.length);

  const noteNames = names.filter(n => /^[0-9a-f]{32}\.md$/.test(n));
  const resourceNames = names.filter(n => n.startsWith('.resource/'));
  console.log('notes:', noteNames.length, 'resources:', resourceNames.length);

  // 2. fetch each note, unserialize, build folder map
  const serializer = new JoplinSerializer();
  const folders = new Map<string, { id: string; title: string; parent_id: string; path: string }>();
  const notes: { id: string; title: string; parent_id: string; path: string }[] = [];

  let done = 0;
  const B = 8;
  for (let i = 0; i < noteNames.length; i += B) {
    const batch = noteNames.slice(i, i + B);
    await Promise.all(batch.map(async (n) => {
      try {
        const raw = await api.getItem(n);
        if (!raw) return;
        const it = serializer.unserialize(raw);
        const o = { id: it.id, title: (it.title as string) || '', parent_id: (it.parent_id as string) || '', path: '' };
        if (Number(it.type_) === ModelType.Folder) folders.set(o.id, { ...o, path: '' });
        else if (Number(it.type_) === ModelType.Note) notes.push(o);
      } catch (e) { /* ignore */ }
    }));
    done += batch.length;
  }

  // 3. compute folder paths from parent chains
  const folderPath = (id: string, seen = new Set<string>()): string => {
    if (!id) return '';
    const f = folders.get(id);
    if (!f) return '';
    if (seen.has(id)) return '';
    seen.add(id);
    const parent = folderPath(f.parent_id, seen);
    return parent + f.title + '/';
  };
  for (const f of folders.values()) f.path = folderPath(f.id);
  for (const n of notes) n.path = folderPath(n.parent_id) + n.title + '.md';

  // 4. anomalies
  const folderPaths = [...folders.values()].map(f => f.path);
  const dupFolders = folderPaths.filter((p, i) => folderPaths.indexOf(p) !== i);
  const notesMissingFolder = notes.filter(n => n.parent_id && !folders.has(n.parent_id));
  const notePaths = notes.map(n => n.path);
  const dupNotes = notePaths.filter((p, i) => notePaths.indexOf(p) !== i);

  console.log('folders:', folders.size);
  console.log('DUPLICATE folder paths on server:', [...new Set(dupFolders)].length, [...new Set(dupFolders)].slice(0, 20));
  console.log('notes with MISSING parent folder:', notesMissingFolder.length);
  console.log('DUPLICATE note paths on server:', [...new Set(dupNotes)].length, [...new Set(dupNotes)].slice(0, 20));

  // 5. compare server folder paths vs test/ folder paths
  const fs = require('fs'); const path = require('path');
  const testFolders = new Set<string>();
  const rec = (dir: string) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === '.obsidian') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { testFolders.add(path.relative('/home/wang/文档/test', full).split(path.sep).join('/') + '/'); rec(full); }
    }
  };
  rec('/home/wang/文档/test');
  const serverFolderSet = new Set(folderPaths);
  const missingOnServer = [...testFolders].filter(p => !serverFolderSet.has(p));
  const extraOnServer = [...serverFolderSet].filter(p => p && !testFolders.has(p));
  console.log('\ntest/ folder count:', testFolders.size, '| server folder count:', serverFolderSet.size);
  console.log('folders in test/ but NOT on server:', missingOnServer.length, missingOnServer.slice(0, 30));
  console.log('folders on server but NOT in test/:', extraOnServer.length, extraOnServer.slice(0, 30));
}
main().catch(e => { console.error('DIAG ERROR', e); process.exit(2); });
