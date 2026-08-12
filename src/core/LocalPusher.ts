import { TFile, TFolder } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { ChangeLogStore, ChangeLogEntry } from './ChangeLogStore';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { createJoplinId } from '../mapping/IdGenerator';
import { ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { ResourceManager } from '../resource/ResourceManager';
import { ConflictResolver } from './ConflictResolver';

export class LocalPusher {
  private serializer = new JoplinSerializer();
  private resources: ResourceManager;

  constructor(private plugin: JoplinSyncPlugin, private changeLog: ChangeLogStore) {
    this.resources = new ResourceManager(plugin);
  }

  async pushAll(): Promise<{ created: number; updated: number; deleted: number; fail: number }> {
    const changes = this.changeLog.pending();
    const stats = { created: 0, updated: 0, deleted: 0, fail: 0 };
    const failed: ChangeLogEntry[] = [];
    for (const change of changes) {
      try {
        const op = await this.pushOne(change);
        if (op === 'create') stats.created++;
        else if (op === 'update') stats.updated++;
        else if (op === 'delete') stats.deleted++;
        this.changeLog.markSynced(change.fileId);
      } catch (e) {
        console.error('[joplin-sync] push failed: ' + change.path, e);
        stats.fail++;
        failed.push(change);
      }
    }
    return stats;
  }

  private async pushOne(c: ChangeLogEntry): Promise<'create' | 'update' | 'delete' | 'none'> {
    switch (c.op) {
      case 'create': return this.upsertItem(c.path, c.fileId);
      case 'update': return this.upsertItem(c.path, c.fileId);
      case 'delete': return this.deleteItem(c.path, c.fileId, c.type === ModelType.Folder);
      case 'rename': return this.renameItem(c.oldPath!, c.path, c.fileId, c.type === ModelType.Folder);
    }
  }

  private async upsertItem(path: string, fileId: string, force = false): Promise<'create' | 'update' | 'none'> {
    const af = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!af) return 'none';
    if (af instanceof TFolder) { await this.ensureFolderChain(path + '/'); return 'create'; }
    if (!(af instanceof TFile)) return 'none';
    // Non-md file: upload as resource
    if (af.extension !== 'md') {
      await this.resources.uploadResource(af);
      return 'create';
    }

    const parentPath = (af.parent && af.parent.path && af.parent.path !== '/') ? af.parent.path + '/' : (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) + '/' : '');
    const parentId = await this.ensureFolderChain(parentPath || '');
    const content = await this.plugin.app.vault.read(af);
    const hash = await sha256(content);
    // Mapping keyed by the stable fileId — NOT the path — so a rename or a
    // second terminal creating the same file converges on the same joplinId.
    const existing = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(path);
    // Content unchanged AND same parent/title → nothing to push. A move or
    // rename leaves content identical but changes parent_id/title, which the
    // server must reflect — so only skip when the mapped path also matches.
    if (!force && existing && existing.localHash === hash && existing.path === path) return 'none';

    const isNew = !existing;
    const id = existing?.joplinId ?? fileId;
    let base: Partial<JoplinItem> = {};
    if (existing) {
      const remote = await this.plugin.api.getItem(id + '.md');
      if (remote) base = this.serializer.unserialize(remote);
      // C7: the server copy is NEWER than our last sync AND our local content
      // changed — both sides edited. Resolve instead of silently overwriting
      // the remote (the old code made ConflictResolver unreachable).
      const remoteTime = (base as JoplinItem).updated_time ?? 0;
      if (!force && remoteTime > existing.remoteUpdatedTime && existing.localHash !== hash) {
        const watcher = this.plugin.engine.watcher;
        const resolver = new ConflictResolver(this.plugin, watcher);
        await resolver.resolve(existing, base as JoplinItem, content, path);
        return 'none';
      }
    }

    const item: JoplinItem = {
      ...base,
      id, parent_id: parentId,
      title: af.basename,
      body: content,
      created_time: base.created_time ?? af.stat.ctime,
      updated_time: Date.now(),
      user_created_time: base.user_created_time ?? af.stat.ctime,
      user_updated_time: af.stat.mtime,
      type_: ModelType.Note,
      encryption_applied: 0, encryption_cipher_text: '',
      markup_language: 1,
    };

    // E2EE: encrypt if keys are loaded and target has E2EE enabled.
    // If E2EE is active but no key is loaded (password not entered yet),
    // uploading plaintext would silently downgrade the sync target — fail
    // hard instead (B24).
    const e2ee = this.plugin.e2ee;
    const mkId = e2ee.firstLoadedKeyId;
    if (this.plugin.engine.e2eeActive && !mkId) {
      throw new Error('E2EE is enabled but no master key is loaded. Enter the E2EE password in settings first.');
    }
    if (mkId && this.plugin.engine.e2eeActive) {
      const serialized = this.serializer.serialize(item);
      const encryptedCt = await e2ee.encryptItem(serialized, mkId);
      const cipherItem: JoplinItem = {
        id, parent_id: parentId, title: '',
        body: '',
        created_time: item.created_time, updated_time: item.updated_time,
        user_created_time: item.user_created_time, user_updated_time: item.user_updated_time,
        type_: ModelType.Note,
        encryption_applied: 1, encryption_cipher_text: encryptedCt,
        markup_language: 1,
      };
      const cipherSerialized = this.serializer.serialize(cipherItem);
      const res = await this.plugin.api.putItem(id + '.md', cipherSerialized);
      this.plugin.mapping.upsert({
        joplinId: id, path, type: ModelType.Note,
        localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: Date.now(),
      });
      return isNew ? 'create' : 'update';
    }

    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: Date.now(),
    });
    return isNew ? 'create' : 'update';
  }

  private async deleteItem(path: string, fileId: string, isFolder: boolean): Promise<'delete' | 'none'> {
    const key = isFolder ? path + '/' : path;
    const entry = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(key);
    if (!entry) return 'none';

    // Folder delete: recursively delete mapped children too. Obsidian fires
    // per-file delete events, but rapid-fire events can be missed by the
    // watcher — this guarantees no orphans remain on the server.
    if (isFolder) {
      const children = this.plugin.mapping.all().filter(e =>
        e.joplinId !== entry.joplinId && e.path.startsWith(entry.path)
      );
      for (const child of children) {
        try {
          await this.plugin.api.deleteItem(child.joplinId + '.md');
          this.plugin.mapping.remove(child.joplinId);
          this.plugin.mapping.addTombstone(child.joplinId, child.type);
        } catch { /* child may already be gone */ }
      }
    }

    await this.plugin.api.deleteItem(entry.joplinId + '.md');
    this.plugin.mapping.remove(entry.joplinId);
    this.plugin.mapping.addTombstone(entry.joplinId, entry.type);
    return 'delete';
  }

  private async renameItem(oldPath: string, newPath: string, fileId: string, isFolder: boolean): Promise<'create' | 'update' | 'delete' | 'none'> {
    const key = isFolder ? oldPath + '/' : oldPath;
    const entry = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(key);
    if (!entry) {
      // Nothing mapped at the old path — treat as a fresh create at new path.
      return this.upsertItem(newPath, fileId);
    }
    if (isFolder) {
      // Folders: rename the server item's title, then remap local prefix.
      const newTitle = newPath.split('/').pop() || newPath;
      const parentDir = newPath.includes('/') ? newPath.slice(0, newPath.lastIndexOf('/')) + '/' : '';
      // Ensure the new parent folder has a server mapping (like file moves do),
      // otherwise the moved folder lands at root instead of its new parent.
      const parentId = parentDir ? await this.ensureFolderChain(parentDir) : '';
      const now = Date.now();
      const folderItem: JoplinItem = {
        id: entry.joplinId, parent_id: parentId,
        title: newTitle,
        created_time: now, updated_time: now,
        user_created_time: now, user_updated_time: now,
        type_: ModelType.Folder, encryption_applied: 0, encryption_cipher_text: '',
      };
      const res = await this.plugin.api.putItem(entry.joplinId + '.md', this.serializer.serialize(folderItem), true);
      this.plugin.mapping.renamePrefix(oldPath + '/', newPath + '/');
      const folderMapping = this.plugin.mapping.getById(entry.joplinId);
      if (folderMapping) {
        this.plugin.mapping.upsert({ ...folderMapping, path: newPath + '/', remoteUpdatedTime: res.updated_time ?? now });
      }
      return 'update';
    }
    // File move/rename: upload to the NEW path (upsertItem detects the path
    // change and updates parent_id/title on the server). Do NOT pre-update
    // the mapping path here, or the move is invisible to upsertItem.
    const result = await this.upsertItem(newPath, fileId);
    if (result === 'none') {
      // Content identical but path changed — force an update so the server
      // parent/title reflect the new location.
      const af = this.plugin.app.vault.getAbstractFileByPath(newPath);
      if (af instanceof TFile) {
        return this.upsertItem(newPath, fileId, true);
      }
      return 'none';
    }
    return result;
  }

  async ensureFolderChain(folderPath: string): Promise<string> {
    if (!folderPath || folderPath === '/') return this.ensureRootFolderId();
    const existing = this.plugin.mapping.getByPath(folderPath);
    if (existing) return existing.joplinId;
    const parts = folderPath.replace(/\/$/, '').split('/');
    const parentPath = parts.slice(0, -1).join('/');
    const parentId = await this.ensureFolderChain(parentPath ? parentPath + '/' : '');
    const id = createJoplinId();
    const now = Date.now();
    const item: JoplinItem = {
      id, parent_id: parentId, title: parts[parts.length - 1],
      created_time: now, updated_time: now,
      user_created_time: now, user_updated_time: now,
      type_: ModelType.Folder, encryption_applied: 0, encryption_cipher_text: '',
    };
    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path: folderPath, type: ModelType.Folder,
      localHash: '', remoteUpdatedTime: res.updated_time, syncedAt: now,
    });
    return id;
  }

  private async ensureRootFolderId(): Promise<string> {
    // Root-level items must hang off the vault root folder (same as
    // forcePush), NOT parent_id='' — otherwise a second terminal's
    // belongsToRoot rejects them as foreign (B2).
    const existing = this.plugin.mapping.rootFolderId;
    if (existing) return existing;
    return this.plugin.engine.ensureRootFolder();
  }
}