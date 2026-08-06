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
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  html: 'text/html', htm: 'text/html',
  canvas: 'application/obsidian-canvas',
  drawio: 'application/x-drawio',
};

export class ResourceManager {
  private serializer = new JoplinSerializer();
  private hashToId = new Map<string, string>();

  constructor(private plugin: JoplinSyncPlugin) {}

  async uploadResource(file: TFile, force = false): Promise<string> {
    const data = await this.plugin.app.vault.readBinary(file);
    const hash = await sha256(data);
    const existing = this.plugin.mapping.getByPath(file.path);
    if (!force && existing && existing.localHash === hash) return existing.joplinId;
    // Every resource gets a unique ID — blob and metadata share the same ID.
    // This keeps downloadResource (which fetches .resource/<meta.id>) in sync.
    const metaId = force ? createJoplinId() : (existing?.joplinId ?? createJoplinId());

    const maxSize = (this.plugin.settings.maxAttachmentMB ?? 100) * 1024 * 1024;
    if (data.byteLength > maxSize) throw new Error('Attachment too large: ' + file.path);

    // Ensure parent directory exists on server before uploading
    const parentDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    if (parentDir && !this.plugin.mapping.getByPath(parentDir + '/')) {
      await this.ensureRemoteFolder(parentDir);
    }

    const now = Date.now();
    const st = (file.stat as unknown as { ctime: number; mtime: number }) ?? { ctime: now, mtime: now };
    const meta: JoplinItem = {
      id: metaId, parent_id: '', title: file.name,
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

    // E2EE: encrypt the blob AND the metadata item if a master key is loaded.
    const e2ee = this.plugin.e2ee;
    const mkId = e2ee.activeKeyId ?? e2ee.firstLoadedKeyId;
    const encrypt = this.plugin.engine.e2eeActive && !!mkId;
    if (encrypt) {
      const blobCipher = await e2ee.encryptBlobData(data, mkId);
      await this.plugin.api.putItem('.resource/' + metaId, blobCipher);
      const ct = await e2ee.encryptItem(this.serializer.serialize(meta), mkId);
      const encMeta: JoplinItem = {
        id: metaId, parent_id: '', title: '',
        created_time: now, updated_time: now, user_created_time: now, user_updated_time: now,
        type_: ModelType.Resource, encryption_applied: 1, encryption_cipher_text: ct,
      };
      const res = await this.plugin.api.putItem(metaId + '.md', this.serializer.serialize(encMeta));
      this.plugin.mapping.upsert({
        joplinId: metaId, path: file.path, type: ModelType.Resource,
        localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: now,
      });
      return metaId;
    }

    await this.plugin.api.putItem('.resource/' + metaId, data);
    const res = await this.plugin.api.putItem(metaId + '.md', this.serializer.serialize(meta));
    this.plugin.mapping.upsert({
      joplinId: metaId, path: file.path, type: ModelType.Resource,
      localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: now,
    });
    return metaId;
  }

  /** Ensure a remote folder exists for the given vault-relative path */
  private async ensureRemoteFolder(dirPath: string): Promise<string> {
    const parts = dirPath.split('/');
    let accumulated = '';
    for (let i = 0; i < parts.length; i++) {
      accumulated = accumulated ? accumulated + '/' + parts[i] : parts[i];
      const mapped = this.plugin.mapping.getByPath(accumulated + '/');
      if (mapped) continue;
      const fid = createJoplinId();
      const now = Date.now();
      const item: JoplinItem = {
        id: fid, parent_id: '', title: parts[i],
        created_time: now, updated_time: now,
        user_created_time: now, user_updated_time: now,
        type_: ModelType.Folder, encryption_applied: 0, encryption_cipher_text: '',
      };
      // Set parent_id from previously created parent
      const parentPath = i > 0 ? parts.slice(0, i).join('/') : '';
      if (parentPath) {
        const parent = this.plugin.mapping.getByPath(parentPath + '/');
        if (parent) item.parent_id = parent.joplinId;
      }
      const res = await this.plugin.api.putItem(fid + '.md', this.serializer.serialize(item), true);
      this.plugin.mapping.upsert({
        joplinId: fid, path: accumulated + '/', type: ModelType.Folder,
        localHash: '', remoteUpdatedTime: res.updated_time || now, syncedAt: now,
      });
    }
    return accumulated;
  }

  async downloadResource(meta: JoplinItem): Promise<string> {
    const existing = this.plugin.mapping.getById(meta.id);
    const correctPath = meta.filename ? normalizePath(meta.filename) : '';
    // Skip only if mapped AND file exists on disk AT THE CORRECT PATH
    if (existing && (meta.blob_updated_time ?? 0) <= existing.remoteUpdatedTime) {
      if (correctPath && existing.path !== correctPath) {
        // Path changed (e.g. old version used attachments/) — re-download to correct path
        this.plugin.mapping.remove(existing.joplinId);
      } else if (this.plugin.app.vault.getAbstractFileByPath(existing.path)) {
        return existing.path;
      }
    }
    const e2ee = this.plugin.e2ee;
    // The blob's own header decides encryption — the meta passed in may
    // already be decrypted by the caller (forcePull decrypts collected items),
    // so meta.encryption_applied is not a reliable signal. JED01 is the fixed
    // prefix of every E2EE cipher text, so sniff the blob bytes directly.
    const resourceIsEncrypted = e2ee.isEncrypted(meta);
    let metaToUse = meta;
    if (resourceIsEncrypted) {
      const ds = await e2ee.decryptItem(meta);
      if (ds) metaToUse = this.serializer.unserialize(ds);
    }

    const blob = await this.plugin.api.getItemBinary('.resource/' + meta.id);
    if (!blob) throw new Error('Resource blob missing: ' + meta.id);

    // E2EE: decrypt the blob when its content carries the JED01 header,
    // regardless of the (possibly already-decrypted) meta flag.
    const blobHead = new TextDecoder().decode(blob.slice(0, 5));
    const blobIsEncrypted = blobHead === 'JED01';
    let plainBlob: ArrayBuffer = blob;
    if (blobIsEncrypted) {
      plainBlob = await e2ee.decryptBlobData(blob);
    }

    const dir = this.plugin.settings.attachmentFolder || 'attachments';
    const relName = metaToUse.filename ? metaToUse.filename : (dir + '/' + meta.id + '.' + (metaToUse.file_extension || 'bin'));
    let path = normalizePath(relName);
    const clash = this.plugin.mapping.getByPath(path);
    if (clash && clash.joplinId !== meta.id) {
      // If the old file doesn't exist on disk, overwrite the mapping entry
      if (!this.plugin.app.vault.getAbstractFileByPath(path)) {
        this.plugin.mapping.remove(clash.joplinId);
      } else {
        path = normalizePath(dir + '/' + meta.id.slice(0, 7) + '_' + (metaToUse.filename || (meta.id + '.' + (metaToUse.file_extension || 'bin'))));
      }
    }

    const watcher = (this.plugin.engine as unknown as { watcher?: { suppress: (path: string) => void; release: (path: string) => void } })?.watcher;
    const write = async () => {
      // Ensure parent directory exists
      const parentDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (parentDir && !this.plugin.app.vault.getAbstractFileByPath(parentDir)) {
        try { await this.plugin.app.vault.createFolder(parentDir); } catch {/* empty */}
      }
      const f = this.plugin.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await this.plugin.app.vault.modifyBinary(f, plainBlob);
      else await this.plugin.app.vault.createBinary(path, plainBlob);
    };
    if (watcher?.suppress) {
      watcher.suppress(path);
      try { await write(); } finally { watcher.release(path); }
    } else {
      await write();
    }
    this.plugin.mapping.upsert({
      joplinId: meta.id, path, type: ModelType.Resource,
      localHash: await sha256(plainBlob),
      remoteUpdatedTime: metaToUse.blob_updated_time ?? metaToUse.updated_time,
      syncedAt: Date.now(),
    });
    return path;
  }
}