import { TFile, Notice, normalizePath } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { VaultWatcher } from '../vault/VaultWatcher';
import { MappingEntry } from '../mapping/MappingStore';
import { JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';

/**
 * Three-way merge: base (last synced) + local + remote.
 * Non-overlapping edits merge automatically; overlapping edits fall back
 * to the configured strategy (duplicate by default).
 */
export class ConflictResolver {
  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {}

  async resolve(mapping: MappingEntry, remote: JoplinItem, localContent: string, targetPath: string): Promise<void> {
    // Base = last-synced content (from mapping.localHash we can't recover the
    // text, so fall back to strategy unless we can read a stored base).
    const base = await this.readBase(mapping);
    if (base !== null) {
      const merged = this.tryMerge(base, localContent, remote.body ?? '');
      if (merged) {
        await this.applyMerged(mapping, remote, merged, targetPath);
        return;
      }
    }
    await this.resolveByStrategy(mapping, remote, localContent, targetPath);
  }

  /** Read base content if stored (mapping keeps only a hash — subclasses may persist full base). */
  private async readBase(mapping: MappingEntry): Promise<string | null> {
    // Best effort: if the local file still matches the mapping hash, base ≈ local.
    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    if (f instanceof TFile) {
      const content = await this.plugin.app.vault.read(f);
      const h = await sha256(content);
      if (h === mapping.localHash) return content;
    }
    return null;
  }

  /** Line-based merge: identical base lines are dropped; diverging hunks kept. */
  private tryMerge(base: string, local: string, remote: string): string | null {
    const b = base.split('\n'), l = local.split('\n'), r = remote.split('\n');
    // Quick check: if local == base, remote wins cleanly.
    if (l.join('\n') === b.join('\n')) return remote;
    if (r.join('\n') === b.join('\n')) return local;
    // Both changed. Merge line-wise where edits don't overlap.
    const out: string[] = [];
    let conflict = false;
    const max = Math.max(b.length, l.length, r.length);
    for (let i = 0; i < max; i++) {
      const lb = b[i], ll = l[i], lr = r[i];
      if (ll !== undefined && ll === lb) {
        // local unchanged on this line → take remote's
        if (lr !== undefined) out.push(lr);
      } else if (lr !== undefined && lr === lb) {
        // remote unchanged → take local's
        if (ll !== undefined) out.push(ll);
      } else if (ll === lr) {
        out.push(ll ?? '');
      } else if (ll === undefined && lr === undefined) {
        continue;
      } else {
        conflict = true;
        break;
      }
    }
    if (conflict) return null;
    return out.join('\n');
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
      remoteUpdatedTime: remote.updated_time,
      syncedAt: Date.now(),
    });
    new Notice('Sync: auto-merged changes for ' + targetPath);
  }

  private async resolveByStrategy(mapping: MappingEntry, remote: JoplinItem, localContent: string, targetPath: string): Promise<void> {
    switch (this.plugin.settings.conflictStrategy) {
      case 'local-wins':
        this.plugin.mapping.upsert({ ...mapping, path: targetPath, remoteUpdatedTime: remote.updated_time });
        return;
      case 'remote-wins':
        return this.applyRemote(mapping, remote, targetPath);
      case 'duplicate':
      default: {
        const ts = new Date().toISOString().replace(/[:.]/g, '');
        const base = mapping.path.replace(/\.md$/, '').split('/').pop();
        const conflictPath = normalizePath('_conflicts/' + base + ' (conflict ' + ts + ').md');
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
  }
}
