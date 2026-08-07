import { TFile } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { createJoplinId } from '../mapping/IdGenerator';

/**
 * Stable file identity across terminals.
 *
 * Every synced file carries a `joplin-file-id: <uuid>` frontmatter field.
 * The identity is what lets two terminals that each created "notes.md"
 * converge on the SAME server item — path alone cannot (each terminal
 * generates its own joplinId). The id is written to frontmatter on first
 * sync and read back on every later sync, surviving renames/moves.
 */
export const FILE_ID_FIELD = 'joplin-file-id';

export class FileIdentity {
  constructor(private plugin: JoplinSyncPlugin) {}

  /** Read the stable id from frontmatter, or mint + persist a new one. */
  async ensureId(file: TFile): Promise<string> {
    const content = await this.plugin.app.vault.read(file);
    const existing = this.readFromFrontmatter(content);
    if (existing) return existing;

    // Prefer an existing mapping id (migration: files synced before frontmatter).
    const mapped = this.plugin.mapping.getByPath(file.path);
    if (mapped?.joplinId) {
      await this.writeToFrontmatter(file, content, mapped.joplinId);
      return mapped.joplinId;
    }

    const id = createJoplinId();
    await this.writeToFrontmatter(file, content, id);
    return id;
  }

  readFromFrontmatter(content: string): string | null {
    if (!content.startsWith('---')) return null;
    const end = content.indexOf('\n---', 4);
    if (end < 0) return null;
    const fm = content.slice(4, end);
    const m = fm.match(new RegExp('^' + FILE_ID_FIELD + ':\\s*(\\S+)', 'm'));
    return m ? m[1] : null;
  }

  /** Inject (or replace) the id in YAML frontmatter. */
  async writeToFrontmatter(file: TFile, content: string, id: string): Promise<void> {
    const watcher = (this.plugin.engine as unknown as { watcher?: { suppress: (p: string) => void; release: (p: string) => void } })?.watcher;
    const write = async () => {
      let newContent: string;
      if (content.startsWith('---')) {
        const end = content.indexOf('\n---', 4);
        const rest = end >= 0 ? content.slice(end + 1) : content;
        const fm = end >= 0 ? content.slice(0, end + 1) : content;
        newContent = this.upsertFrontmatter(fm, id) + rest;
      } else {
        newContent = '---\n' + FILE_ID_FIELD + ': ' + id + '\n---\n' + content;
      }
      if (newContent !== content) await this.plugin.app.vault.modify(file, newContent);
    };
    if (watcher?.suppress) {
      watcher.suppress(file.path);
      try { await write(); } finally { watcher.release(file.path); }
    } else {
      await write();
    }
  }

  private upsertFrontmatter(fm: string, id: string): string {
    const line = FILE_ID_FIELD + ': ' + id;
    const re = new RegExp('^' + FILE_ID_FIELD + ':.*$', 'm');
    return re.test(fm) ? fm.replace(re, line) : fm + '\n' + line;
  }
}
