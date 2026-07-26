import { TFile, Notice } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ModelType, JoplinItem } from '../api/models';
import { createJoplinId } from '../mapping/IdGenerator';
import { sha256, chunk } from './SyncEngine';

export class InitialSync {
  private serializer = new JoplinSerializer();

  constructor(private plugin: JoplinSyncPlugin) {}

  async run(): Promise<void> {
    const files = this.collectMarkdownFiles();
    if (files.length === 0) { new Notice('No markdown files to sync'); return; }

    // 1. Create folder hierarchy on server
    const folderMap = await this.createFolders(files);

    // 2. Upload all notes with correct parent_ids (skip if folders-only mode)
    let done = 0; let fail = 0;
    if (this.plugin.settings.syncFoldersOnly) {
      new Notice('Folders only mode: skipping note upload');
    } else {
    for (const batch of chunk(files, 5)) {
      await Promise.all(batch.map(async (file) => {
        try {
          const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
          const parentId = folderMap.get(dir) || '';
          await this.uploadNote(file, parentId);
          done++;
        } catch (e: any) {
          fail++;
          console.error('[joplin-sync] initial upload fail [' + fail + ']:', file.path, e?.message || e);
        }
      }));
      await this.plugin.mapping.flush();
    }
    }

    // 3. Consume delta stream to set cursor
    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.delta(cursor);
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    this.plugin.mapping.setDeltaCursor(cursor ?? '');
    await this.plugin.mapping.flush();

    new Notice('Initial sync: ' + done + ' uploaded' + (fail ? ', ' + fail + ' failed' : ''));
  }

  private async createFolders(files: TFile[]): Promise<Map<string, string>> {
    const folderMap = new Map<string, string>();
    folderMap.set('', ''); // root = Joplin root

    const dirs = new Set<string>();
    for (const f of files) {
      const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
      if (!d) continue;
      const parts = d.split('/');
      let accumulated = '';
      for (let i = 0; i < parts.length; i++) {
        accumulated = accumulated ? accumulated + '/' + parts[i] : parts[i];
        if (!folderMap.has(accumulated)) {
          const existing = this.plugin.mapping.getByPath(accumulated + '/');
          if (existing) { folderMap.set(accumulated, existing.joplinId); continue; }
          dirs.add(accumulated);
        }
      }
    }

    for (const dp of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)) {
      const parent = dp.includes('/') ? (folderMap.get(dp.slice(0, dp.lastIndexOf('/'))) || '') : '';
      const fid = createJoplinId();
      const title = dp.split('/').pop() || dp;
      const item: JoplinItem = {
        id: fid, parent_id: parent, title, type_: ModelType.Folder,
        created_time: Date.now(), updated_time: Date.now(),
        user_created_time: Date.now(), user_updated_time: Date.now(),
        encryption_applied: 0, encryption_cipher_text: '',
      };
      try {
        const st = await this.plugin.api.putItem(fid + '.md', this.serializer.serialize(item), true);
        if (st && st.id) {
          this.plugin.mapping.upsert({
            joplinId: fid, path: dp + '/', type: ModelType.Folder,
            localHash: '', remoteUpdatedTime: st.updated_time || Date.now(), syncedAt: Date.now(),
          });
          folderMap.set(dp, fid);
        }
      } catch (e) {
        console.warn('[joplin-sync] folder create skipped:', dp, (e as any)?.message || e);
      }
    }
    return folderMap;
  }

  private async uploadNote(file: TFile, parentId: string): Promise<void> {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const id = createJoplinId();
    const now = Date.now();
    const item: JoplinItem = {
      id, parent_id: parentId, title: file.basename, body: content,
      created_time: file.stat.ctime, updated_time: now,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Note, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    };
    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item), true);
    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: res.updated_time || now, syncedAt: now,
    });
  }

  private collectMarkdownFiles(): TFile[] {
    const excludes = this.plugin.settings.excludePatterns;
    return this.plugin.app.vault.getMarkdownFiles()
      .filter(f => !excludes.some(p => f.path.startsWith(p)));
  }
}
