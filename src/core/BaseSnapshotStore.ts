import type JoplinSyncPlugin from '../main';

interface SnapshotFileData {
  version: number;
  /** joplinId → last-synced plaintext body */
  bodies: Record<string, string>;
}

/**
 * Last-synced ("base") snapshot of note bodies.
 *
 * A real three-way merge needs THREE inputs: base, local, remote. Before this
 * store the base was never persisted, so `ConflictResolver.readBase()` could
 * only ever return the local file itself (base ≈ local) and every genuine
 * both-sides edit fell through to Duplicate — i.e. the "auto-merge" feature
 * was dead code.
 *
 * Storage: one JSON file per note would be thousands of small reads; a single
 * file would be rewritten on every pull. We keep ONE in-memory map and flush
 * it atomically at the end of a sync cycle, pruning entries whose item is no
 * longer mapped. Bodies are capped so a huge attachment-like note can't blow
 * up plugin storage; oversized notes simply fall back to strategy resolution.
 */
const MAX_BODY_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export class BaseSnapshotStore {
  private data: SnapshotFileData = { version: 1, bodies: {} };
  private dirty = false;
  private totalBytes = 0;

  constructor(private plugin: JoplinSyncPlugin) {}

  private get filePath() {
    return this.plugin.manifest.dir + '/data/base-snapshots.json';
  }

  async load(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    try {
      if (adapter.exists && await adapter.exists(this.filePath)) {
        const parsed = JSON.parse(await adapter.read(this.filePath)) as SnapshotFileData;
        if (parsed && typeof parsed.bodies === 'object' && parsed.bodies) {
          this.data = { version: 1, bodies: parsed.bodies };
          this.totalBytes = this.computeBytes();
        }
      }
    } catch (e: unknown) {
      // Corrupt or truncated snapshot: it only ever IMPROVES conflict
      // resolution, so discarding it is safe (worst case: strategy fallback).
      console.warn('[joplin-sync] base snapshot unreadable, starting fresh: ' + (e instanceof Error ? e.message : String(e)));
      this.data = { version: 1, bodies: {} };
      this.totalBytes = 0;
    }
    // Drop snapshots for items that are no longer mapped.
    this.prune();
  }

  get(id: string): string | null {
    const v = this.data.bodies[id];
    return v === undefined ? null : v;
  }

  set(id: string, body: string): void {
    if (typeof body !== 'string') return;
    if (body.length * 2 > MAX_BODY_BYTES) { this.delete(id); return; }
    const prev = this.data.bodies[id];
    if (prev === body) return;
    if (prev !== undefined) this.totalBytes -= prev.length * 2;
    if (this.totalBytes + body.length * 2 > MAX_TOTAL_BYTES) {
      // Over budget: keep the small, high-value entries and skip new ones.
      return;
    }
    this.data.bodies[id] = body;
    this.totalBytes += body.length * 2;
    this.dirty = true;
  }

  delete(id: string): void {
    const prev = this.data.bodies[id];
    if (prev === undefined) return;
    this.totalBytes -= prev.length * 2;
    delete this.data.bodies[id];
    this.dirty = true;
  }

  /** Forget snapshots whose joplinId is no longer in the mapping. */
  prune(): void {
    const live = new Set(this.plugin.mapping.all().map(e => e.joplinId));
    let removed = 0;
    for (const id of Object.keys(this.data.bodies)) {
      if (!live.has(id)) { this.delete(id); removed++; }
    }
    if (removed) console.debug('[joplin-sync] base snapshot pruned ' + removed + ' stale entries');
  }

  get size(): number { return Object.keys(this.data.bodies).length; }

  clear(): void {
    this.data = { version: 1, bodies: {} };
    this.totalBytes = 0;
    this.dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.plugin.manifest.dir + '/data';
    try {
      if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
      const tmp = this.filePath + '.tmp';
      await adapter.write(tmp, JSON.stringify(this.data));
      if (await adapter.exists(this.filePath)) await adapter.remove(this.filePath);
      await adapter.rename(tmp, this.filePath);
      this.dirty = false;
    } catch (e: unknown) {
      console.warn('[joplin-sync] base snapshot flush failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  private computeBytes(): number {
    let n = 0;
    for (const v of Object.values(this.data.bodies)) n += (v?.length ?? 0) * 2;
    return n;
  }
}
