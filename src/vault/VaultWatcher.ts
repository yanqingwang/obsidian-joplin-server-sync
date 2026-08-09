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
  private suppressed = new Map<string, number>(); // path → outstanding tokens
  private suppressTimers = new Map<string, number>();
  private suspended = false;

  constructor(private plugin: JoplinSyncPlugin, private changeLog: ChangeLogStore) {}

  /** Ignore ALL vault events while suspended (force operations rebuild the
   *  vault and would otherwise flood the changelog) (C3). */
  suspend(): void { this.suspended = true; }
  resume(): void { this.suspended = false; this.suppressed.clear(); }

  start(): void {
    const v = this.plugin.app.vault;
    this.plugin.registerEvent(v.on('create', f => this.onEvent('create', f)));
    this.plugin.registerEvent(v.on('modify', f => this.onEvent('modify', f)));
    this.plugin.registerEvent(v.on('delete', f => this.onEvent('delete', f)));
    this.plugin.registerEvent(v.on('rename', (f, oldPath) => this.onRename(f, oldPath)));
  }

  /** Suppress ONE matching event for this path. The first matching event
   *  consumes the token; a 5s fallback clears it if nothing arrives (B30). */
  suppress(path: string): void {
    this.suppressed.set(path, (this.suppressed.get(path) ?? 0) + 1);
    if (!this.suppressTimers.has(path)) {
      const timer = window.setTimeout(() => {
        this.suppressed.delete(path);
        this.suppressTimers.delete(path);
      }, 5000);
      this.suppressTimers.set(path, timer);
    }
  }
  release(path: string): void { /* token consumed on first matching event */ }

  private consume(path: string): boolean {
    const n = this.suppressed.get(path);
    if (n === undefined || n <= 0) return false;
    if (n === 1) {
      this.suppressed.delete(path);
      const t = this.suppressTimers.get(path);
      if (t) { window.clearTimeout(t); this.suppressTimers.delete(path); }
    } else {
      this.suppressed.set(path, n - 1);
    }
    return true;
  }

  private onEvent(kind: 'create' | 'modify' | 'delete', f: TAbstractFile): void {
    if (this.suspended) return;
    if (this.consume(f.path)) return;
    if (!this.shouldTrack(f)) return;
    void this.record(kind, f.path, undefined, f instanceof TFolder, f instanceof TFile ? f : undefined);
  }

  private onRename(f: TAbstractFile, oldPath: string): void {
    if (this.suspended) return;
    if (this.consume(f.path)) return;
    if (!this.consume(oldPath)) {
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
    // Binary files: resource identity comes from mapping/path, NEVER from
    // frontmatter — writing a YAML header into a png/pdf would corrupt it (B22).
    if (file.extension !== 'md') {
      const mapped = this.plugin.mapping.getByPath(file.path);
      const fileId = mapped?.joplinId ?? 'file:' + file.path;
      this.changeLog.push({ fileId, op: kind === 'modify' ? 'update' : kind, path, oldPath, type: ModelType.Resource, hash: undefined });
      return;
    }
    // Markdown: stable fileId from frontmatter (mints one on first touch).
    const fileId = await this.plugin.identity.ensureId(file);
    const op: ChangeOp = kind === 'modify' ? 'update' : kind;
    let hash: string | undefined;
    if (kind !== 'delete') {
      try { hash = await this.plugin.engine.sha256Of(file); } catch { /* best effort */ }
    }
    this.changeLog.push({ fileId, op, path, oldPath, type: ModelType.Note, hash });
  }

  private shouldTrack(f: TAbstractFile): boolean {
    if (f.path.startsWith(this.plugin.app.vault.configDir + '/')) return false;
    return !this.plugin.engine.shouldExclude(f.path);
  }
}
