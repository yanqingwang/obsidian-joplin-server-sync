import { TFile, Notice } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ModelType, JoplinItem } from '../api/models';
import { createJoplinId } from '../mapping/IdGenerator';
import { sha256, chunk } from './SyncEngine';
import { stampFrontmatter } from './FileIdentity';
import { safeFileName } from './pathUtil';

/**
 * First-sync = full bidirectional reconciliation, NOT "upload + jump cursor".
 *
 * A vault pointing at a server that already holds other vaults' data must
 * (1) pull every in-scope remote item to disk, (2) upload local files that
 * are not yet mapped, and only then (3) set the delta cursor. Skipping (1)
 * made a brand-new vault permanently blind to existing server content (B4).
 */
export class InitialSync {
  private serializer = new JoplinSerializer();

  constructor(private plugin: JoplinSyncPlugin) {}

  async run(rootFolderId = ''): Promise<void> {
    // 0. Pull pass: fetch every remote item and land it locally. Calls the
    //    inner (guard-free) forcePull because syncCycle already holds the
    //    running lock (C2).
    await this.plugin.engine.forcePullInner();

    // 1. Upload local files that are not yet mapped (they came from this
    //    vault and were never pushed).
    const files = this.collectMarkdownFiles();
    const unmapped = files.filter(f => !this.plugin.mapping.getByPath(f.path));

    // Always consume the delta stream so the cursor lands, even when there
    // is nothing new to upload — otherwise every cycle re-runs InitialSync (C2).
    const consumeDelta = async (): Promise<void> => {
      let cursor: string | undefined;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        if (page.has_more && !page.cursor) break;
        cursor = page.cursor;
        if (!page.has_more) break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? '');
      await this.plugin.mapping.flush();
    };

    if (unmapped.length === 0) {
      await consumeDelta();
      new Notice('Initial sync: no new local files to upload');
      return;
    }

    // 1a. Create folder hierarchy on server
    const folderMap = await this.createFolders(unmapped, rootFolderId);

    // 1b. Upload notes with correct parent_ids
    let done = 0; let fail = 0;
    if (!this.plugin.settings.syncFoldersOnly) {
      for (const batch of chunk(unmapped, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
            const parentId = folderMap.get(dir) || rootFolderId;
            await this.uploadNote(file, parentId);
            done++;
          } catch (e: unknown) {
            fail++;
            console.error('[joplin-sync] initial upload fail [' + fail + ']:', file.path, e instanceof Error ? e.message : String(e));
          }
        }));
        await this.plugin.mapping.flush();
      }
    }

    // 2. Consume delta stream to set cursor
    await consumeDelta();

    new Notice('Initial sync: ' + done + ' uploaded' + (fail ? ', ' + fail + ' failed' : ''));
  }

  private async createFolders(files: TFile[], rootFolderId: string): Promise<Map<string, string>> {
    const folderMap = new Map<string, string>();
    folderMap.set('', rootFolderId);

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
      const parent = dp.includes('/') ? (folderMap.get(dp.slice(0, dp.lastIndexOf('/'))) || rootFolderId) : rootFolderId;
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
      } catch (e: unknown) {
        console.warn('[joplin-sync] folder create skipped:', dp, e instanceof Error ? e.message : String(e));
      }
    }
    return folderMap;
  }

  private async uploadNote(file: TFile, parentId: string): Promise<void> {
    // Stable id from frontmatter — two terminals converge on the SAME server
    // item instead of minting duplicates (B16).
    const id = await this.plugin.identity.ensureId(file);
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
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
    return this.plugin.app.vault.getMarkdownFiles()
      .filter(f => !this.plugin.engine.shouldExclude(f.path));
  }
}
