import { Notice, TFile } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { SyncInfoHandler } from './SyncInfo';
import { createJoplinId } from '../mapping/IdGenerator';
import { ModelType, JoplinItem } from '../api/models';
import { ChangeQueue } from './ChangeQueue';
import { VaultWatcher } from '../vault/VaultWatcher';
import { LocalPusher } from './LocalPusher';
import { DeltaPuller } from './DeltaPuller';
import { InitialSync } from './InitialSync';

export enum SyncState { Idle, Pushing, Pulling, Resolving, Error }

export class SyncEngine {
  private serializer = new JoplinSerializer();
  private syncInfo: SyncInfoHandler;
  private running = false;
  state = SyncState.Idle;
  watcher!: VaultWatcher;
  private queue!: ChangeQueue;
  private pusher!: LocalPusher;
  private deltaPuller!: DeltaPuller;
  private timer: number | null = null;

  constructor(private plugin: JoplinSyncPlugin) {
    this.syncInfo = new SyncInfoHandler(plugin.api);
  }

  // ============ Phase 1: Legacy full upload ============
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
      id, parent_id: parentId, title: file.basename, body: content,
      created_time: file.stat.ctime, updated_time: file.stat.mtime,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Note, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
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

  // ============ Phase 2: Watcher + Scheduler ============
  startWatching(): void {
    this.queue = new ChangeQueue(this.plugin);
    void this.queue.restore();
    this.watcher = new VaultWatcher(this.plugin, this.queue);
    this.watcher.start();
    this.pusher = new LocalPusher(this.plugin, this.queue);
    this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
  }

  startScheduler(): void {
    const interval = this.plugin.settings.syncIntervalSec;
    if (interval > 0) {
      this.timer = window.setInterval(() => this.syncCycle(), interval * 1000);
    }
    if (this.plugin.settings.syncOnStartup) {
      setTimeout(() => this.syncCycle(), 5000);
    }
  }

  // ============ Phase 2: Sync Cycle ============
  async syncCycle(): Promise<void> {
    if (this.state !== SyncState.Idle) return;
    try {
      this.state = SyncState.Pushing;
      this.plugin.statusBar.setSyncing();
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();

      if (!this.plugin.mapping.getDeltaCursor()) {
        await new InitialSync(this.plugin).run();
      }

      this.state = SyncState.Pushing;
      await this.pusher.pushAll();

      this.state = SyncState.Pulling;
      await this.deltaPuller.pullAll();

      this.state = SyncState.Resolving;
      for (const t of [...this.plugin.mapping.tombstones]) {
        await this.plugin.api.deleteItem(t.joplinId + '.md');
        this.plugin.mapping.clearTombstone(t.joplinId);
      }

      this.plugin.statusBar.setOk(Date.now());
    } catch (e: any) {
      this.state = SyncState.Error;
      console.error('[joplin-sync]', e);
      this.plugin.statusBar.setError(e.message);
    } finally {
      await this.plugin.mapping.flush();
      this.state = SyncState.Idle;
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) window.clearInterval(this.timer);
  }

  // Phase 3: pre-assign note ID for link resolution
  async preassignNoteId(file: TFile): Promise<string> {
    const id = createJoplinId();
    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: '', remoteUpdatedTime: 0, syncedAt: Date.now(),
    });
    return id;
  }

  // ============ Force Push: overwrite server with local ============
  async forcePush(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    try {
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      const rootFolderId = await this.ensureRootFolder();
      const files = this.collectMarkdownFiles();
      let done = 0;
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          await this.uploadNote(file, rootFolderId);
          done++;
          this.plugin.statusBar.setProgress(done, files.length);
        }));
        await this.plugin.mapping.flush();
      }
      new Notice('Force push: ' + done + ' notes uploaded');
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }

  // ============ Force Pull: overwrite local with server ============
  async forcePull(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    try {
      await this.plugin.api.login();
      const remoteStats = await this.listAllRemoteItems();
      let done = 0; let failed = 0;
      for (const stat of remoteStats) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name)) continue;
        try {
          const raw = await this.plugin.api.getItem(stat.name);
          if (!raw) continue;
          const item = this.serializer.unserialize(raw);
          if (item.type_ === ModelType.Folder) continue;

          const sanitized = item.title.replace(/[\\/:*?"<>|#^[\]]/g, '_').trim() || 'Untitled';
          let path = sanitized + '.md';
          const existing = this.plugin.app.vault.getAbstractFileByPath(path);
          if (existing) {
            await this.plugin.app.vault.modify(existing as TFile, item.body ?? '');
          } else {
            await this.plugin.app.vault.create(path, item.body ?? '');
          }
          const hash = await sha256(item.body ?? '');
          this.plugin.mapping.upsert({
            joplinId: item.id, path, type: ModelType.Note,
            localHash: hash, remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
          });
          done++;
        } catch (e: any) {
          failed++;
          console.error('[joplin-sync] force-pull failed: ' + stat.name, e);
        }
        this.plugin.statusBar.setProgress(done + failed, remoteStats.length);
      }
      // Get initial delta cursor
      let cursor: string | undefined;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        cursor = page.cursor;
        if (!page.has_more) break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? '');
      await this.plugin.mapping.flush();
      new Notice('Force pull: ' + done + ' notes, ' + failed + ' failed');
    } finally {
      this.running = false;
      this.plugin.statusBar.setIdle();
    }
  }

  private async listAllRemoteItems(): Promise<import('../api/models').RemoteItemStat[]> {
    const out: import('../api/models').RemoteItemStat[] = [];
    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.listChildren(cursor);
      out.push(...page.items);
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    return out;
  }
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