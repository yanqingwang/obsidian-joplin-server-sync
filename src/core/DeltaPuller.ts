import type JoplinSyncPlugin from '../main';
import { TFile, TAbstractFile } from 'obsidian';
import { VaultWatcher } from '../vault/VaultWatcher';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ConflictResolver } from './ConflictResolver';
import { DeltaChangeType, DeltaItem, ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { ResourceManager } from '../resource/ResourceManager';
import { safeFileName } from './pathUtil';

export class DeltaPuller {
  private serializer = new JoplinSerializer();
  private conflicts: ConflictResolver;
  private resources: ResourceManager;
  private rootAncestorCache = new Map<string, boolean>();
  acceptAll = false;
  private folderPathCache = new Map<string, string>(); // item_id → full path

  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {
    this.conflicts = new ConflictResolver(plugin, watcher);
    this.resources = new ResourceManager(plugin);
  }

  private belongsToRoot(item: JoplinItem): boolean {
    if (this.acceptAll) return true;
    const rootId = this.plugin.mapping.rootFolderId;
    if (!rootId) return true; // no root folder → accept everything (legacy data)

    // Walk the parent chain to the root. The root folder of THIS vault is the
    // only ancestor that makes an item ours; anything under another vault's
    // root (or at the account root) is foreign and must not be pulled.
    let pid = item.parent_id;
    const visited = new Set<string>();
    let depth = 0;
    while (pid && !visited.has(pid) && depth < 64) {
      visited.add(pid);
      if (pid === rootId) return true;
      const parentMapping = this.plugin.mapping.getById(pid);
      if (!parentMapping) return false; // parent unknown = foreign item
      if (parentMapping.type !== ModelType.Folder) return false;
      pid = parentMapping.joplinId;
      depth++;
    }
    return false;
  }

  async pullAll(): Promise<{ created: number; updated: number; deleted: number; fail: number }> {
    let cursor = this.plugin.mapping.getDeltaCursor();
    const allItems: JoplinItem[] = [];
    const stats = { created: 0, updated: 0, deleted: 0, fail: 0 };
    const deletes: string[] = [];

    // First pass: collect all items from delta stream
    while (true) {
      const page = await this.plugin.api.delta(cursor || undefined);
      for (const d of page.items) {
        try {
          if (d.type === DeltaChangeType.Delete) {
            const id = d.name.replace(/\.resource\//, '').replace(/\.md$/, '');
            deletes.push(id);
            continue;
          }
          const items = await this.collectChange(d);
          allItems.push(...items);
        } catch (e) {
          stats.fail++;
          console.error('[joplin-sync] collect delta failed', d.name, e);
        }
      }
      if (page.cursor) cursor = page.cursor;
      if (!page.has_more) break;
    }

    // Apply deletes (folders first so children are removed after their parents).
    // Guard: a delta page that reports more deletes than half the local mapping
    // is almost certainly a stale cursor or foreign-vault replay, not a real
    // mass deletion. Refuse to act on it — individual deletes are still
    // server-verified in applyDelete, but skipping the batch avoids hundreds
    // of GET round-trips on a replay storm.
    const totalMapped = this.plugin.mapping.all().length;
    if (totalMapped > 20 && deletes.length > totalMapped / 2) {
      console.error('[joplin-sync] refusing ' + deletes.length + ' delta deletes over ' + totalMapped
        + ' mapped items — possible stale cursor or foreign vault. Skipping this batch.');
      stats.fail += deletes.length;
      deletes.length = 0;
    }
    for (const id of deletes) {
      try { if (await this.applyDelete(id)) stats.deleted++; }
      catch (e) { stats.fail++; console.error('[joplin-sync] delta delete failed', id, e); }
    }

    // Second pass: build folder path cache, then process folders then notes
    const folders = allItems.filter(i => i.type_ === ModelType.Folder);
    const notes = allItems.filter(i => i.type_ === ModelType.Note);
    const resources = allItems.filter(i => i.type_ === ModelType.Resource);

    // Pre-compute all folder paths from the collected items (no mapping dependency)
    this.buildFolderPaths(folders);

    for (const f of folders) {
      try { if (await this.applyFolder(f)) stats.created++; else stats.updated++; }
      catch (e) { stats.fail++; console.error('[joplin-sync] folder apply failed', f.title, e); }
    }

    if (!this.plugin.settings.syncFoldersOnly) {
      for (const n of notes) {
        try { if (await this.applyNote(n)) stats.created++; else stats.updated++; }
        catch (e) { stats.fail++; console.error('[joplin-sync] note apply failed', n.title, e); }
      }
    }
    for (const r of resources) {
      try { await this.applyResource(r); stats.created++; }
      catch (e) { stats.fail++; console.error('[joplin-sync] resource apply failed', r.id, e); }
    }

    this.plugin.mapping.setDeltaCursor(cursor ?? '');
    return stats;
  }

  /** Download a delta item and return fully unserialized JoplinItems it contains */
  private async collectChange(d: DeltaItem): Promise<JoplinItem[]> {
    // Handle resource blob items
    if (d.name.startsWith('.resource/')) {
      if (d.type === DeltaChangeType.Delete) { await this.applyDelete(d.name.replace('.resource/', '')); return []; }
      return [];
    }
    if (!/^[0-9a-f]{32}\.md$/.test(d.name)) return [];
    const id = d.name.slice(0, 32);
    if (d.type === DeltaChangeType.Delete) { await this.applyDelete(id); return []; }

    const raw = await this.plugin.api.getItem(d.name);
    if (raw === null) return [];

    const e2ee = this.plugin.e2ee;
    const probe = this.serializer.unserialize(raw);
    if (probe.type_ === ModelType.MasterKey) { e2ee.feedMasterKey(probe); return []; }

    const item = this.serializer.unserialize(raw);
    item.updated_time = d.jop_updated_time ?? item.updated_time;

    // E2EE: attempt decryption
    if (e2ee.isEncrypted(item)) {
      try {
        const decryptedBody = await e2ee.decryptItem(item);
        if (decryptedBody !== null) {
          const decrypted = this.serializer.unserialize(decryptedBody);
          decrypted.updated_time = item.updated_time;
          if (!this.belongsToRoot(decrypted)) return [];
          return [decrypted];
        }
      } catch (e: unknown) {
        console.warn('[joplin-sync] E2EE decrypt failed for ' + d.name + ': ' + (e instanceof Error ? e.message : String(e)));
        return [];
      }
    }

    if (!this.belongsToRoot(item)) return [];
    return [item];
  }

  private async applyNote(item: JoplinItem): Promise<boolean> {
    const mapping = this.plugin.mapping.getById(item.id);
    const targetDir = this.resolveFolderPath(item.parent_id);
    const targetPath = this.uniquePath(targetDir, this.sanitize(item.title), item.id);

    if (!mapping) {
      await this.writeNoteWithId(targetPath, item.body ?? '', item.id);
      await this.saveMapping(item, targetPath);
      return true;
    }
    if (item.updated_time <= mapping.remoteUpdatedTime) return false;

    const localFile = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    const localContent = localFile instanceof TFile ? await this.plugin.app.vault.read(localFile) : null;
    const localChanged = localContent !== null && (await sha256(localContent)) !== mapping.localHash;

    if (localChanged) {
      await this.conflicts.resolve(mapping, item, localContent, targetPath);
      return false;
    }

    if (mapping.path !== targetPath && localFile) {
      this.watcher.suppress(mapping.path); this.watcher.suppress(targetPath);
      await this.plugin.app.vault.rename(localFile, targetPath);
      this.watcher.release(mapping.path); this.watcher.release(targetPath);
    }
    await this.writeNoteWithId(targetPath, item.body ?? '', item.id);
    await this.saveMapping(item, targetPath);
    return false;
  }

  /** Write a note, stamping the server item id as frontmatter fileId so other
   *  terminals reading this file converge on the same identity. */
  private async writeNoteWithId(path: string, body: string, fileId: string): Promise<void> {
    const stamped = this.stampFrontmatter(body, fileId);
    await this.writeFile(path, stamped);
  }

  private stampFrontmatter(body: string, fileId: string): string {
    const line = 'joplin-file-id: ' + fileId;
    if (body.startsWith('---')) {
      const end = body.indexOf('\n---', 4);
      if (end >= 0) {
        const fm = body.slice(0, end + 1);
        const rest = body.slice(end + 1);
        const re = /^joplin-file-id:.*$/m;
        return re.test(fm) ? fm.replace(re, line) + rest : fm + '\n' + line + rest;
      }
    }
    return '---\n' + line + '\n---\n' + body;
  }

  private async applyFolder(item: JoplinItem): Promise<boolean> {
    const parentPath = this.resolveFolderPath(item.parent_id);
    const path = parentPath + this.sanitize(item.title) + '/';
    const mapping = this.plugin.mapping.getById(item.id);
    const dirPath = path.replace(/\/$/, '');
    const isNew = !this.plugin.app.vault.getAbstractFileByPath(dirPath);
    if (isNew) {
      // Ensure parent directory exists first
      if (parentPath && !this.plugin.app.vault.getAbstractFileByPath(parentPath.replace(/\/$/, ''))) {
        this.watcher.suppress(parentPath.replace(/\/$/, ''));
        try { await this.plugin.app.vault.createFolder(parentPath.replace(/\/$/, '')); } catch {/* empty */}
        this.watcher.release(parentPath.replace(/\/$/, ''));
      }
      this.watcher.suppress(dirPath);
      await this.plugin.app.vault.createFolder(dirPath).catch(() => {});
      this.watcher.release(dirPath);
    }
    if (mapping && mapping.path !== path) {
      const oldDir = mapping.path.replace(/\/$/, '');
      const f = this.plugin.app.vault.getAbstractFileByPath(oldDir);
      if (f) {
        this.watcher.suppress(oldDir); this.watcher.suppress(dirPath);
        await this.plugin.app.vault.rename(f, dirPath);
        this.watcher.release(oldDir); this.watcher.release(dirPath);
      }
      this.plugin.mapping.renamePrefix(mapping.path, path);
    }
    this.plugin.mapping.upsert({
      joplinId: item.id, path, type: ModelType.Folder,
      localHash: '', remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
    });
    return isNew;
  }

  private async applyDelete(id: string): Promise<boolean> {
    const mapping = this.plugin.mapping.getById(id);
    if (!mapping) return false;

    // Stale delta cursors replay Delete events for items that still exist
    // locally (account reset, or a second vault on the same account). Only
    // delete locally when the server confirms the item is really gone.
    try {
      const stillThere = await this.plugin.api.getItem(id + '.md');
      if (stillThere !== null) {
        console.warn('[joplin-sync] skip local delete for ' + mapping.path
          + ': server still has item ' + id + ' (stale cursor or foreign vault)');
        return false;
      }
    } catch (e: unknown) {
      console.warn('[joplin-sync] delete verification failed for ' + id + ', skipping local delete: '
        + (e instanceof Error ? e.message : String(e)));
      return false;
    }

    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path.replace(/\/$/, ''));
    if (f) {
      this.watcher.suppress(f.path);
      if (f instanceof TFile) {
        const fm = this.plugin.app.fileManager;
        if (fm?.trashFile) await fm.trashFile(f).catch(() => {});
        else await (this.plugin.app.vault as unknown as { remove: (x: TAbstractFile) => Promise<void> }).remove(f).catch(() => {});
      } else if ('remove' in this.plugin.app.vault) {
        await (this.plugin.app.vault as unknown as { remove: (file: TAbstractFile) => Promise<void> }).remove(f).catch(() => {});
      }
      this.watcher.release(f.path);
    }
    this.plugin.mapping.remove(id);
    return true;
  }

  private async writeFile(path: string, content: string): Promise<void> {
    this.watcher.suppress(path);
    try {
      // Ensure parent directory exists
      const parentDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (parentDir && !this.plugin.app.vault.getAbstractFileByPath(parentDir)) {
        try { await this.plugin.app.vault.createFolder(parentDir); } catch {/* empty */}
      }
      const existing = this.plugin.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.plugin.app.vault.modify(existing, content);
      else await this.plugin.app.vault.create(path, content);
    } finally {
      this.watcher.release(path);
    }
  }

  private async saveMapping(item: JoplinItem, path: string): Promise<void> {
    this.plugin.mapping.upsert({
      joplinId: item.id, path, type: ModelType.Note,
      localHash: await sha256(item.body ?? ''),
      remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
    });
  }

  private async applyResource(item: JoplinItem): Promise<void> {
    try {
      await this.resources.downloadResource(item);
    } catch (e) {
      console.error('[joplin-sync] download resource failed: ' + item.id, e);
    }
  }

  private resolveFolderPath(parentId: string): string {
    if (!parentId) return '';
    // Check folder path cache first (built from current delta batch)
    const cached = this.folderPathCache.get(parentId);
    if (cached !== undefined) return cached;
    // Fall back to mapping
    const m = this.plugin.mapping.getById(parentId);
    return m ? m.path : '';
  }

  /** Pre-compute folder paths from delta items (no mapping dependency) */
  private buildFolderPaths(folders: JoplinItem[]): void {
    this.folderPathCache.clear();
    // Build path for root-level folders first, then recursively for children
    const sanitize = (t: string) => safeFileName(t);
    const known = new Map<string, string>(); // id → sanitized title
    for (const f of folders) known.set(f.id, sanitize(f.title || ''));

    // Iterative: resolve paths in multiple passes until stable
    const paths = new Map<string, string>();
    let remaining = [...folders];
    while (remaining.length > 0) {
      const next: JoplinItem[] = [];
      for (const f of remaining) {
        const parentPath = f.parent_id ? paths.get(f.parent_id) : '';
        if (f.parent_id && parentPath === undefined) { next.push(f); continue; }
        paths.set(f.id, (parentPath || '') + sanitize(f.title || '') + '/');
      }
      if (next.length === remaining.length) break; // can't resolve orphans
      remaining = next;
    }
    // Store in cache
    for (const [id, p] of paths) this.folderPathCache.set(id, p);
  }

  private sanitize(title: string): string {
    return safeFileName(title);
  }

  private uniquePath(dir: string, name: string, id: string): string {
    let p = dir + name + '.md';
    const existing = this.plugin.app.vault.getAbstractFileByPath(p);
    const mapped = this.plugin.mapping.getByPath(p);
    if (existing && mapped && mapped.joplinId !== id) {
      p = dir + name + ' (' + id.slice(0, 7) + ').md';
    }
    return p;
  }
}