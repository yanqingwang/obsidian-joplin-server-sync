import { requestUrl } from 'obsidian';
import { Paginated, RemoteItemStat, DeltaItem, SyncLock, LockType } from './models';

interface ApiConfig { baseUrl: string; email: string; password: string; }

export class JoplinServerApi {
  private sessionId: string | null = null;
  private getConfig: () => ApiConfig;
  private callCount = 0;
  private readonly REFRESH_INTERVAL = 200; // re-login every 200 API calls

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

  private async rawRequest(method: string, path: string, opts: {
    body?: string | ArrayBuffer;
    contentType?: string;
    retries?: number;
  } = {}): Promise<{ status: number; text: string; arrayBuffer: ArrayBuffer }> {
    if (!this.sessionId) await this.login();
    this.callCount++;
    if (this.callCount >= this.REFRESH_INTERVAL) {
      this.callCount = 0;
      try { await this.login(); } catch { /* refresh best-effort */ }
    }
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
      return { status: res.status, text: res.text, arrayBuffer: res.arrayBuffer };
    }
  }

  private safeJson(text: string): Record<string, unknown> | null {
    try { return JSON.parse(text); } catch { return null; }
  }

  private execJsonLogCount = 0;
  private async exec(method: string, path: string, opts: {
    body?: string | ArrayBuffer;
    contentType?: string;
  } = {}): Promise<{ status: number; text: string; json: Record<string, unknown> | null; arrayBuffer: ArrayBuffer }> {
    const res = await this.rawRequest(method, path, opts);
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(res.text); } catch {
      if (this.execJsonLogCount < 5) {
        this.execJsonLogCount++;
        console.warn('[joplin-sync] non-json response', method, path, 'status=' + res.status, 'body=' + res.text.slice(0, 200));
      }
    }
    return { ...res, json };
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

  async putItem(name: string, content: string | ArrayBuffer, force = false): Promise<{ id: string; updated_time: number }> {
    const res = await this.rawRequest('PUT', this.itemPath(name, '/content') + (force ? '?force=1' : ''), {
      body: content,
      contentType: 'application/octet-stream',
    });
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    // PUT /content returns Joplin serialized item, not JSON — parse key:value from last lines
    const fields = this.parseJoplinFields(res.text);
    if (!fields.id) throw new ApiError(res.status, 'PUT response missing id field: ' + res.text.slice(0, 200));
    return { id: fields.id, updated_time: fields.updated_time };
  }

  private parseJoplinFields(text: string): { id: string; updated_time: number } {
    const result = { id: '', updated_time: 0 };
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const sep = line.indexOf(':');
      if (sep > 0) {
        const key = line.slice(0, sep).trim();
        if (key === 'id') result.id = line.slice(sep + 1).trim();
        if (key === 'updated_time') result.updated_time = new Date(line.slice(sep + 1).trim()).getTime();
      }
      if (result.id && result.updated_time) break;
    }
    return result;
  }

  async deleteItem(name: string): Promise<void> {
    const res = await this.exec('DELETE', this.itemPath(name));
    if (res.status !== 200 && res.status !== 404) throw new ApiError(res.status, res.text);
  }

  async listChildren(cursor?: string): Promise<Paginated<RemoteItemStat>> {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/children' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'listChildren body is not JSON: ' + res.text.slice(0, 200));
    return res.json as unknown as Paginated<RemoteItemStat>;
  }

  async delta(cursor?: string): Promise<Paginated<DeltaItem>> {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/delta' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'delta body is not JSON: ' + res.text.slice(0, 200));
    return res.json as unknown as Paginated<DeltaItem>;
  }

  async acquireLock(type: LockType, clientType: string, clientId: string): Promise<SyncLock> {
    const res = await this.exec('POST', '/api/locks', {
      body: JSON.stringify({ type, clientType, clientId }),
      contentType: 'application/json',
    });
    if (res.status === 409) throw new LockConflictError(res.text);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'acquireLock body is not JSON: ' + res.text.slice(0, 200));
    return res.json as unknown as SyncLock;
  }

  async releaseLock(type: LockType, clientType: string, clientId: string): Promise<void> {
    await this.exec('DELETE', '/api/locks/' + type + '_' + clientType + '_' + clientId);
  }

  async listLocks(): Promise<Paginated<SyncLock>> {
    const res = await this.exec('GET', '/api/locks');
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'listLocks body is not JSON: ' + res.text.slice(0, 200));
    return res.json as unknown as Paginated<SyncLock>;
  }

  private trimSlash(u: string) { return u.replace(/\/+$/, ''); }
  private sleep(ms: number) { return new Promise(r => window.setTimeout(r, ms)); }
}

export class ApiError extends Error {
  constructor(public status: number, text: string) { super('API error ' + status + ': ' + text); }
}
export class LockConflictError extends Error {}