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
        this.data = JSON.parse(await adapter.read(this.filePath)) as ChangeLogData;
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
    if (e) { e.status = 'synced'; this.dirty = true; void this.persist(); }
  }

  /** Remove synced entries older than the retention window. */
  prune(maxAgeMs = 7 * 24 * 3600 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter(e => e.status === 'pending' || e.timestamp >= cutoff);
    if (this.data.entries.length !== before) { this.dirty = true; void this.persist(); }
  }

  private persistTimer: number | null = null;
  private async persist(): Promise<void> {
    if (this.persistTimer) return;
    this.persistTimer = window.setTimeout(async () => {
      this.persistTimer = null;
      try {
        const adapter = this.plugin.app.vault.adapter;
        const dir = this.plugin.manifest.dir + '/data';
        if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
        await adapter.write(this.filePath, JSON.stringify(this.data));
        this.dirty = false;
      } catch { /* best effort */ }
    }, 500);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const adapter = this.plugin.app.vault.adapter;
    try {
      const dir = this.plugin.manifest.dir + '/data';
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(this.filePath, JSON.stringify(this.data));
      this.dirty = false;
    } catch { /* best effort */ }
  }
}
