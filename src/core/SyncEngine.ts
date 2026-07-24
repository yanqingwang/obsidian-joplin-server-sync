import { Notice, TFile } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { SyncInfoHandler } from './SyncInfo';
import { createJoplinId } from '../mapping/IdGenerator';
import { ModelType, JoplinItem } from '../api/models';

export enum SyncState { Idle, Pushing, Pulling, Resolving, Error }

export class SyncEngine {
  private serializer = new JoplinSerializer();
  private syncInfo: SyncInfoHandler;
  private running = false;
  state = SyncState.Idle;

  constructor(private plugin: JoplinSyncPlugin) {
    this.syncInfo = new SyncInfoHandler(plugin.api);
  }

  async runFullUpload(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    try {
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();

      const rootFolderId = await this.ensureRootFolder();
      const files = this.collectMarkdownFiles();

      let done = 0, skipped = 0;
      const failed: string[] = [];
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const changed = await this.uploadNote(file, rootFolderId);
            changed ? done++ : skipped++;
          } catch (e: any) {
            failed.push(file.path + ': ' + e.message);
          }
          this.plugin.statusBar.setProgress(done + skipped, files.length);
        }));
        await this.plugin.mapping.flush();
      }
      new Notice('Upload done: ' + done + ' uploaded, ' + skipped + ' unchanged, ' + failed.length + ' failed');
      if (failed.length) console.error('[joplin-sync] failures:', failed);
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }

  private async uploadNote(file: TFile, parentId: string): Promise<boolean> {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);

    const existing = this.plugin.mapping.getByPath(file.path);
    if (existing && existing.localHash === hash) return false;

    const id = existing?.joplinId ?? createJoplinId();
    const item: JoplinItem = {
      id,
      parent_id: parentId,
      title: file.basename,
      body: content,
      created_time: file.stat.ctime,
      updated_time: file.stat.mtime,
      user_created_time: file.stat.ctime,
      user_updated_time: file.stat.mtime,
      type_: ModelType.Note,
      encryption_applied: 0,
      encryption_cipher_text: '',
      markup_language: 1,
    };

    const result = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: result.updated_time, syncedAt: Date.now(),
    });
    return true;
  }

  private async ensureRootFolder(): Promise<string> {
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

  private collectMarkdownFiles(): TFile[] {
    const excludes = this.plugin.settings.excludePatterns;
    return this.plugin.app.vault.getMarkdownFiles()
      .filter(f => !excludes.some(p => f.path.startsWith(p)));
  }

  startWatching(): void {}
  startScheduler(): void {}
  async shutdown(): Promise<void> {}
}

export async function sha256(text: string | ArrayBuffer): Promise<string> {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}