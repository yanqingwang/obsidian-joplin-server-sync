import type JoplinSyncPlugin from '../main';
import { ModelType } from '../api/models';

export type ChangeOp = 'create' | 'update' | 'delete' | 'rename';

export interface ChangeLogEntry {
  /** Stable identity of the file — survives rename/move across terminals. */
  fileId: string;
  op: ChangeOp;
  path: string;
  oldPath?: string;
  type: ModelType;
  /** SHA-256 of local content at enqueue time (for create/update). */
  hash?: string;
  timestamp: number;
  /** 'pending' until the server confirms the change was applied. */
  status: 'pending' | 'synced';
}

interface ChangeLogData {
  entries: ChangeLogEntry[];
}

/** Synced entries are kept for a week (history/diagnostics), but the file is
 *  capped: a vault that edits hundreds of notes a day would otherwise grow
 *  the JSON unboundedly and slow every load/persist. */
const MAX_SYNCED_KEEP = 2000;

export class ChangeLogStore {
  private data: ChangeLogData = { entries: [] };
  private dirty = false;

  constructor(private plugin: JoplinSyncPlugin) {}

  private get filePath() {
    return this.plugin.manifest.dir + '/data/changelog.json';
  }

  async load(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    if (adapter.exists && await adapter.exists(this.filePath)) {
      try {
        const parsed = JSON.parse(await adapter.read(this.filePath)) as ChangeLogData;
        this.data = parsed && Array.isArray(parsed.entries) ? parsed : { entries: [] };
      } catch { this.data = { entries: [] }; }
    }
  }

  /** Append or merge a change for a fileId (coalesce rapid successive ops). */
  push(entry: Omit<ChangeLogEntry, 'timestamp' | 'status'>): void {
    const now = Date.now();
    const existingIdx = this.data.entries.findIndex(e => e.fileId === entry.fileId && e.status === 'pending');
    if (existingIdx >= 0) {
      const prev = this.data.entries[existingIdx];
      // create + delete = no-op (file created then removed before sync)
      if (prev.op === 'create' && entry.op === 'delete') {
        this.data.entries.splice(existingIdx, 1);
      } else if (prev.op === 'create' && entry.op === 'update') {
        this.data.entries[existingIdx] = { ...prev, path: entry.path, hash: entry.hash, timestamp: now };
      } else if (prev.op === 'delete' && entry.op === 'create') {
        // delete then re-create the same file: it exists again, so the server
        // copy must be (re)written rather than deleted.
        this.data.entries[existingIdx] = { ...prev, op: 'update', path: entry.path, hash: entry.hash, oldPath: undefined, timestamp: now };
      } else {
        this.data.entries[existingIdx] = { ...prev, op: entry.op, path: entry.path, oldPath: entry.oldPath ?? prev.oldPath, hash: entry.hash ?? prev.hash, timestamp: now };
      }
    } else {
      this.data.entries.push({ ...entry, timestamp: now, status: 'pending' });
    }
    this.dirty = true;
    void this.persist();
  }

  pending(): ChangeLogEntry[] {
    return this.data.entries.filter(e => e.status === 'pending');
  }

  all(): ChangeLogEntry[] {
    return this.data.entries;
  }

  markSynced(fileId: string): void {
    const e = this.data.entries.find(x => x.fileId === fileId && x.status === 'pending');
    if (e) { e.status = 'synced'; this.dirty = true; }
  }

  /** Drop every pending entry. Used after a force operation rebuilt the
   *  vault — the deluge of watcher events it generated must not replay (C3). */
  clear(): void {
    this.data.entries = [];
    this.dirty = true;
  }

  /** Remove synced entries older than the retention window and cap the total
   *  number of retained synced entries. */
  prune(maxAgeMs = 7 * 24 * 3600 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.data.entries.length;
    const pending = this.data.entries.filter(e => e.status === 'pending');
    const synced = this.data.entries
      .filter(e => e.status === 'synced' && e.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_SYNCED_KEEP);
    this.data.entries = [...pending, ...synced];
    if (this.data.entries.length !== before) { this.dirty = true; void this.persist(); }
  }

  private persistTimer: number | null = null;
  private persist(): Promise<void> {
    // Coalesce bursts, but NEVER drop the last write: the previous version
    // returned early while a timer was armed, so a mutation landing inside the
    // 500ms window could be skipped if no later push arrived — losing exactly
    // the change the log exists to protect against a crash.
    if (this.persistTimer !== null) {
      window.clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    return new Promise<void>((resolve) => {
      this.persistTimer = window.setTimeout(() => {
        this.persistTimer = null;
        void this.writeNow().then(resolve, resolve);
      }, 500);
    });
  }

  private async writeNow(): Promise<void> {
    try {
      const adapter = this.plugin.app.vault.adapter;
      const dir = this.plugin.manifest.dir + '/data';
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      // Atomic replace: a crash mid-write must not truncate the change log,
      // otherwise the next cycle silently forgets unsynced local edits.
      const tmp = this.filePath + '.tmp';
      await adapter.write(tmp, JSON.stringify(this.data));
      if (await adapter.exists(this.filePath)) await adapter.remove(this.filePath);
      await adapter.rename(tmp, this.filePath);
      this.dirty = false;
    } catch { /* best effort */ }
  }

  async flush(): Promise<void> {
    if (this.persistTimer !== null) { window.clearTimeout(this.persistTimer); this.persistTimer = null; }
    if (!this.dirty) return;
    await this.writeNow();
  }
}
