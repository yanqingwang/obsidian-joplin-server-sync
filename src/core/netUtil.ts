/**
 * Transport-level helpers shared by the API client and the sync engine.
 *
 * Everything here is deliberately dependency-free so it can be unit-tested
 * from Node without the Obsidian runtime.
 */

/** Joplin item name shapes. Addressing on the server is FLAT:
 *    `<32-hex>.md`            → note / folder / resource metadata / master key
 *    `.resource/<32-hex>`     → resource blob
 *    `info.json`              → sync-target metadata
 *  Resource blob CHANGES never bump their meta item's updated_time, so a
 *  delta-only pull can miss attachment updates unless blobs are compared too. */
export const MD_NAME_RE = /^[0-9a-f]{32}\.md$/;
export const RESOURCE_BLOB_RE = /^\.resource\/([0-9a-f]{32})$/;

export function isMdItemName(name: string): boolean {
  return MD_NAME_RE.test(name);
}

export function resourceBlobId(name: string): string | null {
  const m = name.match(RESOURCE_BLOB_RE);
  return m ? m[1] : null;
}

/** Exponential backoff with full jitter, capped.
 *  Jitter matters: every client that hit the same 5xx would otherwise retry
 *  in lock-step and re-create the thundering herd that caused the failure. */
export function backoffDelay(attempt: number, baseMs = 1000, capMs = 30_000): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** Parse a Retry-After header (seconds or HTTP date). Returns ms or null. */
export function parseRetryAfter(value: string | undefined | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(300_000, secs * 1000);
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, Math.min(300_000, when - Date.now()));
  return null;
}

/** Strip credentials out of anything we log or show in a Notice.
 *  Session tokens and passwords must never reach the developer console,
 *  a Notice, or a pasted bug report. */
export function redactSecrets(input: unknown): string {
  let s = typeof input === 'string' ? input : (() => {
    try { return JSON.stringify(input); } catch { return String(input); }
  })();
  if (!s) return '';
  // JSON bodies that carry a password (login attempts, error echoes)
  s = s.replace(/("(?:password|passwd|pwd)"\s*:\s*)"[^"]*"/gi, '$1"***"');
  // Auth headers: X-API-AUTH: <token> / Authorization: Bearer <token>
  s = s.replace(/(X-API-AUTH\s*[:=]\s*)[^\s,;'"}]+/gi, '$1***');
  s = s.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, '$1***');
  // Joplin session ids are 32-char hex; only redact when presented as a token
  s = s.replace(/(sessionId\s*=\s*)[0-9a-f]{32}/gi, '$1***');
  return s;
}

/** A bounded-concurrency gate that can be resized at runtime.
 *  A fixed batch size either hammers a small server or under-uses a fast one;
 *  the engine raises `limit` on sustained success and drops it on 429/5xx. */
export class ConcurrencyGate {
  private active = 0;
  private waiters: (() => void)[] = [];
  private _limit: number;

  constructor(
    limit: number,
    private readonly maxLimit = limit,
    private readonly minLimit = 1,
  ) {
    this._limit = Math.max(minLimit, Math.min(maxLimit, limit));
  }

  get limit(): number { return this._limit; }
  get pending(): number { return this.waiters.length; }
  get inflight(): number { return this.active; }

  /** Grow the limit (sustained fast successes). */
  grow(step = 1): void {
    this._limit = Math.min(this.maxLimit, this._limit + step);
    this.drain();
  }

  /** Shrink the limit (server pushed back). Never drops in-flight work. */
  shrink(factor = 0.5): void {
    this._limit = Math.max(this.minLimit, Math.floor(this._limit * factor));
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this._limit) { this.active++; return Promise.resolve(); }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    this.active--;
    this.drain();
  }

  private drain(): void {
    while (this.waiters.length > 0 && this.active < this._limit) {
      const next = this.waiters.shift();
      if (!next) break;
      this.active++;
      next();
    }
  }
}

/** Run `items` through `fn` with the gate's concurrency, preserving order of
 *  results. Errors are captured per item (never rejects). */
export async function mapConcurrent<T, R>(
  items: T[],
  gate: ConcurrencyGate,
  fn: (item: T, index: number) => Promise<R>,
): Promise<{ value?: R; error?: unknown; item: T }[]> {
  const out: { value?: R; error?: unknown; item: T }[] = new Array(items.length);
  await Promise.all(items.map((item, i) => gate.run(async () => {
    try {
      out[i] = { value: await fn(item, i), item };
    } catch (e) {
      out[i] = { error: e, item };
    }
  })));
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
