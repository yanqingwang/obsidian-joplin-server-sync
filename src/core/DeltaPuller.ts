import type JoplinSyncPlugin from '../main';
import { TFile, Notice } from 'obsidian';
import { VaultWatcher } from '../vault/VaultWatcher';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ConflictResolver } from './ConflictResolver';
import { DeltaChangeType, DeltaItem, ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { ResourceManager } from '../resource/ResourceManager';

export class DeltaPuller {
  private serializer = new JoplinSerializer();
  private conflicts: ConflictResolver;
  private resources: ResourceManager;
  private rootAncestorCache = new Map<string, boolean>();
  acceptAll = false; // set to true by forcePull to skip root folder filtering

  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {
    this.conflicts = new ConflictResolver(plugin, watcher);
    this.resources = new ResourceManager(plugin);
  }

  private belongsToRoot(item: JoplinItem): boolean {
    if (this.acceptAll) return true;
    const rootId = this.plugin.mapping.rootFolderId;
    if (!rootId) return true; // no root folder → accept everything (cursor filters stale data)
    const hasFolders = this.plugin.mapping.all().some(e => e.type === 2);
    if (!hasFolders) return true;

    let pid = item.parent_id;
    const visited = new Set<string>();
    while (pid && !visited.has(pid)) {
      visited.add(pid);
      if (pid === rootId) return true;
      const parentMapping = this.plugin.mapping.getById(pid);
      if (!parentMapping) return false; // parent not in mapping = foreign
      pid = parentMapping.joplinId; // walk up... but this is the same as pid for folder entries
      break; // simplified: one level check
    }
    return false;
  }

  async pullAll(): Promise<{ ok: number; fail: number }> {
    let cursor = this.plugin.mapping.getDeltaCursor();
    const allItems: JoplinItem[] = [];
    let ok = 0; let fail = 0;

    // First pass: collect all items from delta stream
    while (true) {
      const page = await this.plugin.api.delta(cursor || undefined);
      for (const d of page.items) {
        try {
          const items = await this.collectChange(d);
          allItems.push(...items);
          ok++;
        } catch (e) {
          fail++;
          console.error('[joplin-sync] collect delta failed', d.name, e);
        }
      }
      if (page.cursor) cursor = page.cursor;
      if (!page.has_more) break;
    }

    // Second pass: process folders first (sorted by depth), then notes
    const folders = allItems.filter(i => i.type_ === ModelType.Folder)
      .sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0) || (a.title || '').localeCompare(b.title || ''));
    const notes = allItems.filter(i => i.type_ === ModelType.Note);
    const resources = allItems.filter(i => i.type_ === ModelType.Resource);

    for (const f of folders) { try { await this.applyFolder(f); } catch (e) { fail++; console.error('[joplin-sync] folder apply failed', f.title, e); } }
    for (const n of notes) { try { await this.applyNote(n); } catch (e) { fail++; console.error('[joplin-sync] note apply failed', n.title, e); } }
    for (const r of resources) { try { await this.applyResource(r); } catch (e) { fail++; console.error('[joplin-sync] resource apply failed', r.id, e); } }

    this.plugin.mapping.setDeltaCursor(cursor ?? '');
    return { ok, fail };
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
    if (probe.type_ === 9) { e2ee.feedMasterKey(probe); return []; }

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
      } catch (e: any) {
        console.warn('[joplin-sync] E2EE decrypt failed for ' + d.name + ': ' + e.message);
        return [];
      }
    }

    if (!this.belongsToRoot(item)) return [];
    return [item];
  }

  private async applyNote(item: JoplinItem): Promise<void> {
    const mapping = this.plugin.mapping.getById(item.id);
    const targetDir = this.resolveFolderPath(item.parent_id);
    const targetPath = this.uniquePath(targetDir, this.sanitize(item.title), item.id);

    if (!mapping) {
      await this.writeFile(targetPath, item.body ?? '');
      await this.saveMapping(item, targetPath);
      return;
    }
    if (item.updated_time <= mapping.remoteUpdatedTime) return;

    const localFile = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    const localContent = localFile ? await this.plugin.app.vault.read(localFile as TFile) : null;
    const localChanged = localContent !== null && (await sha256(localContent)) !== mapping.localHash;

    if (localChanged) {
      await this.conflicts.resolve(mapping, item, localContent!, targetPath);
      return;
    }

    if (mapping.path !== targetPath && localFile) {
      this.watcher.suppress(mapping.path); this.watcher.suppress(targetPath);
      await this.plugin.app.vault.rename(localFile, targetPath);
      this.watcher.release(mapping.path); this.watcher.release(targetPath);
    }
    await this.writeFile(targetPath, item.body ?? '');
    await this.saveMapping(item, targetPath);
  }

  private async applyFolder(item: JoplinItem): Promise<void> {
    const parentPath = this.resolveFolderPath(item.parent_id);
    const path = parentPath + this.sanitize(item.title) + '/';
    const mapping = this.plugin.mapping.getById(item.id);
    const dirPath = path.replace(/\/$/, '');
    if (!this.plugin.app.vault.getAbstractFileByPath(dirPath)) {
      // Ensure parent directory exists first
      if (parentPath && !this.plugin.app.vault.getAbstractFileByPath(parentPath.replace(/\/$/, ''))) {
        this.watcher.suppress(parentPath.replace(/\/$/, ''));
        try { await this.plugin.app.vault.createFolder(parentPath.replace(/\/$/, '')); } catch {}
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
  }

  private async applyDelete(id: string): Promise<void> {
    const mapping = this.plugin.mapping.getById(id);
    if (!mapping) return;
    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path.replace(/\/$/, ''));
    if (f) {
      this.watcher.suppress(f.path);
      if (f instanceof TFile) {
        this.plugin.app.fileManager.trashFile(f).catch(() => {});
      }
      this.watcher.release(f.path);
    }
    this.plugin.mapping.remove(id);
  }

  private async writeFile(path: string, content: string): Promise<void> {
    this.watcher.suppress(path);
    try {
      // Ensure parent directory exists
      const parentDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (parentDir && !this.plugin.app.vault.getAbstractFileByPath(parentDir)) {
        try { await this.plugin.app.vault.createFolder(parentDir); } catch {}
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
    const m = this.plugin.mapping.getById(parentId);
    return m ? m.path : '';
  }

  private sanitize(title: string): string {
    return title.replace(/[\\/:*?"<>|#^[\]]/g, '_').trim() || 'Untitled';
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