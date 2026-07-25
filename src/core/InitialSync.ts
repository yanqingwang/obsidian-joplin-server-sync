import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { RemoteItemStat } from '../api/models';

export class InitialSync {
  private serializer = new JoplinSerializer();

  constructor(private plugin: JoplinSyncPlugin) {}

  async run(): Promise<void> {
    const remoteStats = await this.listAllRemote();
    const remoteIds = new Set(
      remoteStats.filter(s => /^[0-9a-f]{32}\.md$/.test(s.name)).map(s => s.name.slice(0, 32)),
    );

    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const m = this.plugin.mapping.getByPath(file.path);
      if (!m) this.enqueueCreate(file.path);
      else if (!remoteIds.has(m.joplinId)) {
        // mapping exists but remote doesn't → remote deleted
      }
    }

    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.delta(cursor);
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    this.plugin.mapping.setDeltaCursor(cursor ?? '');
  }

  private async listAllRemote(): Promise<RemoteItemStat[]> {
    const out: RemoteItemStat[] = [];
    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.listChildren(cursor);
      out.push(...page.items);
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    return out;
  }

  private enqueueCreate(path: string): void {
    // In full sync cycle this goes through the ChangeQueue
    console.debug('[joplin-sync] enqueue create: ' + path);
  }
}