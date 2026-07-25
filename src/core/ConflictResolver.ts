import { TFile, Notice, normalizePath } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { VaultWatcher } from '../vault/VaultWatcher';
import { MappingEntry } from '../mapping/MappingStore';
import { JoplinItem } from '../api/models';
import { sha256 } from './SyncEngine';

export class ConflictResolver {
  constructor(private plugin: JoplinSyncPlugin, private watcher: VaultWatcher) {}

  async resolve(mapping: MappingEntry, remote: JoplinItem, localContent: string, targetPath: string): Promise<void> {
    switch (this.plugin.settings.conflictStrategy) {
      case 'local-wins':
        this.plugin.mapping.upsert({ ...mapping, remoteUpdatedTime: remote.updated_time });
        return;
      case 'remote-wins':
        return this.applyRemote(mapping, remote);
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
        await this.applyRemote(mapping, remote);
        new Notice('Sync conflict: local copy saved to ' + conflictPath);
      }
    }
  }

  private async applyRemote(mapping: MappingEntry, remote: JoplinItem): Promise<void> {
    const f = this.plugin.app.vault.getAbstractFileByPath(mapping.path);
    this.watcher.suppress(mapping.path);
    try {
      if (f instanceof TFile) await this.plugin.app.vault.modify(f, remote.body ?? '');
      else await this.plugin.app.vault.create(mapping.path, remote.body ?? '');
    } finally {
      this.watcher.release(mapping.path);
    }
    this.plugin.mapping.upsert({
      ...mapping,
      localHash: await sha256(remote.body ?? ''),
      remoteUpdatedTime: remote.updated_time,
      syncedAt: Date.now(),
    });
  }
}