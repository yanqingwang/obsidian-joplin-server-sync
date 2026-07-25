import { TFile, normalizePath } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { createJoplinId } from '../mapping/IdGenerator';
import { ModelType, JoplinItem } from '../api/models';
import { sha256 } from '../core/SyncEngine';

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp3: 'audio/mpeg', mp4: 'video/mp4', zip: 'application/zip',
};

export class ResourceManager {
  private serializer = new JoplinSerializer();
  private hashToId = new Map<string, string>();

  constructor(private plugin: JoplinSyncPlugin) {}

  async uploadResource(file: TFile): Promise<string> {
    const data = await this.plugin.app.vault.readBinary(file);
    const hash = await sha256(data);
    const existing = this.plugin.mapping.getByPath(file.path);
    if (existing && existing.localHash === hash) return existing.joplinId;
    const dedup = this.hashToId.get(hash);
    if (dedup) return dedup;

    const maxSize = (this.plugin.settings as any).maxAttachmentMB * 1024 * 1024 || 100 * 1024 * 1024;
    if (data.byteLength > maxSize) throw new Error('Attachment too large: ' + file.path);

    const id = existing?.joplinId ?? createJoplinId();
    const now = Date.now();
    await this.plugin.api.putItem('.resource/' + id, data);
    const meta: JoplinItem = {
      id, parent_id: '', title: file.name,
      mime: MIME_MAP[file.extension.toLowerCase()] ?? 'application/octet-stream',
      filename: file.name,
      file_extension: file.extension,
      size: data.byteLength,
      blob_updated_time: now,
      created_time: file.stat.ctime, updated_time: now,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Resource, encryption_applied: 0, encryption_cipher_text: '',
    };
    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(meta));
    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Resource,
      localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: now,
    });
    this.hashToId.set(hash, id);
    return id;
  }

  async downloadResource(meta: JoplinItem): Promise<string> {
    const existing = this.plugin.mapping.getById(meta.id);
    if (existing && (meta.blob_updated_time ?? 0) <= existing.remoteUpdatedTime) return existing.path;
    const blob = await this.plugin.api.getItemBinary('.resource/' + meta.id);
    if (!blob) throw new Error('Resource blob missing: ' + meta.id);

    const dir = this.plugin.settings.attachmentFolder || 'attachments';
    if (!this.plugin.app.vault.getAbstractFileByPath(dir)) {
      await this.plugin.app.vault.createFolder(dir).catch(() => {});
    }
    let filename = meta.filename || meta.id + '.' + (meta.file_extension || 'bin');
    let path = normalizePath(dir + '/' + filename);
    const clash = this.plugin.mapping.getByPath(path);
    if (clash && clash.joplinId !== meta.id) {
      path = normalizePath(dir + '/' + meta.id.slice(0, 7) + '_' + filename);
    }

    const watcher = (this.plugin.engine as any).watcher as any;
    if (watcher?.suppress) {
      watcher.suppress(path);
      try {
        const f = this.plugin.app.vault.getAbstractFileByPath(path);
        if (f) await this.plugin.app.vault.modifyBinary(f as TFile, blob);
        else await this.plugin.app.vault.createBinary(path, blob);
      } finally { watcher.release(path); }
    }
    this.plugin.mapping.upsert({
      joplinId: meta.id, path, type: ModelType.Resource,
      localHash: await sha256(blob),
      remoteUpdatedTime: meta.blob_updated_time ?? meta.updated_time,
      syncedAt: Date.now(),
    });
    return path;
  }
}