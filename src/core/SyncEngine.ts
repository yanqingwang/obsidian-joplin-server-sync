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
import { safeFileName } from './pathUtil';
import { ResourceManager } from '../resource/ResourceManager';

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
  e2eeActive = false;
  resources!: ResourceManager;

  private get configDir(): string {
    const vault = this.plugin.app.vault as unknown as { configDir?: string };
    return vault.configDir || '.obsidian';
  }

  constructor(private plugin: JoplinSyncPlugin) {
    this.syncInfo = new SyncInfoHandler(plugin.api);
    this.resources = new ResourceManager(plugin);
  }

  // ============ Phase 1: Legacy full upload ============
  async runFullUpload(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    try {
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      const files = this.collectMarkdownFiles();
      let done = 0, skipped = 0;
      const failed: string[] = [];
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const changed = await this.uploadNote(file, '');
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

  private async uploadNote(file: TFile, parentId: string, force = false): Promise<boolean> {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const existing = this.plugin.mapping.getByPath(file.path);
    if (!force && existing && existing.localHash === hash) return false;
    const id = existing?.joplinId ?? createJoplinId();
    const item: JoplinItem = {
      id, parent_id: parentId, title: file.basename, body: content,
      created_time: file.stat.ctime, updated_time: file.stat.mtime,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Note, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    };
    const payload = this.serializer.serialize(item);
    const result = await this.plugin.api.putItem(id + '.md', payload, force);

    // Write-then-verify: GET back and compare hash (non-fatal, log only)
    try {
      const raw = await this.plugin.api.getItem(id + '.md');
      if (raw) {
        const remote = this.serializer.unserialize(raw);
        const remoteHash = await sha256(remote.body ?? '');
        if (remoteHash !== hash) {
          console.warn('[joplin-sync] verify mismatch for: ' + file.path + ' (expected ' + hash + ', got ' + remoteHash + ')');
        }
      }
    } catch (verifyErr: any) {
      console.warn('[joplin-sync] verify skipped for: ' + file.path + ' - ' + (verifyErr?.message || verifyErr));
    }

    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: result.updated_time, syncedAt: Date.now(),
    });
    return true;
  }

  private ensureRootFolder(): string {
    return '';
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

  private ensureReady(): void {
    if (!this.queue) {
      this.queue = new ChangeQueue(this.plugin);
      void this.queue.restore();
    }
    if (!this.watcher) {
      this.watcher = new VaultWatcher(this.plugin, this.queue);
      this.watcher.start();
    }
    if (!this.pusher) this.pusher = new LocalPusher(this.plugin, this.queue);
    if (!this.deltaPuller) this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
  }

  startScheduler(): void {
    const interval = this.plugin.settings.syncIntervalSec;
    if (interval > 0) {
      this.timer = window.setInterval(() => this.syncCycle(), interval * 1000);
    }
    if (this.plugin.settings.syncOnStartup) {
      window.setTimeout(() => this.syncCycle(), 5000);
    }
  }

  // ============ Phase 2: Sync Cycle ============
  async syncCycle(): Promise<void> {
    if (this.state !== SyncState.Idle) { new Notice('Sync already in progress'); return; }
    this.ensureReady();
    try {
      this.state = SyncState.Pushing;
      this.plugin.statusBar.setSyncing('pushing...');
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;

      if (!this.plugin.mapping.getDeltaCursor()) {
        this.plugin.statusBar.setSyncing('initial sync...');
        await new InitialSync(this.plugin).run();
      }

      this.state = SyncState.Pushing;
      const pushResult = await this.pusher.pushAll();
      this.plugin.statusBar.setProgress(pushResult.ok, Math.max(pushResult.ok, 1), 'push');

      this.state = SyncState.Pulling;
      this.plugin.statusBar.setSyncing('pulling...');
      const pullResult = await this.deltaPuller.pullAll();
      this.plugin.statusBar.setProgress(pullResult.ok, Math.max(pullResult.ok, 1), 'pull');

      this.state = SyncState.Resolving;
      for (const t of [...this.plugin.mapping.tombstones]) {
        await this.plugin.api.deleteItem(t.joplinId + '.md');
        this.plugin.mapping.clearTombstone(t.joplinId);
      }

      const totalMapped = this.plugin.mapping.all().length;
      this.plugin.statusBar.setOk(Date.now(), totalMapped);
      const totalFail = (pushResult?.fail ?? 0) + (pullResult?.fail ?? 0);
      this.plugin.logSync('sync', totalMapped, totalFail);
      new Notice('Sync complete: ' + totalMapped + ' items mapped, ' + totalFail + ' failed');
    } catch (e: any) {
      this.state = SyncState.Error;
      const msg = e?.message || e?.toString() || 'Unknown error';
      console.error('[joplin-sync] sync cycle failed:', msg);
      this.plugin.statusBar.setError(msg);
      new Notice('Sync failed: ' + msg, 8000);
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
      this.plugin.statusBar.setSyncing('force push: rebuilding server...');
      await this.plugin.api.login();
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;

      const rootFolderId = '';
      const files = this.collectMarkdownFiles();

      // IDs we actually push this run. Anything left on the server that is
      // NOT in here is a stale/duplicate/orphan item and must be removed so
      // that "force push" is a true overwrite (otherwise the server keeps
      // accumulating duplicates every run and the pull target diverges).
      const pushedNoteIds = new Set<string>();
      const pushedFolderIds = new Set<string>();

      // Create sub-folders on server (if not already existing)
      const folderMap = new Map<string, string>();
      folderMap.set('', rootFolderId);
      const dirs = new Set<string>();

      // Helper to discover directory from a path
      const discoverParentDirs = (path: string) => {
        const d = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (!d) return;
        const parts = d.split('/');
        let accumulated = '';
        for (let i = 0; i < parts.length; i++) {
          accumulated = accumulated ? accumulated + '/' + parts[i] : parts[i];
          if (!folderMap.has(accumulated)) {
            const existing = this.plugin.mapping.getByPath(accumulated + '/');
            if (existing) { 
              folderMap.set(accumulated, existing.joplinId);
              pushedFolderIds.add(existing.joplinId);
              continue; 
            }
            dirs.add(accumulated);
          }
        }
      };

      // Discover directories from ALL files (markdown + resources)
      for (const f of files) discoverParentDirs(f.path);
      for (const f of this.plugin.app.vault.getFiles()) {
        if (f.extension === 'md') continue;
        discoverParentDirs(f.path);
      }

      // Also discover empty directories from the filesystem adapter
      const adapter = this.plugin.app.vault.adapter;
      if (adapter && (adapter as any).list) {
        const walkDirs = async (dir: string): Promise<void> => {
          try {
            const listing = await (adapter as any).list(dir);
            for (const sub of listing.folders) {
              const rel = dir ? dir + '/' + sub.split('/').pop() : sub.split('/').pop();
              if (rel && !folderMap.has(rel)) {
                const existing = this.plugin.mapping.getByPath(rel + '/');
                if (existing) {
                  folderMap.set(rel, existing.joplinId);
                  pushedFolderIds.add(existing.joplinId);
                } else {
                  dirs.add(rel);
                }
              }
              await walkDirs(sub);
            }
          } catch {/* empty */}
        };
        await walkDirs('').catch(() => {});
      }
      let folderCount = 0; void folderCount;
      for (const dp of [...dirs].sort((a,b) => a.split('/').length - b.split('/').length)) {
        const parent = dp.includes('/') ? (folderMap.get(dp.slice(0, dp.lastIndexOf('/'))) || rootFolderId) : rootFolderId;
        const fid = createJoplinId();
        const title = dp.split('/').pop() || dp;
        const item: JoplinItem = {
          id: fid, parent_id: parent, title, type_: ModelType.Folder,
          created_time: Date.now(), updated_time: Date.now(),
          user_created_time: Date.now(), user_updated_time: Date.now(),
          encryption_applied: 0, encryption_cipher_text: '',
        };
        try {
          const st = await this.plugin.api.putItem(fid + '.md', this.serializer.serialize(item), true);
          if (st && st.id) {
            this.plugin.mapping.upsert({
              joplinId: fid, path: dp + '/', type: ModelType.Folder,
              localHash: '', remoteUpdatedTime: (st as unknown as { updated_time: number }).updated_time || Date.now(), syncedAt: Date.now(),
            });
            folderMap.set(dp, fid);
            pushedFolderIds.add(fid);
            folderCount++;
          }
        } catch { /* folder may already exist */ }
      }

      // Count total folders in map (excluding root)
      const totalFolders = folderMap.size - 1;

      let done = 0; let fail = 0;
      if (this.plugin.settings.syncFoldersOnly) {
        new Notice('Force push: ' + totalFolders + ' folders synced (folders-only mode)');
        this.plugin.logSync('folders', totalFolders, 0);
        done = totalFolders;
      } else {
        for (const batch of chunk(files, 5)) {
          await Promise.all(batch.map(async (file) => {
            try {
              const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
              const parentId = folderMap.get(dir) || rootFolderId;
              await this.uploadNote(file, parentId, true);
              const m = this.plugin.mapping.getByPath(file.path);
              if (m) pushedNoteIds.add(m.joplinId);
              done++;
            } catch (e: any) {
              fail++;
              console.error('[joplin-sync] upload fail [' + fail + ']:', file.path, e?.message || e);
            }
          }));
          await this.plugin.mapping.flush();
        }
      }
      if (!this.plugin.settings.syncFoldersOnly) {
        console.debug('[joplin-sync] force push notes: done=' + done + ' fail=' + fail + ' pushedNoteIds=' + pushedNoteIds.size);
        this.plugin.logSync('push', done, fail);
      }

      // ---- Attachments/files: mirror EVERY local non-md file (except config) ----
      // Force push must be a true full mirror, so unreferenced loose files
      // (e.g. an exported `resources/` bucket) must also be synced; otherwise
      // the pull target would silently diverge. .obsidian/ is always excluded.
      const pushedResourceIds = new Set<string>();
      if (!this.plugin.settings.syncFoldersOnly) {
        const excludes = this.plugin.settings.excludePatterns;
        const isExcluded = (p: string) => excludes.some(e => p.startsWith(e)) || p.includes('/' + this.configDir + '/') || p.startsWith(this.configDir + '/');
        const allFiles = this.plugin.app.vault.getFiles();
        let rDone = 0, rFail = 0;
        for (const f of allFiles) {
          if (f.extension === 'md') continue;
          if (isExcluded(f.path)) continue;
          try { const rid = await this.resources.uploadResource(f); pushedResourceIds.add(rid); rDone++; }
          catch (e: any) { rFail++; console.error('[joplin-sync] resource upload fail:', f.path, e?.message || e); }
        }
        if (rDone || rFail) console.debug('[joplin-sync] force push files: ' + rDone + ' uploaded, ' + rFail + ' failed');
      }

      // ---- True-overwrite cleanup: delete server items not present locally ----
      // Notes are only removed when we actually pushed notes this run
      // (in folders-only mode we must not wipe the server's notes).
      let removed = 0, removedNotes = 0, removedFolders = 0, removedResources = 0;
      const remote = await this.listAllRemoteItems();
      console.debug('[joplin-sync] force push cleanup: scanning ' + remote.length + ' remote items');
      for (const stat of remote) {
        const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
        if (noteMatch) {
          const id = noteMatch[1];
          const entry = this.plugin.mapping.getById(id);
          if (entry?.type === ModelType.Folder) {
            // Keep folders — never delete them during cleanup
          } else if (entry?.type === ModelType.Resource) {
            if (!pushedResourceIds.has(id)) { try { await this.plugin.api.deleteItem(stat.name); removed++; removedResources++; } catch { /* ignore */ } }
          } else if (!this.plugin.settings.syncFoldersOnly) {
            if (!pushedNoteIds.has(id)) { try { await this.plugin.api.deleteItem(stat.name); removed++; removedNotes++; } catch { /* ignore */ } }
          }
        } else {
          // resource blob: cleanup orphans so the server stays in sync
          const resMatch = stat.name.match(/^\.resource\/([0-9a-f]{32})$/);
          if (resMatch && !this.plugin.settings.syncFoldersOnly) {
            const id = resMatch[1];
            if (!pushedResourceIds.has(id)) { try { await this.plugin.api.deleteItem(stat.name); removed++; } catch { /* ignore */ } }
          }
        }
      }
      if (removed) console.debug('[joplin-sync] force push cleaned ' + removed + ' items (notes=' + removedNotes + ' folders=' + removedFolders + ' resources=' + removedResources + ')');

      // Reset delta cursor so next sync cycle pulls from this point
      let cursor: string | undefined;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        cursor = page.cursor;
        if (!page.has_more) break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? '');

      this.plugin.statusBar.setOk(Date.now(), done);
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
      this.plugin.statusBar.setSyncing('force pull: clearing local...');
      await this.plugin.api.login();

      // Delete ALL files and folders except config directory
      const adapter = this.plugin.app.vault.adapter;
      const kept = [this.configDir];
      const isKept = (p: string) => kept.some(k => p === k || p.startsWith(k + '/'));
      let delCount = 0, delDirCount = 0;

      // Delete all non-kept files
      for (const f of this.plugin.app.vault.getFiles()) {
        if (!isKept(f.path)) {
          await this.plugin.app.fileManager.trashFile(f).catch(() => {});
          delCount++;
        }
      }

      // Recursively delete all empty directories via adapter (bottom-up)
      const listAll = async (dir: string): Promise<string[]> => {
        const result: string[] = [];
        try {
          if (adapter.list) {
            const listing = await adapter.list(dir);
            for (const sub of listing.folders) {
              const children = await listAll(sub);
              result.push(...children);
            }
            result.push(dir);
          }
        } catch {/* empty */}
        return result;
      };
      // List all dirs at vault root (excluding .obsidian)
      const rootDirs: string[] = [];
      try {
        if (adapter.list) {
          const root = await adapter.list('');
          for (const d of root.folders) {
            if (!isKept(d)) rootDirs.push(d);
          }
        }
      } catch {/* empty */}
      // Get all subdirectories recursively, then delete bottom-up
      const allDirs: string[] = [];
      for (const d of rootDirs) {
        const subs = await listAll(d);
        allDirs.push(...subs);
      }
      // Delete from deepest to shallowest
      allDirs.sort((a, b) => b.split('/').length - a.split('/').length);
      for (const d of allDirs) {
        try {
          if (await adapter.exists(d)) {
            await adapter.rmdir(d, false).catch(() => {});
            delDirCount++;
          }
        } catch {/* empty */}
      }

      this.plugin.mapping.setDeltaCursor('');
      console.debug('[joplin-sync] force pull: deleted ' + delCount + ' files, ' + delDirCount + ' dirs');

      // Use listAllRemoteItems (listChildren) for full download
      // delta API only returns recent changes, not all items
      const remoteStats = await this.listAllRemoteItems();
      const e2ee = this.plugin.e2ee;

      let done = 0; let failed = 0; let skipped = 0; void skipped;

      // Collect all items: first pass to identify folders and notes
      const allItems: JoplinItem[] = [];
      for (const stat of remoteStats) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name)) continue;
        if (stat.name.startsWith('.resource/')) continue;
        try {
          const raw = await this.plugin.api.getItem(stat.name);
          if (!raw) continue;
          const item = this.serializer.unserialize(raw);
          if (item.type_ === 9) { e2ee.feedMasterKey(item); continue; }

          if (e2ee.isEncrypted(item)) {
            try {
              const ds = await e2ee.decryptItem(item);
              if (ds) { const d = this.serializer.unserialize(ds); allItems.push(d); }
            } catch { failed++; continue; }
          } else {
            allItems.push(item);
          }
        } catch (e: any) {
          failed++;
          if (failed <= 3) console.error('[joplin-sync] force-pull:', stat.name, e);
        }
      }

      // Pre-compute folder paths from all items
      const folders = allItems.filter(i => i.type_ === ModelType.Folder);
      this.buildForcePullFolderPaths(folders);

      // Create folders first
      for (const f of folders) {
        if (!f.title) { skipped++; continue; }
        try {
          const parentPath = this.resolveForcePullFolderPath(f.parent_id);
          const dirName = safeFileName(f.title);
          const dirPath = parentPath + dirName;
          if (!this.plugin.app.vault.getAbstractFileByPath(dirPath)) {
            await this.plugin.app.vault.createFolder(dirPath).catch(() => {});
          }
          this.plugin.mapping.upsert({
            joplinId: f.id, path: dirPath + '/', type: ModelType.Folder,
            localHash: '', remoteUpdatedTime: f.updated_time, syncedAt: Date.now(),
          });
        } catch (e) {
          console.warn('[joplin-sync] force-pull folder:', f.title, (e as any)?.message || e);
        }
      }

      // Then download notes to correct folders
      const notes = allItems.filter(i => i.type_ === ModelType.Note);
      for (const item of notes) {
        if (!item.title) { skipped++; continue; }
        try {
          const dir = this.resolveForcePullFolderPath(item.parent_id);
          const sanitized = safeFileName(item.title);
          const path = dir + sanitized + '.md';

          let body = item.body ?? '';
          if (e2ee.isEncrypted(item)) {
            try {
              const ds = await e2ee.decryptItem(item);
              if (ds) { const d = this.serializer.unserialize(ds); body = d.body ?? ''; }
            } catch { failed++; continue; }
          }

          // Ensure parent dir exists (safety net)
          if (dir && !this.plugin.app.vault.getAbstractFileByPath(dir.replace(/\/$/, ''))) {
            try { await this.plugin.app.vault.createFolder(dir.replace(/\/$/, '')); } catch {/* empty */}
          }

          const existing = this.plugin.app.vault.getAbstractFileByPath(path);
          if (existing) {
            await this.plugin.app.vault.modify(existing as TFile, body || '');
          } else {
            await this.plugin.app.vault.create(path, body || '');
          }
          const hash = await sha256(body);
          this.plugin.mapping.upsert({
            joplinId: item.id, path, type: ModelType.Note,
            localHash: hash, remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
          });
          done++;
        } catch (e: any) {
          failed++;
          const msg = e?.message || '';
          if (msg.includes('401')) try { await this.plugin.api.login(); } catch { void 0; }
          if (failed <= 3) console.error('[joplin-sync] force-pull:', item.title, msg);
        }
        this.plugin.statusBar.setProgress(done, notes.length, 'pull');
      }

      let cursor: string | undefined;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        cursor = page.cursor;
        if (!page.has_more) break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? '');
      await this.plugin.mapping.flush();

      // ---- Attachments (Joplin Resources) → local files ----
      const resources = allItems.filter(i => i.type_ === ModelType.Resource);
      const downloadedPaths = new Set<string>();
      let rDone = 0, rFail = 0;
      for (const r of resources) {
        try { const p = await this.resources.downloadResource(r); if (p) downloadedPaths.add(p); rDone++; }
        catch (e: any) { rFail++; if (rFail <= 3) console.error('[joplin-sync] force-pull resource:', r.id, e?.message || e); }
      }
      if (rDone || rFail) console.debug('[joplin-sync] force pull attachments: ' + rDone + ' downloaded, ' + rFail + ' failed');

      const totalSynced = done + rDone;
      new Notice('Force pull: ' + totalSynced + ' items' + (failed ? ', ' + failed + ' failed' : ''));
      this.plugin.logSync('pull', totalSynced, failed + rFail);
      this.plugin.statusBar.setOk(Date.now(), totalSynced);

      // Remove stale local non-md files (cleanup from previous syncs)
      const excludes = this.plugin.settings.excludePatterns;
      const isExcluded = (p: string) => excludes.some(e => p.startsWith(e)) || p.includes('/' + this.configDir + '/') || p.startsWith(this.configDir + '/');
      let localRemoved = 0;
      for (const f of this.plugin.app.vault.getFiles()) {
        if (f.extension === 'md') continue;
        if (isExcluded(f.path)) continue;
        if (downloadedPaths.has(f.path)) continue;
        try { await this.plugin.app.fileManager.trashFile(f); localRemoved++; } catch { /* ignore */ }
      }
      if (localRemoved) console.debug('[joplin-sync] force pull removed ' + localRemoved + ' stale local files');

    } catch (e: any) {
      const msg = e?.message || e?.toString() || 'Unknown error';
      console.error('[joplin-sync] force pull failed:', msg);
      this.plugin.statusBar.setError(msg);
      new Notice('Force pull failed: ' + msg, 8000);
    } finally {
      this.running = false;
      await this.plugin.mapping.flush();
      this.plugin.statusBar.setIdle();
    }
  }

  private forcePullFolderPaths = new Map<string, string>();

  private async removeEmptyDirs(deletedPaths: string[]): Promise<number> {
    const dirs = new Set<string>();
    for (const p of deletedPaths) {
      const parts = p.split('/');
      for (let i = parts.length - 1; i > 0; i--) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
    const sorted = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
    let count = 0;
    const adapter = this.plugin.app.vault.adapter;
    for (const d of sorted) {
      try {
        if (await adapter.exists(d)) {
          await adapter.rmdir(d, false).catch(() => {}); // only succeeds if empty
          count++;
        }
      } catch {/* empty */}
    }
    if (count) console.debug('[joplin-sync] force pull: removed ' + count + ' empty dirs');
    return count;
  }

  private buildForcePullFolderPaths(folders: JoplinItem[]): void {
    this.forcePullFolderPaths.clear();
    const sanitize = (t: string) => safeFileName(t);
    const paths = new Map<string, string>();
    let remaining = [...folders];
    while (remaining.length > 0) {
      const next: JoplinItem[] = [];
      for (const f of remaining) {
        let parentPath: string | undefined;
        if (f.parent_id) {
          parentPath = paths.get(f.parent_id) ?? this.forcePullFolderPaths.get(f.parent_id);
          if (parentPath === undefined) {
            // Parent not yet resolved — check mapping or defer
            const m = this.plugin.mapping.getById(f.parent_id);
            if (m) { paths.set(f.id, m.path); continue; }
            next.push(f); continue;
          }
        } else {
          parentPath = '';
        }
        paths.set(f.id, parentPath + sanitize(f.title || '') + '/');
      }
      if (next.length === remaining.length) break;
      remaining = next;
    }
    for (const [id, p] of paths) this.forcePullFolderPaths.set(id, p);
  }

  private resolveForcePullFolderPath(parentId: string): string {
    if (!parentId) return '';
    const cached = this.forcePullFolderPaths.get(parentId);
    if (cached !== undefined) return cached;
    const m = this.plugin.mapping.getById(parentId);
    return m ? m.path : '';
  }

  // Enumerate EVERY live item on the server (notes, folders, resource metadata,
  // and resource blobs). Our addressing is FLAT: every Joplin item lives at
  // `root:/<id>.md` (or `root:/.resource/<id>` for resource blobs), with the
  // logical hierarchy encoded in each item's `parent_id` field — NOT in the
  // file-system path. Because of that, the server's path-based listing exposes
  // ALL items as direct children of root, regardless of their real folder
  // nesting. So we simply paginate `listChildrenOf(root)` to obtain the full
  // live set.
  //
  // Why not the `delta` endpoint? The real Joplin Server's delta feed (a) does
  // NOT return `item_type`, and (b) is a change-log that accumulates delete
  // events forever. Reconstructing "what is currently live" from it is fragile
  // and, in practice, caused forcePush's cleanup to delete every note and
  // forcePull to silently skip the whole vault.
  private async listAllRemoteItems(): Promise<import('../api/models').RemoteItemStat[]> {
    const out: import('../api/models').RemoteItemStat[] = [];
    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.listChildrenOf('', cursor);
      for (const it of page.items) {
        const name = (it as any).name || '';
        if (!name) continue;
        out.push({ name, updated_time: Number((it as any).updated_time) || 0 });
      }
      cursor = (page as any).cursor;
      if (!(page as any).has_more) break;
    }
    return out;
  }
}

export async function sha256(text: string | ArrayBuffer): Promise<string> {
  const data = typeof text === 'string' ? new TextEncoder().encode(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')) : text;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}