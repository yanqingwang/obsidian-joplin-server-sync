import { TFile, Notice, normalizePath } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { VaultWatcher } from '../vault/VaultWatcher';
import { MappingEntry } from '../mapping/MappingStore';
import { JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';
import { merge3 } from './merge3';

/**
 * Three-way merge: base (last synced) + local + remote.
 *
 * The base now comes from `BaseSnapshotStore`, which persists the last-synced
 * body of every note. Before that store existed the base could only ever be
 * "the local file if it hasn't changed" — i.e. `local === base` — so the
 * non-overlapping-edit branch was unreachable and every concurrent edit ended
 * up duplicated. With a real base, edits to different regions merge silently.
 *
 * All three inputs are normalised before merging (frontmatter id line and
 * line endings), otherwise the injected `joplin-file-id` would produce a
 * phantom conflict on every single pull.
 */
export class ConflictResolver {
  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {}

  async resolve(mapping: MappingEntry, remote: JoplinItem, localContent: string, targetPath: string): Promise<void> {
    const base = this.readBase(mapping, remote);
    if (base !== null) {
      const merged = merge3(
        normalizeForMerge(base),
        normalizeForMerge(localContent),
        normalizeForMerge(remote.body ?? ''),
      );
      if (merged !== null) {
        await this.applyMerged(mapping, remote, merged, targetPath);
        return;
      }
    }
    await this.resolveByStrategy(mapping, remote, localContent, targetPath);
  }

  /** Last-synced body for this note, or null if we have no usable base. */
  private readBase(mapping: MappingEntry, remote: JoplinItem): string | null {
    const snap = this.plugin.baseSnapshots?.get(mapping.joplinId);
    if (typeof snap === 'string') return snap;
    // No snapshot yet (first sync after upgrade). A note whose remote copy did
    // not change since our last sync has base == remote, which is still a
    // genuine base for the local side.
    if (remote.updated_time && remote.updated_time <= mapping.remoteUpdatedTime) {
      return remote.body ?? null;
    }
    return null;
  }

  private async applyMerged(mapping: MappingEntry, remote: JoplinItem, merged: string, targetPath: string): Promise<void> {
    const f = this.plugin.app.vault.getAbstractFileByPath(targetPath);
    this.watcher.suppress(targetPath);
    try {
      if (f instanceof TFile) await this.plugin.app.vault.modify(f, merged);
      else await this.plugin.app.vault.create(targetPath, merged);
    } finally {
      this.watcher.release(targetPath);
    }
    this.plugin.mapping.upsert({
      ...mapping,
      path: targetPath,
      localHash: await sha256(merged),
      // The merged text is NOT on the server yet: leaving remoteUpdatedTime at
      // the remote value would make the next pull treat it as up-to-date and
      // the merge would never be pushed. Zeroing it makes the push path see
      // "remote moved" and upload the merged body.
      remoteUpdatedTime: 0,
      syncedAt: Date.now(),
    });
    this.plugin.baseSnapshots?.set(mapping.joplinId, remote.body ?? '');
    new Notice('Sync: auto-merged changes for ' + targetPath);
  }

  private async resolveByStrategy(mapping: MappingEntry, remote: JoplinItem, localContent: string, targetPath: string): Promise<void> {
    switch (this.plugin.settings.conflictStrategy) {
      case 'local-wins':
        // Keep the local text and force the next push to overwrite the remote.
        this.plugin.mapping.upsert({ ...mapping, path: targetPath, remoteUpdatedTime: 0 });
        return;
      case 'remote-wins':
        return this.applyRemote(mapping, remote, targetPath);
      case 'duplicate':
      default: {
        const ts = new Date().toISOString().replace(/[:.]/g, '');
        const base = mapping.path.replace(/\.md$/, '').split('/').pop();
        const conflictPath = uniqueConflictPath(this.plugin, normalizePath('_conflicts/' + base + ' (conflict ' + ts + ').md'));
        if (!this.plugin.app.vault.getAbstractFileByPath('_conflicts')) {
          await this.plugin.app.vault.createFolder('_conflicts').catch(() => {});
        }
        this.watcher.suppress(conflictPath);
        await this.plugin.app.vault.create(conflictPath, localContent);
        this.watcher.release(conflictPath);
        await this.applyRemote(mapping, remote, targetPath);
        new Notice('Sync conflict: local copy saved to ' + conflictPath);
      }
    }
  }

  private async applyRemote(mapping: MappingEntry, remote: JoplinItem, targetPath: string): Promise<void> {
    const f = this.plugin.app.vault.getAbstractFileByPath(targetPath);
    this.watcher.suppress(targetPath);
    try {
      if (f instanceof TFile) await this.plugin.app.vault.modify(f, remote.body ?? '');
      else await this.plugin.app.vault.create(targetPath, remote.body ?? '');
    } finally {
      this.watcher.release(targetPath);
    }
    this.plugin.mapping.upsert({
      ...mapping,
      path: targetPath,
      localHash: await sha256(remote.body ?? ''),
      remoteUpdatedTime: remote.updated_time,
      syncedAt: Date.now(),
    });
    this.plugin.baseSnapshots?.set(mapping.joplinId, remote.body ?? '');
  }
}

/** Two conflicts resolved in the same millisecond must not overwrite each other. */
function uniqueConflictPath(plugin: JoplinSyncPlugin, path: string): string {
  if (!plugin.app.vault.getAbstractFileByPath(path)) return path;
  const dot = path.lastIndexOf('.md');
  const stem = dot >= 0 ? path.slice(0, dot) : path;
  for (let i = 2; i < 1000; i++) {
    const candidate = stem + ' ' + i + '.md';
    if (!plugin.app.vault.getAbstractFileByPath(candidate)) return candidate;
  }
  return stem + ' ' + Date.now() + '.md';
}

/**
 * Make a body comparable across sides:
 *  - CRLF/CR → LF (the watcher and the server disagree about line endings)
 *  - drop our injected `joplin-file-id` line, which differs per write path
 * Trailing whitespace is preserved: it is real content in Markdown (two
 * trailing spaces are a hard line break).
 */
export function normalizeForMerge(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^joplin-file-id:.*\n?/m, '');
}
