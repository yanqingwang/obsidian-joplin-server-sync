import { TFile } from 'obsidian';
import type JoplinSyncPlugin from '../main';
import { JoplinSerializer } from '../convert/JoplinSerializer';
import { RemoteItemStat, ModelType, JoplinItem } from '../api/models';
import { createJoplinId } from '../mapping/IdGenerator';
import { sha256 } from './SyncEngine';

export class InitialSync {
  private serializer = new JoplinSerializer();

  constructor(private plugin: JoplinSyncPlugin) {}

  async run(): Promise<void> {
    // 1. Fetch full remote listing
    const remoteStats = await this.listAllRemote();
    const remoteIds = new Map<string, RemoteItemStat>();
    for (const s of remoteStats) {
      if (/^[0-9a-f]{32}\.md$/.test(s.name)) {
        remoteIds.set(s.name.slice(0, 32), s);
      }
    }

    // 2. Three-way merge: for each local file, compare with mapping + remote
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      const mapping = this.plugin.mapping.getByPath(file.path);
      const remote = mapping ? remoteIds.get(mapping.joplinId) : undefined;

      if (!mapping && !remote) {
        // New local file — upload
        await this.uploadNewFile(file);
      } else if (mapping && remote) {
        // Both exist — compare hashes
        const localContent = await this.plugin.app.vault.read(file);
        const localHash = await sha256(localContent);
        if (localHash !== mapping.localHash) {
          // Locally changed — upload update
          await this.uploadNewFile(file);
        }
        remoteIds.delete(mapping.joplinId);
      } else if (mapping && !remote) {
        // Mapping points to nonexistent remote — treat as deleted
        this.plugin.mapping.remove(mapping.joplinId);
      }
    }

    // 3. Remaining remote items not in mapping — download as new
    for (const [id, _stat] of remoteIds) {
      await this.downloadNewItem(id);
    }

    // 4. Consume delta stream to get initial cursor
    let cursor: string | undefined;
    while (true) {
      const page = await this.plugin.api.delta(cursor);
      cursor = page.cursor;
      if (!page.has_more) break;
    }
    this.plugin.mapping.setDeltaCursor(cursor ?? '');
    await this.plugin.mapping.flush();
  }

  private async uploadNewFile(file: TFile): Promise<void> {
    const content = await this.plugin.app.vault.read(file);
    const hash = await sha256(content);
    const id = createJoplinId();
    const now = Date.now();
    const item: JoplinItem = {
      id, parent_id: '', title: file.basename, body: content,
      created_time: file.stat.ctime, updated_time: now,
      user_created_time: file.stat.ctime, user_updated_time: file.stat.mtime,
      type_: ModelType.Note, encryption_applied: 0, encryption_cipher_text: '', markup_language: 1,
    };
    const res = await this.plugin.api.putItem(id + '.md', this.serializer.serialize(item));
    this.plugin.mapping.upsert({
      joplinId: id, path: file.path, type: ModelType.Note,
      localHash: hash, remoteUpdatedTime: res.updated_time, syncedAt: now,
    });
  }

  private async downloadNewItem(id: string): Promise<void> {
    try {
      const raw = await this.plugin.api.getItem(id + '.md');
      if (!raw) return;
      const item = this.serializer.unserialize(raw);
      if (item.type_ !== ModelType.Note) return;

      const sanitized = item.title.replace(/[\\/:*?"<>|#^[\]]/g, '_').trim() || 'Untitled';
      let path = sanitized + '.md';
      // Avoid overwrite
      if (this.plugin.app.vault.getAbstractFileByPath(path)) {
        path = sanitized + ' (' + id.slice(0, 7) + ').md';
      }
      await this.plugin.app.vault.create(path, item.body ?? '');
      this.plugin.mapping.upsert({
        joplinId: id, path, type: ModelType.Note,
        localHash: await sha256(item.body ?? ''),
        remoteUpdatedTime: item.updated_time, syncedAt: Date.now(),
      });
    } catch (e) {
      console.error('[joplin-sync] download failed: ' + id, e);
    }
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
}