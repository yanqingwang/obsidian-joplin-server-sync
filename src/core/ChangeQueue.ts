import type JoplinSyncPlugin from '../main';

export interface LocalChange {
  kind: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string;
  isFolder: boolean;
  time: number;
}

export class ChangeQueue {
  private items = new Map<string, LocalChange>();
  private debounceMs = 3000;

  constructor(private plugin: JoplinSyncPlugin) {}

  push(change: LocalChange): void {
    const prev = this.items.get(change.oldPath ?? change.path);
    if (change.kind === 'rename' && prev) {
      this.items.delete(change.oldPath!);
    }
    const merged = this.merge(prev, change);
    if (merged) this.items.set(change.path, merged);
    else this.items.delete(change.path);
    this.persist();
  }

  drain(): LocalChange[] {
    const now = Date.now();
    const ready: LocalChange[] = [];
    for (const [path, c] of this.items) {
      if (now - c.time >= this.debounceMs) {
        ready.push(c);
        this.items.delete(path);
      }
    }
    this.persist();
    return ready.sort((a, b) =>
      (Number(b.isFolder) - Number(a.isFolder)) || a.time - b.time);
  }

  requeue(changes: LocalChange[]): void {
    for (const c of changes) this.items.set(c.path, c);
    this.persist();
  }

  get size(): number { return this.items.size; }

  private merge(prev: LocalChange | undefined, next: LocalChange): LocalChange | null {
    if (!prev) return next;
    if (prev.kind === 'create' && next.kind === 'delete') return null;
    if (prev.kind === 'create' && next.kind === 'modify') return { ...next, kind: 'create' };
    if (next.kind === 'rename' && prev.kind === 'create')
      return { ...next, kind: 'create', oldPath: undefined };
    return next;
  }

  private persistTimer: number | null = null;
  private persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = window.setTimeout(async () => {
      this.persistTimer = null;
      const adapter = this.plugin.app.vault.adapter;
      await adapter.write(
        this.plugin.manifest.dir + '/data/queue.json',
        JSON.stringify([...this.items.values()]),
      );
    }, 500);
  }

  async restore(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    const p = this.plugin.manifest.dir + '/data/queue.json';
    if (await adapter.exists(p)) {
      for (const c of JSON.parse(await adapter.read(p)) as LocalChange[]) {
        this.items.set(c.path, c);
      }
    }
  }
}