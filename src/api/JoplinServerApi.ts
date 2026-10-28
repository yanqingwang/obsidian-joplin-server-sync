import { requestUrl } from 'obsidian';
import { Paginated, RemoteItemStat, DeltaItem, SyncLock, LockType } from './models';
import { backoffDelay, ConcurrencyGate, isMdItemName, redactSecrets, sleep } from '../core/netUtil';

interface ApiConfig { baseUrl: string; email: string; password: string; }

/** Hard cap on retries for a single request. A 401 re-auth does not consume
 *  the budget beyond this so a permanently-revoked session can't loop. */
const MAX_RETRIES = 4;

export class JoplinServerApi {
  private sessionId: string | null = null;
  private getConfig: () => ApiConfig;
  private loginPromise: Promise<void> | null = null;

  /** Per-request timeout. Without it a stalled server connection (accepts the
   *  socket but never responds) makes requestUrl hang forever, which wedges
   *  the whole sync with no progress and no error (the "半天没有反应" symptom).
   *  2 min is generous for metadata GETs and even large resource blobs. */
  static readonly DEFAULT_TIMEOUT_MS = 120_000;

  /** Global outbound gate. Every request goes through it, so the plugin never
   *  opens more than `limit` sockets regardless of how many call sites fan
   *  out. Grows on sustained success, halves on 429/5xx. */
  readonly gate = new ConcurrencyGate(6, 12, 1);

  /** Serialised side-channel counters for the UI / diagnostics. */
  stats = { requests: 0, retries: 0, throttled: 0, bytes: 0 };

  constructor(getConfig: () => ApiConfig) {
    this.getConfig = getConfig;
  }

