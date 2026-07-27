import { TFile } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { ModelType } from '../api/models';

export class LinkTransformer {
  private pendingLinks = new Map<string, Set<string>>();

  constructor(private plugin: JoplinSyncPlugin, private resources: { uploadResource: (file: TFile) => Promise<string> } | null) {}

  async obsidianToJoplin(body: string, sourcePath: string): Promise<string> {
    return this.transformOutsideCode(body, async (segment) => {
      segment = await replaceAsync(segment,
        /(!?)\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
        async (_m, bang, target, _anchor, alias) => {
          const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(target.trim(), sourcePath);
          if (!dest) return _m;
          const id = await this.resolveId(dest);
          if (!id) return _m;
          const label = alias ?? (bang ? dest.name : target.trim());
          return (bang ? '!' : '') + '[' + label + '](:/' + id + ')';
        });
      segment = await replaceAsync(segment,
        /(!?)\[([^\]]*)\]\((?!https?:|:\/|#|mailto:)([^)]+)\)/g,
        async (_m, bang, label, href) => {
          const dest = this.plugin.app.metadataCache.getFirstLinkpathDest(decodeURI(href.trim()), sourcePath);
          if (!dest) return _m;
          const id = await this.resolveId(dest);
          return id ? bang + '[' + label + '](:/' + id + ')' : _m;
        });
      return segment;
    });
  }

  private async resolveId(dest: TFile): Promise<string | null> {
    const mapped = this.plugin.mapping.getByPath(dest.path);
    if (mapped) return mapped.joplinId;
    if (dest.extension === 'md') {
      return (this.plugin.engine as unknown as { preassignNoteId?: (dest: TFile) => Promise<string> }).preassignNoteId?.call(this.plugin.engine, dest) ?? null;
    }
    return this.resources?.uploadResource(dest) ?? null;
  }

  joplinToObsidian(body: string, notePath: string): string {
    return this.transformOutsideCodeSync(body, (segment) =>
      segment.replace(/(!?)\[([^\]]*)\]\(:\/([0-9a-f]{32})\)/g,
        (_m, bang, label, id) => {
          const target = this.plugin.mapping.getById(id);
          if (!target) {
            if (!this.pendingLinks.has(id)) this.pendingLinks.set(id, new Set());
            this.pendingLinks.get(id)!.add(notePath);
            return _m;
          }
          const name = target.path.split('/').pop()!;
          const base = name.replace(/\.md$/, '');
          if (bang || Number(target.type) === ModelType.Resource) return '![[' + name + ']]';
          return label && label !== base ? '[[' + base + '|' + label + ']]' : '[[' + base + ']]';
        }));
  }

  async repairPendingLinks(arrivedId: string): Promise<void> {
    const notePaths = this.pendingLinks.get(arrivedId);
    if (!notePaths) return;
    this.pendingLinks.delete(arrivedId);
    for (const path of notePaths) {
      const f = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) continue;
      const content = await this.plugin.app.vault.read(f);
      const fixed = this.joplinToObsidian(content, path);
      if (fixed !== content) {
        const watcher = (this.plugin.engine as unknown as { watcher?: { suppress?: (path: string) => void; release?: (path: string) => void } }).watcher;
        watcher?.suppress?.(path);
        await this.plugin.app.vault.modify(f, fixed);
        watcher?.release?.(path);
      }
    }
  }

  private async transformOutsideCode(body: string, fn: (seg: string) => Promise<string>): Promise<string> {
    const parts = this.splitByCode(body);
    const out: string[] = [];
    for (const p of parts) out.push(p.isCode ? p.text : await fn(p.text));
    return out.join('');
  }

  private transformOutsideCodeSync(body: string, fn: (seg: string) => string): string {
    return this.splitByCode(body).map(p => p.isCode ? p.text : fn(p.text)).join('');
  }

  private splitByCode(body: string): { text: string; isCode: boolean }[] {
    const re = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;
    const parts: { text: string; isCode: boolean }[] = [];
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m.index > last) parts.push({ text: body.slice(last, m.index), isCode: false });
      parts.push({ text: m[0], isCode: true });
      last = m.index + m[0].length;
    }
    if (last < body.length) parts.push({ text: body.slice(last), isCode: false });
    return parts;
  }
}

async function replaceAsync(str: string, re: RegExp, fn: (...args: string[]) => Promise<string>): Promise<string> {
  const jobs: Promise<string>[] = [];
  str.replace(re, (...args) => { jobs.push(fn(...(args as string[]))); return ''; });
  const results = await Promise.all(jobs);
  let i = 0;
  return str.replace(re, () => results[i++]);
}