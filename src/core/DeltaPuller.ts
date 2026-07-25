import type JoplinSyncPlugin from '../main';
import { TFile } from 'obsidian';
import { VaultWatcher } from '../vault/VaultWatcher';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { ConflictResolver } from './ConflictResolver';
import { DeltaChangeType, DeltaItem, ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';

export class DeltaPuller {
  private serializer = new JoplinSerializer();
  private conflicts: ConflictResolver;

  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {
    this.conflicts = new ConflictResolver(plugin, watcher);
  }

  async pullAll(): Promise<void> {
    let cursor = this.plugin.mapping.getDeltaCursor();
    const pendingNotes: JoplinItem[] = [];

    while (true) {
      const page = await this.plugin.api.delta(cursor || undefined);
      for (const d of page.items) {
        try {
          await this.applyChange(d, pendingNotes);
        } catch (e) {
          console.error('[joplin-sync] apply delta failed', d.name, e);
        }
      }
      if (page.cursor) cursor = page.cursor;
      if (!page.has_more) break;
    }

    for (const note of pendingNotes) await this.applyNote(note);
    this.plugin.mapping.setDeltaCursor(cursor ?? '');
  }

  private async applyChange(d: DeltaItem, pendingNotes: JoplinItem[]): Promise<void> {
    if (d.name.startsWith('.resource/')) return;
    if (!/^[0-9a-f]{32}\.md$/.test(d.name)) return;
    const id = d.name.slice(0, 32);
    if (d.type === DeltaChangeType.Delete) return this.applyDelete(id);

    const raw = await this.plugin.api.getItem(d.name);
    if (raw === null) return;
    const item = this.serializer.unserialize(raw);
    item.updated_time = d.jop_updated_time ?? item.updated_time;

    switch (item.type_) {
      case ModelType.Folder: return this.applyFolder(item);
      case ModelType.Note: {
        if (item.parent_id && !this.plugin.mapping.getById(item.parent_id)) {
          pendingNotes.push(item);
          return;
        }
        return this.applyNote(item);
      }
      case ModelType.Resource: return;
      case ModelType.Tag:
      case ModelType.NoteTag: return;
    }
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
      await this.plugin.app.vault.trash(f, true);
      this.watcher.release(f.path);
    }
    this.plugin.mapping.remove(id);
  }

  private async writeFile(path: string, content: string): Promise<void> {
    this.watcher.suppress(path);
    try {
      const existing = this.plugin.app.vault.getAbstractFileByPath(path);
      if (existing) await this.plugin.app.vault.modify(existing as TFile, content);
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