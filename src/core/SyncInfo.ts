import { JoplinServerApi } from '../api/JoplinServerApi';

const SUPPORTED_SYNC_VERSION = 3;

export interface SyncInfo {
  version: number;
  e2ee?: { value?: boolean };
  /** Vault identity written on first init — used to detect accidental
   *  cross-vault reuse of the same account/server (diagnostic only). */
  vaultId?: string;
}

export class SyncInfoHandler {
  private _e2eeEnabled = false;
  private _vaultId = '';

  constructor(private api: JoplinServerApi, private getVaultId: () => string) {}

  get e2eeEnabled(): boolean { return this._e2eeEnabled; }
  get serverVaultId(): string { return this._vaultId; }

  async checkOrInit(): Promise<SyncInfo> {
    const raw = await this.api.getItem('info.json');
    if (raw === null) {
      const info: SyncInfo = { version: SUPPORTED_SYNC_VERSION, vaultId: this.getVaultId() };
      await this.api.putItem('info.json', JSON.stringify(info));
      this._vaultId = info.vaultId ?? '';
      return info;
    }
    const info = JSON.parse(raw) as SyncInfo;
    if (info.version > SUPPORTED_SYNC_VERSION) {
      throw new Error('Sync target version ' + info.version + ' > supported ' + SUPPORTED_SYNC_VERSION + '. Please update the plugin.');
    }
    if (info.version < SUPPORTED_SYNC_VERSION) {
      throw new Error('Sync target needs upgrade (v' + info.version + '). Run sync in official Joplin client first.');
    }
    this._e2eeEnabled = info.e2ee?.value === true;
    this._vaultId = info.vaultId ?? '';
    if (this._e2eeEnabled) {
      console.warn('[joplin-sync] E2EE target detected — read-only decryption mode');
    }
    // Diagnostic only: warn when a DIFFERENT vault already claimed this
    // account/server. Multi-client sync on one account is legitimate, but an
    // accidental second vault reusing the same credentials risks deletion
    // conflicts (each vault keeps its own mapping/delta cursor).
    const mine = this.getVaultId();
    if (this._vaultId && mine && this._vaultId !== mine) {
      console.warn('[joplin-sync] Server was first initialized by vault "' + this._vaultId
        + '" but this vault is "' + mine + '". Same account used by multiple vaults can cause data loss. '
        + 'Use a separate account per vault, or keep a single primary vault.');
    }
    return info;
  }
}
