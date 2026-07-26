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
    const st = (file.stat as any) || { ctime: now, mtime: now };
    await this.plugin.api.putItem('.resource/' + id, data);
    const meta: JoplinItem = {
      id, parent_id: '', title: file.name,
      mime: MIME_MAP[file.extension.toLowerCase()] ?? 'application/octet-stream',
      // Store the FULL relative path in `filename` so the pull side can
      // recreate the original folder structure (not flatten into one dir).
      filename: file.path,
      file_extension: file.extension,
      size: data.byteLength,
      blob_updated_time: now,
      created_time: st.ctime ?? now, updated_time: now,
      user_created_time: st.ctime ?? now, user_updated_time: st.mtime ?? now,
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
    // Recreate the original relative path when available (filename carries the
    // full vault-relative path), otherwise fall back to attachmentFolder.
    const relName = (meta.filename && meta.filename.includes('/')) ? meta.filename : (dir + '/' + (meta.filename || (meta.id + '.' + (meta.file_extension || 'bin'))));
    let path = normalizePath(relName);
    const clash = this.plugin.mapping.getByPath(path);
    if (clash && clash.joplinId !== meta.id) {
      path = normalizePath(dir + '/' + meta.id.slice(0, 7) + '_' + (meta.filename || (meta.id + '.' + (meta.file_extension || 'bin'))));
    }

    const watcher = (this.plugin.engine as any)?.watcher as any;
    const write = async () => {
      const f = this.plugin.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await this.plugin.app.vault.modifyBinary(f, blob);
      else await this.plugin.app.vault.createBinary(path, blob);
    };
    if (watcher?.suppress) {
      watcher.suppress(path);
      try { await write(); } finally { watcher.release(path); }
    } else {
      await write();
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