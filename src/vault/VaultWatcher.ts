import { TAbstractFile, TFile, TFolder } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { ChangeLogStore, ChangeOp } from '../core/ChangeLogStore';
import { ModelType } from '../api/models';

/**
 * Watches Obsidian vault events and records them into the persistent
 * ChangeLogStore (the "local change list"). Each change carries the file's
 * stable fileId so multi-terminal sync can converge on the same server item.
 */
export class VaultWatcher {
  private suppressed = new Set<string>();

  constructor(private plugin: JoplinSyncPlugin, private changeLog: ChangeLogStore) {}

  start(): void {
    const v = this.plugin.app.vault;
    this.plugin.registerEvent(v.on('create', f => this.onEvent('create', f)));
    this.plugin.registerEvent(v.on('modify', f => this.onEvent('modify', f)));
    this.plugin.registerEvent(v.on('delete', f => this.onEvent('delete', f)));
    this.plugin.registerEvent(v.on('rename', (f, oldPath) => this.onRename(f, oldPath)));
  }

  suppress(path: string): void { this.suppressed.add(path); }
  release(path: string): void { window.setTimeout(() => this.suppressed.delete(path), 2000); }

  private onEvent(kind: 'create' | 'modify' | 'delete', f: TAbstractFile): void {
    if (this.suppressed.has(f.path)) return;
    if (!this.shouldTrack(f)) return;
    void this.record(kind, f.path, undefined, f instanceof TFolder, f instanceof TFile ? f : undefined);
  }

  private onRename(f: TAbstractFile, oldPath: string): void {
    if (this.suppressed.has(f.path)) return;
    if (!this.suppressed.has(oldPath)) {
      if (!this.shouldTrack(f)) return;
      void this.record('rename', f.path, oldPath, f instanceof TFolder, f instanceof TFile ? f : undefined);
    }
  }

  private async record(
    kind: 'create' | 'modify' | 'delete' | 'rename',
    path: string,
    oldPath: string | undefined,
    isFolder: boolean,
    file: TFile | undefined,
  ): Promise<void> {
    // Folders: no frontmatter id — use path-based identity.
    if (isFolder) {
      const folderId = 'dir:' + path.replace(/\/$/, '');
      this.changeLog.push({ fileId: folderId, op: kind === 'modify' ? 'update' : kind, path, oldPath, type: ModelType.Folder });
      return;
    }
    if (!file) return;
    // Files: stable fileId from frontmatter (mints one on first touch).
    const fileId = await this.plugin.identity.ensureId(file);
    const op: ChangeOp = kind === 'modify' ? 'update' : kind;
    let hash: string | undefined;
    if (kind !== 'delete') {
      try { hash = await this.plugin.engine.sha256Of(file); } catch { /* best effort */ }
    }
    this.changeLog.push({ fileId, op, path, oldPath, type: ModelType.Note, hash });
  }

  private shouldTrack(f: TAbstractFile): boolean {
    const s = this.plugin.settings;
    if (f.path.startsWith(this.plugin.app.vault.configDir + '/')) return false;
    if (f.path.startsWith('_conflicts/')) return false;
    if (s.excludePatterns.some(p => f.path.startsWith(p))) return false;
    return true;
  }
}
