import { Notice, Modal, TFile, TAbstractFile, TFolder } from 'obsidian';
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
import { stampFrontmatter } from './FileIdentity';
import { ResourceManager } from '../resource/ResourceManager';

export enum SyncState { Idle, Pushing, Pulling, Resolving, Error }

/** Normalize a path returned by adapter.list(): strip `./` prefixes and
 *  trailing slashes (real Obsidian may return either form). */
const normDir = (p: string) => p.replace(/^\.\//, '').replace(/\/+$/, '');

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
    return this.plugin.app.vault.configDir ?? '.obsidian';
  }

  constructor(private plugin: JoplinSyncPlugin) {
    this.syncInfo = new SyncInfoHandler(plugin.api, () => this.plugin.app.vault.getName());
    this.resources = new ResourceManager(plugin);
  }

  /**
   * Provision + load the E2EE master key so the live sync path can encrypt.
   *
   * Driven by the LOCAL `e2eePassword` setting (not the server's info.json),
   * so enabling E2EE here is a local decision:
   *   1. If a master key already exists on the server, feed + load it.
   *   2. Otherwise generate a fresh master key, upload it (type_=9), and mark
   *      the sync target as E2EE-enabled.
   *   3. Load every fed master key with the password and set `e2eeActive`.
   */
  async enableE2EE(): Promise<boolean> {
    // Both the toggle AND a non-empty password are required.
    if (!this.plugin.settings.e2eeEnabled) { this.e2eeActive = false; return false; }
    const pw = this.plugin.settings.e2eePassword;
    if (!pw) { this.e2eeActive = false; return false; }
    // Keys already loaded this session — keep them active.
    if (this.plugin.e2ee.hasLoadedKeys) { this.e2eeActive = true; return true; }

    const e2ee = this.plugin.e2ee;

    // Fast path: try the cached master-key id first (cheap single GET). If it
    // loads, keep it active — but still enumerate below so that ALL server
    // master keys are available for decrypting data encrypted with any of
    // them. One account may accumulate several keys over time; a pull must be
    // able to decrypt data regardless of which key a push used.
    const cachedId = this.plugin.mapping.e2eeMasterKeyId;
    let cachedOk = false;
    if (cachedId) {
      try {
        const raw = await this.plugin.api.getItem(cachedId + '.md');
        if (raw) {
          const item = this.serializer.unserialize(raw);
          if (item.type_ === ModelType.MasterKey) {
            e2ee.feedMasterKey(item);
            await e2ee.loadMasterKey(cachedId, pw);
            cachedOk = true;
            console.debug('[joplin-sync] E2EE cached key ' + cachedId + ' loaded');
          }
        }
      } catch (e: unknown) {
        console.warn('[joplin-sync] E2EE cached key ' + cachedId + ' failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    // Slow path: enumerate the server and load EVERY master key that the
    // password can decrypt. One account has ONE E2EE password — if master
    // keys exist, we only VERIFY the password against them. Never mint a new
    // key when any exist.
    const mkIds = await this.discoverMasterKeys();
    let anyLoaded = cachedOk;
    for (const id of mkIds) {
      try { await e2ee.loadMasterKey(id, pw); anyLoaded = true; }
      catch (e: unknown) {
        console.warn('[joplin-sync] E2EE master key ' + id + ' failed to load: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
    // Only when the server has NO master key at all do we provision the first
    // one. If keys exist but none match the password, the password is wrong —
    // surface that instead of silently creating a divergent key.
    if (!anyLoaded && mkIds.length === 0) {
      const mkId = createJoplinId();
      const mk = await e2ee.generateMasterKey(pw, mkId);
      const mkItem: JoplinItem = {
        id: mkId,
        parent_id: '',
        title: '',
        created_time: Date.now(),
        updated_time: Date.now(),
        user_created_time: Date.now(),
        user_updated_time: Date.now(),
        type_: ModelType.MasterKey,
        encryption_applied: 0,
        encryption_cipher_text: '',
        content: mk.encryptedContent,
      };
      await this.plugin.api.putItem(mkId + '.md', this.serializer.serialize(mkItem), true);
      e2ee.feedMasterKey(mkItem);
      try { await e2ee.loadMasterKey(mkId, pw); anyLoaded = true; } catch { /* ignore */ }
      this.plugin.mapping.setE2eeMasterKeyId(mkId);
      // Mark the sync target as E2EE-enabled for cross-client visibility.
      try { await this.plugin.api.putItem('info.json', JSON.stringify({ version: 3, e2ee: { value: true } })); } catch { /* best effort */ }
      console.debug('[joplin-sync] E2EE: generated + uploaded first master key ' + mkId);
    } else if (!anyLoaded && mkIds.length > 0) {
      new Notice('E2EE password is wrong — none of the ' + mkIds.length + ' server master keys could be decrypted. Check the password.');
    }
    this.e2eeActive = anyLoaded;
    if (anyLoaded) console.debug('[joplin-sync] E2EE active with ' + e2ee.availableMasterKeys.length + ' master key(s)');
    return anyLoaded;
  }

  /** Find existing MasterKey items (type_=9) on the server. */
  private async discoverMasterKeys(): Promise<string[]> {
    const e2ee = this.plugin.e2ee;
    const ids: string[] = [];
    let cursor: string | undefined;
    while (true) {
      // NOTE: this Joplin Server ignores the `item_type` query param on the
      // children endpoint, so we enumerate everything and filter by type_.
      const page = await this.plugin.api.listChildrenOf('', cursor);
      for (const stat of page.items) {
        if (!/^[0-9a-f]{32}\.md$/.test(stat.name) || stat.name.startsWith('.resource/')) continue;
        const raw = await this.plugin.api.getItem(stat.name);
        if (!raw) continue;
        const item = this.serializer.unserialize(raw);
        if (item.type_ === ModelType.MasterKey) { e2ee.feedMasterKey(item); ids.push(item.id); }
      }
      cursor = page.cursor;
      if (!page.has_more || !cursor) break;
    }
    return ids;
  }

  // ============ Phase 1: Legacy full upload ============
  async runFullUpload(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    this.ensureReady();
    try {
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      this.invalidateServerEncryptedCache();
      const uploadCompatErr = await this.checkEncryptionCompatibility('forcePush');
      if (uploadCompatErr) {
        this.plugin.statusBar.setError(uploadCompatErr);
        new Notice('Upload blocked: ' + uploadCompatErr, 10000);
        return;
      }
      await this.enableE2EE();
      const files = this.collectMarkdownFiles();
      let done = 0, skipped = 0;
      const failed: string[] = [];
      for (const batch of chunk(files, 5)) {
        await Promise.all(batch.map(async (file) => {
          try {
            const changed = await this.uploadNote(file, '');
            changed ? done++ : skipped++;
          } catch (e: unknown) {
            failed.push(file.path + ': ' + (e instanceof Error ? e.message : String(e)));
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
    // Stable identity from frontmatter — forcePush also stamps files that
    // predate the fileId feature so multi-terminal sync converges.
    let content = await this.plugin.app.vault.read(file);
    const fileId = await this.plugin.identity.ensureId(file);
    content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const existing = this.plugin.mapping.getById(fileId) ?? this.plugin.mapping.getByPath(file.path);
    if (!force && existing && existing.localHash === hash) return false;
    const id = existing?.joplinId ?? fileId;
    const item: JoplinItem = {
      id, parent_id: parentId, title: file.basename, body: content,
      created_time: file.stat.ctime, updated_time: file.stat.mtime,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Note, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    };

    // E2EE: encrypt the serialized note if a master key is loaded.
    const mkId = this.plugin.e2ee.activeKeyId ?? this.plugin.e2ee.firstLoadedKeyId;
    let payload: string;
    let encrypted = false;
    if (this.e2eeActive && mkId) {
      const serialized = this.serializer.serialize(item);
      const cipherText = await this.plugin.e2ee.encryptItem(serialized, mkId);
      const encItem: JoplinItem = {
        id, parent_id: parentId, title: '', body: '',
        created_time: item.created_time, updated_time: item.updated_time,
        user_created_time: item.user_created_time, user_updated_time: item.user_updated_time,
        type_: ModelType.Note, encryption_applied: 1, encryption_cipher_text: cipherText, markup_language: 1,
      };
      payload = this.serializer.serialize(encItem);
      encrypted = true;
    } else {
      payload = this.serializer.serialize(item);
    }
    const result = await this.plugin.api.putItem(id + '.md', payload, force);

    // Write-then-verify: GET back and compare hash (only meaningful for
    // plaintext; when encrypted the remote body is empty, so skip the check).
    if (!encrypted) {
      try {
        const raw = await this.plugin.api.getItem(id + '.md');
        if (raw) {
          const remote = this.serializer.unserialize(raw);
          const remoteHash = await sha256(remote.body ?? '');
          if (remoteHash !== hash) {
            console.warn('[joplin-sync] verify mismatch for: ' + file.path + ' (expected ' + hash + ', got ' + remoteHash + ')');
          }
        }
      } catch (verifyErr: unknown) {
        console.warn('[joplin-sync] verify skipped for: ' + file.path + ' - ' + (verifyErr instanceof Error ? verifyErr.message : String(verifyErr)));
      }
    }

    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: result.updated_time, syncedAt: Date.now(),
    });
    return true;
  }

  private collectMarkdownFiles(): TFile[] {
    return this.plugin.app.vault.getMarkdownFiles()
      .filter(f => !this.shouldExclude(f.path));
  }

  /** Unified exclusion rule — every sync path (push/pull/watcher/force)
   *  must consult this. Excludes: explicit excludePatterns, the config dir,
   *  Obsidian conflict files, and ANY path segment starting with `.`
   *  (hidden files/folders, Unix convention). */
  shouldExclude(path: string): boolean {
    if (this.plugin.settings.excludePatterns.some(p => path.startsWith(p))) return true;
    if (path.startsWith(this.configDir + '/') || path === this.configDir) return true;
    if (path.startsWith('_conflicts/')) return true;
    const segments = path.split('/').filter(s => s.length > 0);
    return segments.some(seg => seg.startsWith('.'));
  }

  // ============ Phase 2: Watcher + Scheduler ============
  startWatching(): void {
    this.watcher = new VaultWatcher(this.plugin, this.plugin.changeLog);
    this.watcher.start();
    this.pusher = new LocalPusher(this.plugin, this.plugin.changeLog);
    this.deltaPuller = new DeltaPuller(this.plugin, this.watcher);
  }

  private ensureReady(): void {
    if (!this.watcher) {
      this.watcher = new VaultWatcher(this.plugin, this.plugin.changeLog);
      this.watcher.start();
    }
    if (!this.pusher) this.pusher = new LocalPusher(this.plugin, this.plugin.changeLog);
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
    if (this.running || this.state !== SyncState.Idle) { new Notice('Sync already in progress'); return; }
    this.running = true;
    this.ensureReady();
    try {
      this.state = SyncState.Pushing;
      this.plugin.statusBar.setSyncing('pushing...');
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      const compatErr = await this.checkEncryptionCompatibility('cycle');
      if (compatErr) {
        this.state = SyncState.Error;
        this.plugin.statusBar.setError(compatErr);
        new Notice('Sync blocked: ' + compatErr, 10000);
        return;
      }
      await this.enableE2EE();

      if (!this.plugin.mapping.getDeltaCursor()) {
        this.plugin.statusBar.setSyncing('initial sync...');
        const rootFolderId = await this.ensureRootFolder();
        await new InitialSync(this.plugin).run(rootFolderId);
      }

      this.state = SyncState.Pushing;
      const pushResult = await this.pusher.pushAll();
      this.plugin.statusBar.setProgress(pushResult.created + pushResult.updated + pushResult.deleted, Math.max(pushResult.created + pushResult.updated + pushResult.deleted, 1), 'push');

      this.state = SyncState.Pulling;
      this.plugin.statusBar.setSyncing('pulling...');
      const pullResult = await this.deltaPuller.pullAll();
      this.plugin.statusBar.setProgress(pullResult.created + pullResult.updated + pullResult.deleted, Math.max(pullResult.created + pullResult.updated + pullResult.deleted, 1), 'pull');

      this.state = SyncState.Resolving;
      for (const t of [...this.plugin.mapping.tombstones]) {
        try { await this.plugin.api.deleteItem(t.joplinId + '.md'); }
        catch { /* already deleted on server — tombstone is just a local marker */ }
        this.plugin.mapping.clearTombstone(t.joplinId);
      }

      const totalMapped = this.plugin.mapping.all().length;
      this.plugin.statusBar.setOk(Date.now(), totalMapped);
      const c = (pushResult?.created ?? 0) + (pullResult?.created ?? 0);
      const u = (pushResult?.updated ?? 0) + (pullResult?.updated ?? 0);
      const d = (pushResult?.deleted ?? 0) + (pullResult?.deleted ?? 0);
      const totalFail = (pushResult?.fail ?? 0) + (pullResult?.fail ?? 0);
      this.plugin.logSync('sync', c + u + d, totalFail, { created: c, updated: u, deleted: d });
      const parts = ['Created ' + c, 'Updated ' + u, 'Deleted ' + d];
      if (totalFail) parts.push('Failed ' + totalFail);
      new Notice('Sync complete: ' + parts.join(', ') + '. ' + totalMapped + ' item(s) mapped');
    } catch (e: unknown) {
      this.state = SyncState.Error;
      const msg = e instanceof Error ? e.message : String(e ?? 'Unknown error');
      console.error('[joplin-sync] sync cycle failed:', msg);
      this.plugin.statusBar.setError(msg);
      new Notice('Sync failed: ' + msg, 8000);
    } finally {
      await this.plugin.mapping.flush();
      this.state = SyncState.Idle;
      this.running = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.timer) window.clearInterval(this.timer);
  }

  /** SHA-256 of a TFile's current content (used by the watcher). */
  async sha256Of(file: TFile): Promise<string> {
    const content = await this.plugin.app.vault.read(file);
    return sha256(content);
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

  /** Create (or reuse) the vault's root folder on the server. Everything this
   *  vault pushes is parented under it, so the delta-pull root filter
   *  (`belongsToRoot`) can reject items belonging to other vaults that share
   *  the same account/server — the root cause of cross-vault deletion. */
  async ensureRootFolder(): Promise<string> {
    const existing = this.plugin.mapping.rootFolderId;
    if (existing) {
      try {
        const raw = await this.plugin.api.getItem(existing + '.md');
        if (raw !== null) return existing;
      } catch { /* fall through and recreate */ }
    }
    const vaultName = this.plugin.app.vault.getName() || 'vault';
    const title = '_vault_' + vaultName;
    const id = createJoplinId();
    const now = Date.now();
    const item: JoplinItem = {
      id, parent_id: '', title, type_: ModelType.Folder,
      created_time: now, updated_time: now,
      user_created_time: now, user_updated_time: now,
      encryption_applied: 0, encryption_cipher_text: '',
    };
    await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item), true);
    this.plugin.mapping.setRootFolderId(id);
    this.plugin.mapping.upsert({
      joplinId: id, path: title + '/', type: ModelType.Folder,
      localHash: '', remoteUpdatedTime: now, syncedAt: now,
    });
    console.debug('[joplin-sync] root folder created: ' + title + ' (' + id + ')');
    return id;
  }

  async forcePush(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    this.ensureReady();
    this.watcher?.suspend();
    try {
      this.plugin.statusBar.setSyncing('force push: rebuilding server...');
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      this.invalidateServerEncryptedCache();
      const pushCompatErr = await this.checkEncryptionCompatibility('forcePush');
      if (pushCompatErr) {
        this.plugin.statusBar.setError(pushCompatErr);
        new Notice('Force push blocked: ' + pushCompatErr, 10000);
        return;
      }
      const migratingToE2EE =
        (this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword) &&
        !(await this.serverIsEncrypted());
      if (migratingToE2EE) {
        const ok = await this.confirmMigration();
        if (!ok) {
          this.plugin.statusBar.setIdle();
          new Notice('Force push cancelled — server stays plaintext.');
          return;
        }
      }
      await this.enableE2EE();

      const rootFolderId = await this.ensureRootFolder();
      const files = this.collectMarkdownFiles();
      // Items this vault owns (mapping BEFORE clearAll). reset and cleanup
      // only ever delete these — other vaults sharing the server are
      // preserved (C1).
      const ownedIds = new Set(this.plugin.mapping.all().map(e => e.joplinId));

      // ---- True-overwrite reset: delete EVERYTHING on the server first ----
      // (except info.json and master-key items, which are infra, not content).
      // This guarantees a clean slate: no stale/orphan/duplicate items remain
      // from previous partial syncs (which accumulated 2000+ items on the
      // test server while the vault only had ~30 files).
      {
        const remote = await this.listAllRemoteItems();
        let wiped = 0, skipped = 0;
        console.debug('[joplin-sync] force push reset: scanning ' + remote.length + ' remote items');
        // Master keys are NOT in the mapping (enableE2EE only caches their id),
        // so protect them explicitly — deleting them would break E2EE for all
        // synced clients (they could no longer decrypt server-stored data).
        const masterKeyIds = new Set(this.plugin.e2ee.availableMasterKeys);
        if (this.plugin.mapping.e2eeMasterKeyId) masterKeyIds.add(this.plugin.mapping.e2eeMasterKeyId);
        const protectedRootId = this.plugin.mapping.rootFolderId;
        for (const stat of remote) {
          if (stat.name === 'info.json') { skipped++; continue; }
          const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
          if (noteMatch) {
            const id = noteMatch[1];
            if (id === protectedRootId) { skipped++; continue; }
            const entry = this.plugin.mapping.getById(id);
            if (entry?.type === ModelType.MasterKey || masterKeyIds.has(id)) { skipped++; continue; }
            if (!ownedIds.has(id)) { skipped++; continue; } // foreign vault item
          } else {
            const resMatch = stat.name.match(/^\.resource\/([0-9a-f]{32})$/);
            if (resMatch && !ownedIds.has(resMatch[1])) { skipped++; continue; } // foreign blob
          }
          try { await this.plugin.api.deleteItem(stat.name); wiped++; }
          catch (e: unknown) {
            console.warn('[joplin-sync] reset delete failed: ' + stat.name + ' - ' + (e instanceof Error ? e.message : String(e)));
          }
        }
        // Clear local mapping so re-upload creates fresh IDs for everything.
        this.plugin.mapping.clearAll();
        console.debug('[joplin-sync] force push reset: wiped ' + wiped + ' items, kept ' + skipped + ' (info.json/master keys/foreign items)');
      }

      // IDs we actually push this run. Anything left on the server that is
      // NOT in here is a stale/duplicate/orphan item and must be removed so
      // that "force push" is a true overwrite (otherwise the server keeps
      // accumulating duplicates every run and the pull target diverges).
      const pushedNoteIds = new Set<string>();
      const pushedFolderIds = new Set<string>();
      // The vault root folder must NEVER be cleaned: it is not in the mapping
      // after clearAll() and would otherwise be deleted as an orphan at the
      // end of every force push (B5.2). It is only ever created once by
      // ensureRootFolder and reused across pushes.
      pushedFolderIds.add(rootFolderId);

      // Create sub-folders on server (if not already existing)
      const folderMap = new Map<string, string>();
      folderMap.set('', rootFolderId);
      const dirs = new Set<string>();

      // Helper to discover directory from a path
      const discoverParentDirs = (path: string) => {
        const d = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (!d) return;
        const parts = d.split('/');
        // Skip if any part starts with . (hidden directories)
        if (parts.some(p => p.startsWith('.'))) return;
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

      // Also discover empty directories. Materialize EVERY non-hidden,
      // non-excluded directory (including genuinely empty user folders like
      // AIReports/Charts), but skip known Obsidian/system trees. Uses the
      // FILESYSTEM adapter — disk is authoritative; the Obsidian vault model
      // (getAllLoadedFiles) can lag or omit dirs (B15).
      const SYSTEM_TOP_DIRS = new Set(['home', 'Library', 'node_modules', 'tmp', 'private', 'Users']);
      const adapter = this.plugin.app.vault.adapter;
      if (adapter && adapter.list) {
        const walkDirs = async (dir: string): Promise<void> => {
          try {
            const listing = await adapter.list(dir);
            for (const sub of listing.folders) {
              const clean = normDir(sub);
              if (!clean || clean === '.' || clean === '..') continue;
              const folderName = clean.split('/').pop() || '';
              if (folderName.startsWith('.')) continue;
              if (this.shouldExclude(clean + '/')) continue;
              const top = clean.split('/')[0];
              if (!clean.includes('/') && SYSTEM_TOP_DIRS.has(top)) continue;
              if (!folderMap.has(clean)) {
                const existing = this.plugin.mapping.getByPath(clean + '/');
                if (existing) {
                  folderMap.set(clean, existing.joplinId);
                  pushedFolderIds.add(existing.joplinId);
                } else {
                  dirs.add(clean);
                }
              }
              await walkDirs(clean);
            }
          } catch { /* ignore unreadable */ }
        };
        await walkDirs('');
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
              this.plugin.statusBar.setProgress(done, files.length, 'push');
            } catch (e: unknown) {
              fail++;
              console.error('[joplin-sync] upload fail [' + fail + ']:', file.path, e instanceof Error ? e.message : String(e));
            }
          }));
          await this.plugin.mapping.flush();
        }
      }
      if (!this.plugin.settings.syncFoldersOnly) {
        console.debug('[joplin-sync] force push notes: done=' + done + ' fail=' + fail + ' pushedNoteIds=' + pushedNoteIds.size);
      }

      // ---- Attachments/files: mirror EVERY local non-md file (except config) ----
      // Force push must be a true full mirror, so unreferenced loose files
      // (e.g. an exported `resources/` bucket) must also be synced; otherwise
      // the pull target would silently diverge. .obsidian/ is always excluded.
      const pushedResourceIds = new Set<string>();
      let rDone = 0, rFail = 0;
      if (!this.plugin.settings.syncFoldersOnly) {
        const allFiles = this.plugin.app.vault.getFiles();
        const resourceFiles = allFiles.filter(f => f.extension !== 'md' && !this.shouldExclude(f.path));
        if (resourceFiles.length > 0) {
          for (const batch of chunk(resourceFiles, 5)) {
            await Promise.all(batch.map(async (f) => {
              try { const rid = await this.resources.uploadResource(f, true); pushedResourceIds.add(rid); rDone++; }
              catch (e: unknown) { rFail++; console.error('[joplin-sync] resource upload fail:', f.path, e instanceof Error ? e.message : String(e)); }
              this.plugin.statusBar.setProgress(rDone + rFail, resourceFiles.length, 'files');
            }));
            await this.plugin.mapping.flush();
          }
        }
        if (rDone || rFail) console.debug('[joplin-sync] force push files: ' + rDone + ' uploaded, ' + rFail + ' failed');
      }

      // ---- True-overwrite cleanup: delete server items not present locally ----      // Notes are only removed when we actually pushed notes this run
      // (in folders-only mode we must not wipe the server's notes).
      let removed = 0, removedNotes = 0, removedFolders = 0, removedResources = 0;
      // Master keys are never in the pushed sets — always preserve them.
      const protectedMasterKeys = new Set(this.plugin.e2ee.availableMasterKeys);
      if (this.plugin.mapping.e2eeMasterKeyId) protectedMasterKeys.add(this.plugin.mapping.e2eeMasterKeyId);
      const remote = await this.listAllRemoteItems();
      console.debug('[joplin-sync] force push cleanup: scanning ' + remote.length + ' remote items');
      // Parent-chain cache for orphan-folder ownership checks: an orphan folder
      // (not in the fresh mapping) still belongs to this vault when its parent
      // chain reaches OUR root — it must be deleted, while foreign vaults'
      // folders (their own `_vault_*` roots) are preserved (C1).
      const parentCache = new Map<string, string>();
      const ownChainCache = new Map<string, boolean>();
      const readParentId = async (id: string): Promise<string | undefined> => {
        const cached = parentCache.get(id);
        if (cached !== undefined) return cached || undefined;
        try {
          const raw = await this.plugin.api.getItem(id + '.md');
          if (!raw) { parentCache.set(id, ''); return undefined; }
          const item = this.serializer.unserialize(raw);
          const pid = item.parent_id ?? '';
          parentCache.set(id, pid);
          return pid || undefined;
        } catch { parentCache.set(id, ''); return undefined; }
      };
      const isOwnChain = async (id: string): Promise<boolean> => {
        const rootId = this.plugin.mapping.rootFolderId;
        if (!rootId) return false;
        const cached = ownChainCache.get(id);
        if (cached !== undefined) return cached;
        const visited = new Set<string>();
        let pid = id;
        let depth = 0;
        while (pid && !visited.has(pid) && depth < 64) {
          visited.add(pid);
          if (pid === rootId) {
            for (const v of visited) ownChainCache.set(v, true);
            return true;
          }
          const next = await readParentId(pid);
          if (!next) break;
          pid = next;
          depth++;
        }
        for (const v of visited) ownChainCache.set(v, false);
        return false;
      };
      for (const stat of remote) {
        const noteMatch = stat.name.match(/^([0-9a-f]{32})\.md$/);
        if (noteMatch) {
          const id = noteMatch[1];
          if (protectedMasterKeys.has(id)) continue;
          const inPushed = pushedNoteIds.has(id) || pushedFolderIds.has(id) || pushedResourceIds.has(id);
          if (inPushed) continue;
          const entry = this.plugin.mapping.getById(id);
          if (entry?.type === ModelType.Folder) {
            try { await this.plugin.api.deleteItem(stat.name); removed++; removedFolders++; } catch { /* ignore */ }
          } else if (entry?.type === ModelType.Resource) {
            try { await this.plugin.api.deleteItem(stat.name); removed++; removedResources++; } catch { /* ignore */ }
          } else if (entry) {
            // Note not pushed this run but still mapped: delete (owned before).
            if (!this.plugin.settings.syncFoldersOnly) {
              try { await this.plugin.api.deleteItem(stat.name); removed++; removedNotes++; } catch { /* ignore */ }
            }
          } else {
            // Unknown item: it is an orphan only when its parent chain belongs
            // to THIS vault (C1: foreign vault items must stay).
            const isOwnOrphan = await isOwnChain(id);
            if (!isOwnOrphan) continue;
            try {
              const raw = await this.plugin.api.getItem(stat.name);
              const item = raw ? this.serializer.unserialize(raw) : undefined;
              const t = item?.type_;
              await this.plugin.api.deleteItem(stat.name);
              removed++;
              if (t === ModelType.Folder) removedFolders++;
              else if (t === ModelType.Resource) removedResources++;
              else removedNotes++;
            } catch { /* ignore */ }
          }
        } else {
          // resource blob: cleanup orphans so the server stays in sync —
          // but only blobs we owned before this push (C1).
          const resMatch = stat.name.match(/^\.resource\/([0-9a-f]{32})$/);
          if (resMatch && !this.plugin.settings.syncFoldersOnly && ownedIds.has(resMatch[1])) {
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

      // Unified accounting: count EVERY local file (notes + resources), the
      // same way forcePull reports (notes + resources), so push and pull show
      // matching totals. Folders-only mode reports folders only.
      if (!this.plugin.settings.syncFoldersOnly) {
        const totalPushed = done + rDone;
        const totalFail = fail + rFail;
        this.plugin.logSync('push', totalPushed, totalFail);
        new Notice('Force push: ' + totalPushed + ' items' + (totalFail ? ', ' + totalFail + ' failed' : ''));
        if (totalFail) {
          this.plugin.statusBar.setError('push: ' + totalFail + ' failed');
        } else {
          this.plugin.statusBar.setOk(Date.now(), totalPushed);
        }
      } else {
        this.plugin.statusBar.setOk(Date.now(), totalFolders);
      }
    } finally {
      this.watcher?.resume();
      this.plugin.changeLog.clear(); // C3: watcher events from the rebuild must not replay
      await this.plugin.changeLog.flush(); // persist the clear — dirty flag alone loses it
      this.running = false;
      await this.plugin.mapping.flush();
    }
  }

  // ============ Force Pull: overwrite local with server ============
  async forcePull(): Promise<void> {
    if (this.running) { new Notice('Sync already in progress'); return; }
    this.running = true;
    this.ensureReady();
    this.watcher?.suspend();
    try {
      await this.forcePullInner();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Unknown error');
      console.error('[joplin-sync] force pull failed:', msg);
      this.plugin.statusBar.setError(msg);
      new Notice('Force pull failed: ' + msg, 8000);
    } finally {
      this.watcher?.resume();
      this.plugin.changeLog.clear(); // C3: watcher events from the rebuild must not replay
      await this.plugin.changeLog.flush(); // persist the clear — dirty flag alone loses it
      this.running = false;
      await this.plugin.mapping.flush();
    }
  }

  /** forcePull body WITHOUT the running guard, so InitialSync can call it
   *  inside syncCycle (which already holds the lock) (C2). */
  async forcePullInner(): Promise<void> {
    try {
      this.plugin.statusBar.setSyncing('force pull: clearing local...');
      await this.syncInfo.checkOrInit();
      this.e2eeActive = this.syncInfo.e2eeEnabled;
      this.invalidateServerEncryptedCache();
      const pullCompatErr = await this.checkEncryptionCompatibility('forcePull');
      if (pullCompatErr) {
        this.plugin.statusBar.setError(pullCompatErr);
        new Notice('Force pull blocked: ' + pullCompatErr, 10000);
        return;
      }
      await this.enableE2EE();
      this.plugin.mapping.clearAll();

      // Delete ALL files and folders except config + excluded dirs
      const adapter = this.plugin.app.vault.adapter;
      const isKept = (p: string) => this.shouldExclude(p);
      let delCount = 0, delDirCount = 0;

      // Delete all non-kept files
      for (const f of this.plugin.app.vault.getFiles()) {
        if (!isKept(f.path)) {
          const fm = this.plugin.app.fileManager as unknown as { trashFile?: (f: TAbstractFile) => Promise<void> } | undefined;
          try {
            if (fm?.trashFile) await fm.trashFile(f);
            else await (this.plugin.app.vault as unknown as { remove: (x: TAbstractFile) => Promise<void> }).remove(f);
            delCount++;
          } catch (e: unknown) {
            console.warn('[joplin-sync] force pull file delete failed: ' + f.path + ' - ' + (e instanceof Error ? e.message : String(e)));
          }
        }
      }

      // Delete ALL remaining folders bottom-up, enumerating via the FILESYSTEM
      // adapter — disk is authoritative, the Obsidian vault model can lag
      // after hundreds of trashFile calls. adapter.list may return names
      // with a `./` prefix in real Obsidian: normalize them instead of
      // filtering on '/' (which silently skipped every folder — B15).
      const listAll = async (dir: string): Promise<string[]> => {
        const result: string[] = [];
        try {
          if (adapter.list) {
            const listing = await adapter.list(dir);
            for (const sub of listing.folders) {
              const clean = normDir(sub);
              if (!clean || clean === '.' || clean === '..') continue;
              const children = await listAll(clean);
              result.push(...children, clean);
            }
          }
        } catch {/* ignore unreadable */}
        return result;
      };
      let allLocalDirs: string[] = [];
      try {
        if (adapter.list) {
          const root = await adapter.list('');
          for (const d of root.folders) {
            const clean = normDir(d);
            if (!clean || clean === '.' || clean === '..') continue;
            if (isKept(clean)) continue;
            const subs = await listAll(clean);
            allLocalDirs.push(...subs, clean);
          }
        }
      } catch {/* ignore */}
      allLocalDirs = [...new Set(allLocalDirs)];
      allLocalDirs.sort((a, b) => b.split('/').length - a.split('/').length);
      for (const d of allLocalDirs) {
        if (isKept(d)) continue;
        try {
          if (await adapter.exists(d)) {
            // Non-recursive on purpose: files were already deleted above, so a
            // dir that is still non-empty contains kept (excluded) files and
            // must be preserved. Recursive rmdir would delete them (data loss).
            await adapter.rmdir(d, false);
            delDirCount++;
          }
        } catch (e: unknown) {
          console.warn('[joplin-sync] force pull rmdir failed: ' + d + ' - ' + (e instanceof Error ? e.message : String(e)));
        }
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
          const allowedPullTypes = new Set([ModelType.Note, ModelType.Folder, ModelType.Resource, ModelType.MasterKey]);
          if (!allowedPullTypes.has(item.type_)) continue;
          if (item.type_ === ModelType.MasterKey) { e2ee.feedMasterKey(item); continue; }

          if (e2ee.isEncrypted(item)) {
            try {
              const ds = await e2ee.decryptItem(item);
              if (ds) { const d = this.serializer.unserialize(ds); allItems.push(d); }
            } catch { failed++; continue; }
          } else {
            allItems.push(item);
          }
        } catch (e: unknown) {
          failed++;
          if (failed <= 3) console.error('[joplin-sync] force-pull:', stat.name, e);
        }
      }

      // Learn the sync root from the server first (B3): on a mirror vault the
      // top-level `_vault_<name>` folder IS the root. Must happen BEFORE the
      // belongs-to-root filter so fresh vaults can discover their own root.
      const preFolders = allItems.filter(i => i.type_ === ModelType.Folder);
      const serverRoot = preFolders.find(f => !f.parent_id && (f.title || '').startsWith('_vault_'));
      if (serverRoot && !this.plugin.mapping.rootFolderId) {
        this.plugin.mapping.setRootFolderId(serverRoot.id);
      }

      // Root isolation: when multiple vaults share one server account, only
      // items whose parent chain reaches OUR root folder belong to this vault
      // (same rule as DeltaPuller.belongsToRoot). Resources and master keys
      // stay global — a resource is referenced by note id, not by folder
      // hierarchy, so filtering them by root would drop legitimate
      // attachments shared across the account (matches DeltaPuller).
      const filterRootId = this.plugin.mapping.rootFolderId;
      if (filterRootId) {
        const parentMap = new Map<string, string>();
        for (const it of allItems) if (it.parent_id) parentMap.set(it.id, it.parent_id);
        const ancestorCache = new Map<string, boolean>();
        const belongsToRoot = (item: JoplinItem): boolean => {
          if (item.type_ === ModelType.Resource || item.type_ === ModelType.MasterKey) return true;
          let pid = item.parent_id;
          if (!pid) return false;
          const visited = new Set<string>();
          let depth = 0;
          while (pid && !visited.has(pid) && depth < 64) {
            visited.add(pid);
            if (pid === filterRootId) {
              for (const v of visited) ancestorCache.set(v, true);
              return true;
            }
            const cached = ancestorCache.get(pid);
            if (cached !== undefined) {
              for (const v of visited) ancestorCache.set(v, cached);
              return cached;
            }
            const next = parentMap.get(pid);
            if (next === undefined || next === pid) {
              for (const v of visited) ancestorCache.set(v, false);
              return false;
            }
            pid = next;
            depth++;
          }
          return false;
        };
        const before = allItems.length;
        for (let i = allItems.length - 1; i >= 0; i--) {
          if (!belongsToRoot(allItems[i])) allItems.splice(i, 1);
        }
        if (allItems.length !== before) {
          console.debug('[joplin-sync] force pull root filter: kept ' + allItems.length + '/' + before + ' items (excluded foreign-vault items)');
        }
      }

      // Pre-compute folder paths from all items.
      // A mirror vault (fresh mapping) must learn the sync root from the
      // server: the top-level `_vault_<name>` folder is THE root — map it to
      // the local vault root (''), so the pulled tree has no `_vault_`
      // prefix and matches the owner vault's layout (B3).
      const folders = allItems.filter(i => i.type_ === ModelType.Folder);
      this.buildForcePullFolderPaths(folders);

      // Create folders first
      const pullRootId = this.plugin.mapping.rootFolderId;
      for (const f of folders) {
        if (!f.title) { skipped++; continue; }
        // The sync root folder is virtual — it maps to the local vault root,
        // never a real _vault_<name>/ directory (B3).
        if (f.id === pullRootId) {
          this.plugin.mapping.upsert({
            joplinId: f.id, path: '', type: ModelType.Folder,
            localHash: '', remoteUpdatedTime: f.updated_time, syncedAt: Date.now(),
          });
          continue;
        }
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
        } catch (e: unknown) {
          console.warn('[joplin-sync] force-pull folder:', f.title, e instanceof Error ? e.message : String(e));
        }
      }

      // Then download notes to correct folders
      const notes = allItems.filter(i => i.type_ === ModelType.Note);
      const usedPaths = new Set<string>();
      for (const item of notes) {
        if (!item.title) { skipped++; continue; }
        try {
          const dir = this.resolveForcePullFolderPath(item.parent_id);
          const sanitized = safeFileName(item.title);
          let path = dir + sanitized + '.md';
          // Same directory, same sanitized title: a second note must NOT
          // overwrite the first — dedupe with an id suffix (B9).
          if (usedPaths.has(path)) {
            path = dir + sanitized + ' (' + item.id.slice(0, 7) + ').md';
          }
          usedPaths.add(path);

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
          const stamped = stampFrontmatter(body || '', item.id);
          if (existing instanceof TFile) {
            await this.plugin.app.vault.modify(existing, stamped);
          } else if (!existing) {
            await this.plugin.app.vault.create(path, stamped);
          }
          const hash = await sha256(stamped);
          this.plugin.mapping.upsert({
            joplinId: item.id, path, type: ModelType.Note,
            localHash: hash, remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
          });
          done++;
        } catch (e: unknown) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('401')) try { await this.plugin.api.login(true); } catch { void 0; }
          if (failed <= 3) console.error('[joplin-sync] force-pull:', item.title, msg);
        }
        this.plugin.statusBar.setProgress(done, notes.length, 'pull');
      }

      let cursor: string | undefined;
      while (true) {
        const page = await this.plugin.api.delta(cursor);
        if (page.has_more && !page.cursor) break;
        cursor = page.cursor;
        if (!page.has_more) break;
      }
      this.plugin.mapping.setDeltaCursor(cursor ?? '');
      await this.plugin.mapping.flush();

      // ---- Attachments (Joplin Resources) → local files ----
      const resources = allItems.filter(i => i.type_ === ModelType.Resource);
      const downloadedPaths = new Set<string>();
      let rDone = 0, rFail = 0;
      if (resources.length > 0) {
        for (const r of resources) {
          try { const p = await this.resources.downloadResource(r); if (p) downloadedPaths.add(p); rDone++; }
          catch (e: unknown) { rFail++; if (rFail <= 3) console.error('[joplin-sync] force-pull resource:', r.id, e instanceof Error ? e.message : String(e)); }
          this.plugin.statusBar.setProgress(rDone + rFail, resources.length, 'files');
        }
      }
      if (rDone || rFail) console.debug('[joplin-sync] force pull attachments: ' + rDone + ' downloaded, ' + rFail + ' failed');

      const totalSynced = done + rDone;
      const totalFail = failed + rFail;
      if (totalFail) {
        this.plugin.statusBar.setError('pull: ' + totalFail + ' failed');
      } else {
        this.plugin.statusBar.setOk(Date.now(), totalSynced);
      }
      new Notice('Force pull: ' + totalSynced + ' items' + (totalFail ? ', ' + totalFail + ' failed' : ''));
      this.plugin.logSync('pull', totalSynced, totalFail);

      // Remove stale local non-md files (cleanup from previous syncs)
      let localRemoved = 0;
      for (const f of this.plugin.app.vault.getFiles()) {
        if (f.extension === 'md') continue;
        if (this.shouldExclude(f.path)) continue;
        if (downloadedPaths.has(f.path)) continue;
        try { await this.plugin.app.fileManager.trashFile(f); localRemoved++; } catch { /* ignore */ }
      }
      if (localRemoved) console.debug('[joplin-sync] force pull removed ' + localRemoved + ' stale local files');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? 'Unknown error');
      console.error('[joplin-sync] force pull failed:', msg);
      this.plugin.statusBar.setError(msg);
      new Notice('Force pull failed: ' + msg, 8000);
    } finally {
      await this.plugin.mapping.flush();
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
    const rootId = this.plugin.mapping.rootFolderId;
    // The sync root folder maps to the local vault root (''), not to a
    // real _vault_<name>/ directory (B3).
    if (rootId) paths.set(rootId, '');
    let remaining = [...folders];
    while (remaining.length > 0) {
      const next: JoplinItem[] = [];
      for (const f of remaining) {
        let parentPath: string | undefined;
        if (f.parent_id) {
          if (f.parent_id === rootId) {
            parentPath = '';
          } else {
            parentPath = paths.get(f.parent_id) ?? this.forcePullFolderPaths.get(f.parent_id);
            if (parentPath === undefined) {
              const m = this.plugin.mapping.getById(f.parent_id);
              if (m) { paths.set(f.id, m.path); continue; }
              next.push(f); continue;
            }
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
    // The vault's own root folder maps to the local vault root (''), so the
    // owner vault never nests its own files under _vault_<name>/ (B3).
    if (parentId === this.plugin.mapping.rootFolderId) return '';
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
        out.push(it);
      }
      cursor = page.cursor;
      if (!page.has_more) break;
      if (!cursor) break; // safety: no cursor but has_more = prevent infinite loop
    }
    return out;
  }

  private serverEncryptedCache: boolean | null = null;

  /** Actual server E2EE state from item bodies — master key present or any
   *  item carries encryption_applied: 1. Does NOT trust the info.json flag
   *  (it can be stale: left `e2ee:true` from an earlier aborted migration
   *  while the server holds no master key and only plaintext items).
   *  Result is cached per session (C6): a full GET scan on every cycle is
   *  O(n) requests. */
  private async serverIsEncrypted(): Promise<boolean> {
    if (this.serverEncryptedCache !== null) return this.serverEncryptedCache;
    // Fast path: local E2EE fully off → the compatibility rule is trivially
    // satisfied unless the server has ciphertext, which only matters when we
    // are about to write plaintext. Cycle syncs are read-mostly; only force
    // operations need the real answer. (C6)
    const localEncrypted = this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword;
    if (!localEncrypted) {
      this.serverEncryptedCache = false;
      return false;
    }
    const remote = await this.listAllRemoteItems();
    for (const stat of remote) {
      if (!/^[0-9a-f]{32}\.md$/.test(stat.name)) continue;
      try {
        const raw = await this.plugin.api.getItem(stat.name);
        if (!raw) continue;
        const item = this.serializer.unserialize(raw);
        if (item.type_ === ModelType.MasterKey || item.encryption_applied === 1) {
          this.serverEncryptedCache = true;
          return true;
        }
      } catch { /* skip unreadable */ }
    }
    this.serverEncryptedCache = false;
    return false;
  }

  /** Invalidate the cached server E2EE state (settings changed / force op). */
  private invalidateServerEncryptedCache(): void {
    this.serverEncryptedCache = null;
  }

  /**
   * E2EE compatibility rule: an encrypted vault may only sync with an
   * encrypted target, a plaintext vault only with a plaintext target.
   * Mixing them corrupts or silently loses data. Returns null when states
   * match (or the mismatch is allowed for the action), else an error
   * message the caller should surface and abort with.
   */
  private async checkEncryptionCompatibility(action: 'cycle' | 'forcePush' | 'forcePull'): Promise<string | null> {
    const localEncrypted = this.plugin.settings.e2eeEnabled && !!this.plugin.settings.e2eePassword;
    const serverEncrypted = await this.serverIsEncrypted();

    if (localEncrypted === serverEncrypted) return null;

    if (localEncrypted && !serverEncrypted) {
      if (action === 'forcePush') return null;
      return 'Local vault has E2EE enabled but the server is a plaintext target. ' +
        'Encrypted and unencrypted vaults cannot sync. Run Force Push to migrate the server to E2EE first.';
    }

    if (action === 'forcePush') {
      return 'Server is E2EE-encrypted but this vault is not. Force Push would overwrite encrypted data with plaintext — aborted. ' +
        'Enable E2EE + enter the password on this vault first.';
    }
    return 'Server is E2EE-encrypted but this vault is not. Encrypted and unencrypted vaults cannot sync. ' +
      'Enable E2EE + enter the password, then sync.';
  }

  private confirmMigration(): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.plugin.app);
      modal.titleEl.setText('Migrate to E2EE');
      modal.contentEl.createEl('p', {
        text: 'This vault has E2EE enabled but the server is plaintext. Force Push will re-upload EVERYTHING as encrypted data and mark the server as E2EE — other plaintext clients will no longer be able to sync. Continue?',
      });
      const btns = modal.contentEl.createDiv();
      const okBtn = btns.createEl('button', { text: 'Migrate (encrypt server)' });
      okBtn.addClass('mod-cta');
      okBtn.onclick = () => { modal.close(); resolve(true); };
      const cancelBtn = btns.createEl('button', { text: 'Cancel' });
      cancelBtn.onclick = () => { modal.close(); resolve(false); };
      modal.open();
    });
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