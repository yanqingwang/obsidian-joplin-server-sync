import { TFile, TFolder } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { ChangeQueue, LocalChange } from './ChangeQueue';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { createJoplinId } from '../mapping/IdGenerator';
import { ModelType, JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { ResourceManager } from '../resource/ResourceManager';

export class LocalPusher {
  private serializer = new JoplinSerializer();
  private resources: ResourceManager;

  constructor(private plugin: JoplinSyncPlugin, private queue: ChangeQueue) {
    this.resources = new ResourceManager(plugin);
  }

  async pushAll(): Promise<void> {
    const changes = this.queue.drain();
    const failed: LocalChange[] = [];
    for (const change of changes) {
      try {
        await this.pushOne(change);
      } catch (e) {
        console.error('[joplin-sync] push failed: ' + change.path, e);
        failed.push(change);
      }
    }
    if (failed.length) this.queue.requeue(failed);
  }

  private async pushOne(c: LocalChange): Promise<void> {
    switch (c.kind) {
      case 'create':
      case 'modify': return this.upsertItem(c.path);
      case 'delete': return this.deleteItem(c.path, c.isFolder);
      case 'rename': return this.renameItem(c.oldPath!, c.path, c.isFolder);
    }
  }

  private async upsertItem(path: string): Promise<void> {
    const af = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!af) return;
    if (af instanceof TFolder) { await this.ensureFolderChain(path + '/'); return; }
    if (!(af instanceof TFile)) return;
    // Non-md file: upload as resource
    if (af.extension !== 'md') {
      await this.resources.uploadResource(af);
      return;
    }

    const parentPath = af.parent?.path === '/' ? '' : af.parent!.path + '/';
    const parentId = await this.ensureFolderChain(parentPath || '');
    const content = await this.plugin.app.vault.read(af);
    const hash = await sha256(content);
    const existing = this.plugin.mapping.getByPath(path);
    if (existing?.localHash === hash) return;

    const id = existing?.joplinId ?? createJoplinId();
    let base: Partial<JoplinItem> = {};
    if (existing) {
      const remote = await this.plugin.api.getItem(id + '.md');
      if (remote) base = this.serializer.unserialize(remote);
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

    // E2EE: encrypt if keys are loaded and target has E2EE enabled
    const e2ee = this.plugin.e2ee;
    const mkId = e2ee.firstLoadedKeyId;
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
      return;
    }

    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: Date.now(),
    });
  }

  private async deleteItem(path: string, isFolder: boolean): Promise<void> {
    const key = isFolder ? path + '/' : path;
    const entry = this.plugin.mapping.getByPath(key);
    if (!entry) return;
    await this.plugin.api.deleteItem(entry.joplinId + '.md');
    this.plugin.mapping.remove(entry.joplinId);
  }

  private async renameItem(oldPath: string, newPath: string, isFolder: boolean): Promise<void> {
    const key = isFolder ? oldPath + '/' : oldPath;
    const entry = this.plugin.mapping.getByPath(key);
    if (!entry) return this.upsertItem(newPath);
    if (isFolder) this.plugin.mapping.renamePrefix(oldPath + '/', newPath + '/');
    else this.plugin.mapping.upsert({ ...entry, path: newPath });
    await this.upsertItem(isFolder ? newPath : newPath);
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
    const ROOT_KEY = '__root__/';
    const existing = this.plugin.mapping.getByPath(ROOT_KEY);
    if (existing) return existing.joplinId;
    const id = createJoplinId();
    const item: JoplinItem = {
      id, parent_id: '', title: 'Obsidian',
      created_time: Date.now(), updated_time: Date.now(),
      user_created_time: Date.now(), user_updated_time: Date.now(),
      type_: ModelType.Folder, encryption_applied: 0, encryption_cipher_text: '',
    };
    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path: ROOT_KEY, type: ModelType.Folder,
      localHash: '', remoteUpdatedTime: res.updated_time, syncedAt: Date.now(),
    });
    return id;
  }
}