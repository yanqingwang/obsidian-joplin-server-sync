import { JoplinServerApi } from '../api/JoplinServerApi';

const SUPPORTED_SYNC_VERSION = 3;

export class SyncInfoHandler {
  private _e2eeEnabled = false;

  constructor(private api: JoplinServerApi) {}

  get e2eeEnabled(): boolean { return this._e2eeEnabled; }

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
    this._e2eeEnabled = info.e2ee?.value === true;
    if (this._e2eeEnabled) {
      console.warn('[joplin-sync] E2EE target detected — read-only decryption mode');
    }
    return info;
  }
}