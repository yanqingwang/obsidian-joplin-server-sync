import { TAbstractFile, TFile, TFolder } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { ChangeQueue } from '../core/ChangeQueue';

export class VaultWatcher {
  private suppressed = new Set<string>();

  constructor(private plugin: JoplinSyncPlugin, private queue: ChangeQueue) {}

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
    this.queue.push({ kind, path: f.path, isFolder: f instanceof TFolder, time: Date.now() });
  }

  private onRename(f: TAbstractFile, oldPath: string): void {
    if (this.suppressed.has(f.path)) return;
    if (!this.shouldTrack(f)) return;
    this.queue.push({ kind: 'rename', path: f.path, oldPath, isFolder: f instanceof TFolder, time: Date.now() });
  }

  private shouldTrack(f: TAbstractFile): boolean {
    const s = this.plugin.settings;
    if (f.path.startsWith(this.plugin.app.vault.configDir + '/')) return false;
    if (f.path.startsWith('_conflicts/')) return false;
    if (s.excludePatterns.some(p => f.path.startsWith(p))) return false;
    // Track .md files and potential attachment files
    if (f instanceof TFile && f.extension !== 'md') {
      return true; // Phase 3: track attachments
    }
    return true;
  }
}