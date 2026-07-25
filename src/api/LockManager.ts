import { JoplinServerApi, LockConflictError } from './JoplinServerApi';
import { SyncLock, LockType } from './models';

const LOCK_TTL_MS = 1000 * 60 * 3;
const REFRESH_INTERVAL_MS = LOCK_TTL_MS / 2;

export class LockManager {
  private refreshTimer: number | null = null;
  private currentLock: SyncLock | null = null;

  constructor(
    private api: JoplinServerApi,
    private clientType: string,
    private clientId: string,
  ) {}

  async acquireSyncLock(maxWaitMs = 1000 * 60): Promise<SyncLock> {
    const start = Date.now();
    while (true) {
      const locks = await this.api.listLocks();
      const activeExclusive = locks.items.find(l =>
        l.type === LockType.Exclusive && this.isActive(l));
      if (activeExclusive) {
        if (Date.now() - start > maxWaitMs) {
          throw new Error('Exclusive lock held by another client (sync target upgrade in progress?)');
        }
        await sleep(5000);
        continue;
      }
      try {
        this.currentLock = await this.api.acquireLock(LockType.Sync, this.clientType, this.clientId);
        this.startAutoRefresh();
        return this.currentLock;
      } catch (e) {
        if (e instanceof LockConflictError) { await sleep(2000); continue; }
        throw e;
      }
    }
  }

  onLockLost: (() => void) | null = null;

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = window.setInterval(async () => {
      try {
        this.currentLock = await this.api.acquireLock(LockType.Sync, this.clientType, this.clientId);
      } catch (e) {
        console.error('[joplin-sync] lock refresh failed', e);
        this.onLockLost?.();
      }
    }, REFRESH_INTERVAL_MS);
  }

  async release(): Promise<void> {
    this.stopAutoRefresh();
    if (!this.currentLock) return;
    try {
      await this.api.releaseLock(LockType.Sync, this.clientType, this.clientId);
    } finally {
      this.currentLock = null;
    }
  }

  private isActive(lock: SyncLock): boolean {
    return Date.now() - (lock.updatedTime ?? 0) < LOCK_TTL_MS;
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) { window.clearInterval(this.refreshTimer); this.refreshTimer = null; }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }