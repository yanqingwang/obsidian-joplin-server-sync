import { JoplinServerApi } from '../api/JoplinServerApi';

const SUPPORTED_SYNC_VERSION = 3;

export class SyncInfoHandler {
  constructor(private api: JoplinServerApi) {}

  async checkOrInit(): Promise<any> {
    const raw = await this.api.getItem('info.json');
    if (raw === null) {
      const info = { version: SUPPORTED_SYNC_VERSION };
      await this.api.putItem('info.json', JSON.stringify(info));
      return info;
    }
    const info = JSON.parse(raw);
    if (info.version > SUPPORTED_SYNC_VERSION) {
      throw new Error('Sync target version ' + info.version + ' > supported ' + SUPPORTED_SYNC_VERSION + '. Please update the plugin.');
    }
    if (info.version < SUPPORTED_SYNC_VERSION) {
      throw new Error('Sync target needs upgrade (v' + info.version + '). Run sync in official Joplin client first.');
    }
    if (info.e2ee?.value === true) {
      throw new Error('This sync target has E2EE enabled, which is not yet supported.');
    }
    return info;
  }
}