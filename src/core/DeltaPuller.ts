import type JoplinSyncPlugin from '../main';
import { TFile, TAbstractFile, Notice } from 'obsidian';
import { VaultWatcher } from '../vault/VaultWatcher';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ConflictResolver } from './ConflictResolver';
import { DeltaChangeType, DeltaItem, ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { ResourceManager } from '../resource/ResourceManager';
import { safeFileName } from './pathUtil';
import { stampFrontmatter } from './FileIdentity';

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

  private parentIdMap = new Map<string, string>();

  /** Seed the parent chain from the current delta batch so belongsToRoot can
   *  walk it without relying on mapping (mapping has no parentId field). */
  private buildParentMap(items: JoplinItem[]): void {
    this.parentIdMap.clear();
    this.rootAncestorCache.clear();
    for (const it of items) if (it.parent_id) this.parentIdMap.set(it.id, it.parent_id);
  }

  private belongsToRoot(item: JoplinItem): boolean {
    if (this.acceptAll) return true;
    const rootId = this.plugin.mapping.rootFolderId;
    if (!rootId) return true;

    if (item.type_ === ModelType.Resource || item.type_ === ModelType.MasterKey) return true;

    let pid = item.parent_id;
    if (!pid) return false;
    const visited = new Set<string>();
    let depth = 0;
    while (pid && !visited.has(pid) && depth < 64) {
      visited.add(pid);
      if (pid === rootId) {
        // Cache the whole chain as ours.
        for (const v of visited) this.rootAncestorCache.set(v, true);
        return true;
      }
      const cached = this.rootAncestorCache.get(pid);
      if (cached !== undefined) {
        for (const v of visited) this.rootAncestorCache.set(v, cached);
        return cached;
      }
      // Prefer the batch's own parent graph; fall back to the local mapping
      // for folders synced in earlier rounds — the delta may contain only a
      // deep note, not its ancestors (C4).
      const next = this.parentIdMap.get(pid) ?? this.plugin.mapping.getById(pid)?.joplinId;
      if (next === undefined || next === pid) {
        for (const v of visited) this.rootAncestorCache.set(v, false);
        return false;
      }
      pid = next;
      depth++;
    }
    return false;
  }

  async pullAll(): Promise<{ created: number; updated: number; deleted: number; fail: number }> {
    const stats = { created: 0, updated: 0, deleted: 0, fail: 0 };
    const allItems: JoplinItem[] = [];
    const deletes: string[] = [];
    let cursor = this.plugin.mapping.getDeltaCursor();

    // First pass: collect all items from delta stream.
    // A 400-class failure while paging with a saved cursor means the server
    // dropped the change history (cursor invalidated). Recover by clearing the
    // cursor and forcing a full reconciliation instead of erroring forever (B26).
    while (true) {
      let page;
      try {
        page = await this.plugin.api.delta(cursor || undefined);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (cursor && /400|invalid.*cursor|cursor.*invalid|resync/i.test(msg)) {
          console.warn('[joplin-sync] delta cursor invalidated — clearing cursor for full resync: ' + msg);
          this.plugin.mapping.setDeltaCursor('');
          cursor = '';
          continue;
        }
        throw e;
      }
      if (page.has_more && !page.cursor) {
        console.error('[joplin-sync] delta returned has_more without cursor — aborting pull to avoid a loop.');
        stats.fail++;
        break;
      }
      for (const d of page.items) {
        try {
          if (d.type === DeltaChangeType.Delete) {
            const id = d.name.replace(/\.resource\//, '').replace(/\.md$/, '');
            deletes.push(id);
            continue;
          }
          const items = await this.collectChange(d);
          allItems.push(...items);
        } catch (e: unknown) {
          const isAbort = (e as Error & { __decryptAbort?: boolean })?.__decryptAbort === true;
          stats.fail++;
          console.error('[joplin-sync] collect delta failed', d.name, e);
          if (isAbort) {
            // C11: do not advance the cursor past an undecryptable item —
            // keep the pre-batch cursor so the change replays next run.
            console.error('[joplin-sync] aborting pull before cursor advance (decrypt failure)');
            this.plugin.mapping.setDeltaCursor(this.plugin.mapping.getDeltaCursor());
            return stats;
          }
        }
      }
      if (page.cursor) cursor = page.cursor;
      if (!page.has_more) break;
    }

    // Apply deletes (folders first so children are removed after their parents).
    // Mass-delete guard: a delta page reporting more deletes than half the
    // local mapping is usually a stale cursor or a foreign-vault force-push
    // rebuild. We do NOT refuse the batch (that would wedge sync forever):
    // applyDelete verifies each id against the server (404 = really gone →
    // delete locally; still present = stale replay → skip), so acting is
    // safe in both cases. We only surface a warning + user guidance.
    const totalMapped = this.plugin.mapping.all().length;
    if (totalMapped > 20 && deletes.length > totalMapped / 2) {
      console.warn('[joplin-sync] large delta delete batch: ' + deletes.length + ' deletes over ' + totalMapped
        + ' mapped items — applying with per-item server verification. '
        + 'If this is a stale cursor, deletes are skipped; if the server was force-pushed from another vault, local files are removed.');
      new Notice('Large delete batch (' + deletes.length + ') from server. Applying with verification — '
        + 'run "Force pull" if local state diverged.', 10000);
    }
    for (const id of deletes) {
      try { if (await this.applyDelete(id)) stats.deleted++; }
      catch (e) { stats.fail++; console.error('[joplin-sync] delta delete failed', id, e); }
    }

    // Seed the parent chain for belongsToRoot before applying items.
    this.buildParentMap(allItems);

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
    // Whitelist the item types this plugin understands. A shared server may
    // carry Revision/Tag/NoteTag items from other clients — they must be
    // skipped, never treated as notes (B28).
    const allowed = new Set([ModelType.Note, ModelType.Folder, ModelType.Resource, ModelType.MasterKey]);
    if (!allowed.has(probe.type_)) return [];
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
        // C11: a decrypt failure must NOT let the cursor pass this item, or
        // the change is lost forever. Signal abort via a tagged error.
        const err = new Error('E2EE decrypt failed: ' + d.name) as Error & { __decryptAbort?: boolean };
        err.__decryptAbort = true;
        throw err;
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
    await this.writeFile(path, stampFrontmatter(body, fileId));
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
      localHash: await sha256(stampFrontmatter(item.body ?? '', item.id)),
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
    // Dedupe when the path is taken by a file that is NOT this note —
    // whether mapped to another id or a user-created unmapped file (C10).
    if (existing && (!mapped || mapped.joplinId !== id)) {
      p = dir + name + ' (' + id.slice(0, 7) + ').md';
    }
    return p;
  }
}