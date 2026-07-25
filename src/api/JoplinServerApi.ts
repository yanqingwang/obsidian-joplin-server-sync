import { requestUrl } from 'obsidian';
import { Paginated, RemoteItemStat, DeltaItem, SyncLock, LockType } from './models';

interface ApiConfig { baseUrl: string; email: string; password: string; }

export class JoplinServerApi {
  private sessionId: string | null = null;
  private getConfig: () => ApiConfig;

  constructor(getConfig: () => ApiConfig) {
    this.getConfig = getConfig;
  }

  async login(): Promise<void> {
    const { baseUrl, email, password } = this.getConfig();
    const res = await requestUrl({
      url: this.trimSlash(baseUrl) + '/api/sessions',
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ email, password }),
      throw: false,
    });
    if (res.status !== 200) throw new Error('Login failed (' + res.status + '): ' + res.text);
    const body = res.json as Record<string, unknown>;
    this.sessionId = body.id as string;
  }

  private async exec(method: string, path: string, opts: {
    body?: string | ArrayBuffer;
    contentType?: string;
    retries?: number;
  } = {}): Promise<{ status: number; text: string; json: Record<string, unknown>; arrayBuffer: ArrayBuffer }> {
    if (!this.sessionId) await this.login();
    const maxRetries = opts.retries ?? 3;

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        'X-API-AUTH': this.sessionId!,
        'X-API-MIN-VERSION': '2.6.0',
      };
      if (opts.contentType) headers['Content-Type'] = opts.contentType;
      const res = await requestUrl({
        url: this.trimSlash(this.getConfig().baseUrl) + path,
        method,
        headers,
        body: opts.body,
        throw: false,
      });

      if (res.status === 401 && attempt === 0) {
        await this.login();
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        await this.sleep(Math.pow(4, attempt) * 1000);
        continue;
      }
      return {
        status: res.status,
        text: res.text,
        json: res.json as Record<string, unknown>,
        arrayBuffer: res.arrayBuffer,
      };
    }
  }

  private itemPath(name: string, suffix = ''): string {
    return '/api/items/root:/' + encodeURIComponent(name) + ':' + suffix;
  }

  async getItem(name: string): Promise<string | null> {
    const res = await this.exec('GET', this.itemPath(name, '/content'));
    if (res.status === 404) return null;
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.text;
  }

  async getItemBinary(name: string): Promise<ArrayBuffer> {
    const res = await this.exec('GET', this.itemPath(name, '/content'));
    if (res.status === 404) throw new ApiError(404, 'Not found');
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.arrayBuffer;
  }

  async putItem(name: string, content: string | ArrayBuffer): Promise<{ id: string; updated_time: number }> {
    const res = await this.exec('PUT', this.itemPath(name, '/content'), {
      body: content,
      contentType: 'application/octet-stream',
    });
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.json as unknown as { id: string; updated_time: number };
  }

  async deleteItem(name: string): Promise<void> {
    const res = await this.exec('DELETE', this.itemPath(name));
    if (res.status !== 200 && res.status !== 404) throw new ApiError(res.status, res.text);
  }

  async listChildren(cursor?: string): Promise<Paginated<RemoteItemStat>> {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/children' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.json as unknown as Paginated<RemoteItemStat>;
  }

  async delta(cursor?: string): Promise<Paginated<DeltaItem>> {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/delta' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.json as unknown as Paginated<DeltaItem>;
  }

  async acquireLock(type: LockType, clientType: string, clientId: string): Promise<SyncLock> {
    const res = await this.exec('POST', '/api/locks', {
      body: JSON.stringify({ type, clientType, clientId }),
      contentType: 'application/json',
    });
    if (res.status === 409) throw new LockConflictError(res.text);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.json as unknown as SyncLock;
  }

  async releaseLock(type: LockType, clientType: string, clientId: string): Promise<void> {
    await this.exec('DELETE', '/api/locks/' + type + '_' + clientType + '_' + clientId);
  }

  async listLocks(): Promise<Paginated<SyncLock>> {
    const res = await this.exec('GET', '/api/locks');
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.json as unknown as Paginated<SyncLock>;
  }

  private trimSlash(u: string) { return u.replace(/\/+$/, ''); }
  private sleep(ms: number) { return new Promise(r => window.setTimeout(r, ms)); }
}

export class ApiError extends Error {
  constructor(public status: number, text: string) { super('API error ' + status + ': ' + text); }
}
export class LockConflictError extends Error {}