  async login(force = false): Promise<void> {
    if (!force && this.sessionId) return; // reuse cached session; force only on 401
    // Single-flight: concurrent 401s must not fire parallel logins that
    // overwrite each other's sessionId (B32).
    if (!force && this.loginPromise) return this.loginPromise;
    const doLogin = async () => {
      const { baseUrl, email, password } = this.getConfig();
      const res = await requestUrl({
        url: this.trimSlash(baseUrl) + '/api/sessions',
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ email, password }),
        throw: false,
      });
      if (res.status !== 200) {
        // Never echo the response body verbatim: a proxy can echo the request.
        throw new Error('Login failed (' + res.status + '): ' + redactSecrets(res.text).slice(0, 300));
      }
      const body = res.json as Record<string, unknown>;
      const id = body.id as string;
      if (!id) throw new Error('Login failed: server returned no session id');
      this.sessionId = id;
    };
    if (force) {
      await doLogin();
    } else {
      this.loginPromise = doLogin().finally(() => { this.loginPromise = null; });
      return this.loginPromise;
    }
  }

  /** Drop the cached session (settings changed / logout). */
  resetSession(): void { this.sessionId = null; }

  private async rawRequest(method: string, path: string, opts: {
    body?: string | ArrayBuffer;
    contentType?: string;
    retries?: number;
    timeout?: number;
  } = {}): Promise<{ status: number; text: string; arrayBuffer: ArrayBuffer }> {
    if (!this.sessionId) await this.login();
    const maxRetries = opts.retries ?? MAX_RETRIES;
    const timeoutMs = opts.timeout ?? JoplinServerApi.DEFAULT_TIMEOUT_MS;

    // The gate is acquired per ATTEMPT: a request sleeping in backoff must not
    // hold a slot that another request could use.
    for (let attempt = 0, authRetries = 0; ; ) {
      const headers: Record<string, string> = {
        'X-API-AUTH': this.sessionId!,
        'X-API-MIN-VERSION': '2.6.0',
      };
      if (opts.contentType) headers['Content-Type'] = opts.contentType;
      let res: { status: number; text: string; arrayBuffer: ArrayBuffer } | null = null;
      try {
        this.stats.requests++;
        res = await this.gate.run(() => this.requestWithTimeout(method, path, headers, opts.body, timeoutMs));
      } catch (e: unknown) {
        // Network error / timeout / connection reset. Retry with jittered
        // backoff so a transient blip doesn't wedge the whole sync.
        if (attempt < maxRetries) {
          this.stats.retries++;
          const delay = backoffDelay(attempt);
          console.warn('[joplin-sync] request failed (attempt ' + (attempt + 1) + '/' + (maxRetries + 1)
            + '), retrying in ' + delay + 'ms: ' + method + ' ' + path + ' — ' + redactSecrets(e instanceof Error ? e.message : String(e)));
          attempt++;
          await sleep(delay);
          continue;
        }
        throw e;
      }

      if (res.status === 401) {
        // Session expired mid-stream — re-auth and retry with a fresh token.
        // Bounded, or an invalid credential would spin forever.
        if (authRetries >= 2) throw new ApiError(401, 'Authentication failed after re-login: ' + redactSecrets(res.text).slice(0, 200));
        authRetries++;
        this.sessionId = null;
        await this.login(true);
        continue;
      }
      if (res.status === 429) {
        this.stats.throttled++;
        this.gate.shrink();
        if (attempt < maxRetries) {
          this.stats.retries++;
          const delay = backoffDelay(attempt, 2000);
          attempt++;
          await sleep(delay);
          continue;
        }
      }
      if (res.status >= 500 && attempt < maxRetries) {
        this.gate.shrink();
        this.stats.retries++;
        const delay = backoffDelay(attempt);
        attempt++;
        await sleep(delay);
        continue;
      }
      // Sustained success → allow more parallelism.
      if (res.status < 400) this.gate.grow();
      this.stats.bytes += res.arrayBuffer?.byteLength ?? 0;
      return { status: res.status, text: res.text, arrayBuffer: res.arrayBuffer };
    }
  }

  /** requestUrl with a hard timeout. Obsidian's requestUrl has no built-in
   *  per-request timeout, so we race it against a timer. The slower promise is
   *  guarded with a no-op catch to avoid an unhandled rejection when the timer
   *  wins and the request later settles in the background. */
  private requestWithTimeout(
    method: string, path: string, headers: Record<string, string>,
    body: string | ArrayBuffer | undefined, timeoutMs: number,
  ): Promise<{ status: number; text: string; arrayBuffer: ArrayBuffer }> {
    const url = this.trimSlash(this.getConfig().baseUrl) + path;
    const req = requestUrl({ url, method, headers, body, throw: false });
    req.catch(() => {}); // swallow late settle; value is discarded after timeout
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error('Request timed out after ' + timeoutMs + 'ms: ' + method + ' ' + path)),
        timeoutMs,
      );
    });
    return Promise.race([req, timeout]).finally(() => {
      // A LATE response body must still be released: Obsidian's requestUrl
      // resolves to an object holding the ArrayBuffer, and dropping it while
      // the timer won leaks the buffer until GC. Touching it here is enough.
      if (timer !== undefined) window.clearTimeout(timer);
    });
  }

  private execJsonLogCount = 0;
  private async exec(method: string, path: string, opts: {
    body?: string | ArrayBuffer;
    contentType?: string;
  } = {}): Promise<{ status: number; text: string; json: Record<string, unknown> | null; arrayBuffer: ArrayBuffer }> {
    const res = await this.rawRequest(method, path, opts);
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(res.text) as Record<string, unknown>; } catch {
      if (this.execJsonLogCount < 5) {
        this.execJsonLogCount++;
        console.warn('[joplin-sync] non-json response', method, path, 'status=' + res.status, 'body=' + redactSecrets(res.text).slice(0, 200));
      }
    }
    return { ...res, json };
  }

  private itemPath(name: string, suffix = ''): string {
    // Encode each path segment but keep '/' — `.resource/<id>` must not
    // become `.resource%2F<id>` (C13).
    const encoded = name.split('/').map(encodeURIComponent).join('/');
    return '/api/items/root:/' + encoded + ':' + suffix;
  }

  async getItem(name: string): Promise<string | null> {
    const res = await this.rawRequest('GET', this.itemPath(name, '/content'));
    if (res.status === 404) return null;
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.text;
  }

  async getItemBinary(name: string): Promise<ArrayBuffer> {
    const res = await this.rawRequest('GET', this.itemPath(name, '/content'));
    if (res.status === 404) throw new ApiError(404, 'Not found');
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    return res.arrayBuffer;
  }

  async putItem(name: string, content: string | ArrayBuffer, force = false): Promise<{ id: string; updated_time: number }> {
    const res = await this.exec('PUT', this.itemPath(name, '/content') + (force ? '?force=1' : ''), {
      body: content,
      contentType: 'application/octet-stream',
    });
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'PUT response not JSON: ' + redactSecrets(res.text).slice(0, 200));
    return {
      id: (res.json.id as string) || '',
      updated_time: (res.json.updated_time as number) || Date.now(),
    };
  }

  async deleteItem(name: string): Promise<void> {
    const res = await this.exec('DELETE', this.itemPath(name));
    if (res.status !== 200 && res.status !== 404) throw new ApiError(res.status, res.text);
  }

  async listChildren(cursor?: string): Promise<Paginated<RemoteItemStat>> {
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/children' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'listChildren body is not JSON: ' + redactSecrets(res.text).slice(0, 200));
    return res.json as unknown as Paginated<RemoteItemStat>;
  }

  async listChildrenOf(parentId: string, cursor?: string, itemType?: number): Promise<Paginated<RemoteItemStat>> {
    const base = parentId ? '/api/items/root:/' + parentId + ':/children' : '/api/items/root:/:/children';
    const params: string[] = [];
    if (cursor) params.push('cursor=' + encodeURIComponent(cursor));
    if (itemType !== undefined) params.push('item_type=' + itemType);
    const q = params.length ? '?' + params.join('&') : '';
    const res = await this.exec('GET', base + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'listChildrenOf body is not JSON: ' + redactSecrets(res.text).slice(0, 200));
    return res.json as unknown as Paginated<RemoteItemStat>;
  }

  async delta(cursor?: string): Promise<Paginated<DeltaItem>> {
    interface RawDeltaItem {
      item_name?: string;
      jop_updated_time?: unknown;
      type?: unknown;
      item_type?: unknown;
      name?: string;
      updated_time?: unknown;
      [key: string]: unknown;
    }
    const q = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
    const res = await this.exec('GET', '/api/items/root:/:/delta' + q);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'delta body is not JSON: ' + redactSecrets(res.text).slice(0, 200));
    const raw = res.json;
    const items = (raw.items as unknown[] | undefined) ?? [];
    for (const item of items as RawDeltaItem[]) {
      if (item.item_name) item.name = item.item_name;
      // jop_updated_time is the SERVER write time; prefer it, but only when it
      // is a usable timestamp (some builds send it as a string).
      const jut = item.jop_updated_time;
      if (jut !== undefined && jut !== null) {
        const n = typeof jut === 'number' ? jut : Date.parse(String(jut));
        if (Number.isFinite(n) && n > 0) item.updated_time = n;
      }
      if (item.type !== undefined && item.type !== null) item.type = Number(item.type);
    }
    const page = { items, has_more: !!raw.has_more, cursor: raw.cursor as string | undefined };
    await this.mergeItemKinds(page.items as DeltaItem[]);
    return page as unknown as Paginated<DeltaItem>;
  }

  /** The delta feed does NOT report an item's `type_`. Deciding whether a
   *  delete refers to a folder (root folder!) or a note therefore used to
   *  require a content GET in the puller — an O(n) request storm.
   *  `listChildren` reports `item_type` on most server builds, so we cache the
   *  id→type map once per session and refresh it when a delta mentions an id
   *  we have never seen. */
  private itemKinds = new Map<string, number>();
  private kindsLoadedAt = 0;
  private kindsLoading: Promise<void> | null = null;

  getKnownItemType(id: string): number | undefined { return this.itemKinds.get(id); }

  private async loadItemKinds(force = false): Promise<void> {
    if (!force && this.kindsLoadedAt > 0) return;
    if (this.kindsLoading) return this.kindsLoading;
    this.kindsLoading = (async () => {
      let cursor: string | undefined;
      let pages = 0;
      while (pages < 500) {
        pages++;
        const page = await this.listChildrenOf('', cursor);
        for (const it of page.items) {
          const m = it.name.match(/^([0-9a-f]{32})\.md$/);
          if (!m) continue;
          const t = (it as unknown as { item_type?: number }).item_type
            ?? (it as unknown as { type_?: number }).type_;
          if (typeof t === 'number' && t > 0) this.itemKinds.set(m[1], t);
        }
        cursor = page.cursor;
        if (!page.has_more || !cursor) break;
      }
      this.kindsLoadedAt = Date.now();
    })().finally(() => { this.kindsLoading = null; });
    return this.kindsLoading;
  }

  /** Remember a type we learned from an item body (free, no extra request). */
  rememberItemType(id: string, type: number): void {
    if (type > 0) this.itemKinds.set(id, type);
  }

  private async mergeItemKinds(items: DeltaItem[]): Promise<void> {
    const unknown = items.some(i => isMdItemName(i.name) && !this.itemKinds.has(i.name.slice(0, 32)));
    if (unknown) {
      try { await this.loadItemKinds(this.kindsLoadedAt === 0); } catch { /* best effort */ }
    }
  }

  async acquireLock(type: LockType, clientType: string, clientId: string): Promise<SyncLock> {
    const res = await this.exec('POST', '/api/locks', {
      body: JSON.stringify({ type, clientType, clientId }),
      contentType: 'application/json',
    });
    if (res.status === 409) throw new LockConflictError(res.text);
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'acquireLock body is not JSON: ' + redactSecrets(res.text).slice(0, 200));
    return res.json as unknown as SyncLock;
  }

  async releaseLock(type: LockType, clientType: string, clientId: string): Promise<void> {
    await this.exec('DELETE', '/api/locks/' + type + '_' + clientType + '_' + clientId);
  }

  async listLocks(): Promise<Paginated<SyncLock>> {
    const res = await this.exec('GET', '/api/locks');
    if (res.status !== 200) throw new ApiError(res.status, res.text);
    if (!res.json) throw new ApiError(res.status, 'listLocks body is not JSON: ' + redactSecrets(res.text).slice(0, 200));
    return res.json as unknown as Paginated<SyncLock>;
  }

  private trimSlash(u: string) { return u.replace(/\/+$/, ''); }
}

export class ApiError extends Error {
  constructor(public status: number, text: string) { super('API error ' + status + ': ' + redactSecrets(text).slice(0, 500)); }
}
export class LockConflictError extends Error {}
