import type JoplinSyncPlugin from '../main';
import { ModelType } from '../api/models';

export interface MappingEntry {
  joplinId: string;
  path: string;
  type: ModelType;
  localHash: string;
  remoteUpdatedTime: number;
  syncedAt: number;
}

interface MappingData {
  version: number;
  deltaCursor: string;
  rootFolderId: string;
  entries: MappingEntry[];
  tombstones: { joplinId: string; type: ModelType; deletedAt: number }[];
  e2eeMasterKeyId?: string;
}

export class MappingStore {
  private data: MappingData = { version: 1, deltaCursor: '', rootFolderId: '', entries: [], tombstones: [] };
  private byId = new Map<string, MappingEntry>();
  private byPath = new Map<string, MappingEntry>();
  private dirty = false;

  constructor(private plugin: JoplinSyncPlugin) {}

  private get filePath() {
    return this.plugin.manifest.dir + '/data/mapping.json';
  }

  async load(): Promise<void> {
    const adapter = this.plugin.app.vault.adapter;
    if (adapter.exists) {
      if (await adapter.exists(this.filePath)) {
        this.data = JSON.parse(await adapter.read(this.filePath)) as MappingData;
      }
    }
    this.rebuildIndexes();
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    const adapter = this.plugin.app.vault.adapter;
    const dir = this.plugin.manifest.dir + '/data';
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    const tmp = this.filePath + '.tmp';
    await adapter.write(tmp, JSON.stringify(this.data));
    if (await adapter.exists(this.filePath)) await adapter.remove(this.filePath);
    await adapter.rename(tmp, this.filePath);
    this.dirty = false;
  }

  getByPath(path: string): MappingEntry | undefined { return this.byPath.get(path); }
  getById(id: string): MappingEntry | undefined { return this.byId.get(id); }
  all(): MappingEntry[] { return this.data.entries; }
  getDeltaCursor(): string { return this.data.deltaCursor; }
  setDeltaCursor(cursor: string) { this.data.deltaCursor = cursor; this.dirty = true; }
  setRootFolderId(id: string) { this.data.rootFolderId = id; this.dirty = true; }
  get rootFolderId(): string { return this.data.rootFolderId; }

  upsert(entry: MappingEntry): void {
    const existing = this.byId.get(entry.joplinId);
    if (existing) {
      this.byPath.delete(existing.path);
      Object.assign(existing, entry);
      this.byPath.set(existing.path, existing);
    } else {
      this.data.entries.push(entry);
      this.byId.set(entry.joplinId, entry);
      this.byPath.set(entry.path, entry);
    }
    this.dirty = true;
  }

  remove(joplinId: string): void {
    const e = this.byId.get(joplinId);
    if (!e) return;
    this.data.entries = this.data.entries.filter(x => x.joplinId !== joplinId);
    this.byId.delete(joplinId);
    this.byPath.delete(e.path);
    this.dirty = true;
  }

  clearAll(): void {
    this.data.entries = [];
    this.byId.clear();
    this.byPath.clear();
    this.dirty = true;
  }

  get tombstones() { return this.data.tombstones; }

  addTombstone(joplinId: string, type: ModelType): void {
    this.data.tombstones.push({ joplinId, type, deletedAt: Date.now() });
    this.dirty = true;
  }

  clearTombstone(joplinId: string): void {
    this.data.tombstones = this.data.tombstones.filter(t => t.joplinId !== joplinId);
    this.dirty = true;
  }

  renamePrefix(oldPrefix: string, newPrefix: string): void {
    for (const e of this.data.entries) {
      if (e.path === oldPrefix || e.path.startsWith(oldPrefix)) {
        this.byPath.delete(e.path);
        e.path = newPrefix + e.path.slice(oldPrefix.length);
        this.byPath.set(e.path, e);
      }
    }
    this.dirty = true;
  }

  get e2eeMasterKeyId(): string | undefined { return this.data.e2eeMasterKeyId; }
  setE2eeMasterKeyId(id: string): void { this.data.e2eeMasterKeyId = id; this.dirty = true; }

  private rebuildIndexes(): void {
    this.byId.clear();
    this.byPath.clear();
    for (const e of this.data.entries) {
      this.byId.set(e.joplinId, e);
      this.byPath.set(e.path, e);
    }
  }
}