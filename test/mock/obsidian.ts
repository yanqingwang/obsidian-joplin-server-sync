// Mock of the Obsidian module for headless testing of the sync engine.
// Provides just enough surface for forcePush / forcePull to run.

export class TAbstractFile {
  path: string;
  constructor(path: string) { this.path = path; }
}
export class TFile extends TAbstractFile {
  name: string;
  basename: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };
  constructor(path: string) {
    super(path);
    this.name = path.split('/').pop() || path;
    const dot = this.name.lastIndexOf('.');
    this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
    this.stat = { ctime: 1000, mtime: 1000, size: 0 };
  }
}
export class TFolder extends TAbstractFile {}

export class Notice {
  constructor(public message: string, _timeout?: number) {
    console.log('[NOTICE]', message);
  }
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
}

// ---- requestUrl dispatch to a pluggable in-memory server ----
type ReqHandler = (method: string, url: string, body: string | ArrayBuffer | undefined) =>
  Promise<{ status: number; text: string; arrayBuffer: ArrayBuffer }>;

let _handler: ReqHandler | null = null;
export function __setRequestHandler(h: ReqHandler) { _handler = h; }

export async function requestUrl(param: {
  url: string; method: string; headers?: Record<string, string>;
  body?: string | ArrayBuffer; contentType?: string; throw?: boolean;
}): Promise<{ status: number; text: string; json: any; arrayBuffer: ArrayBuffer }> {
  if (!_handler) throw new Error('No mock request handler set');
  const res = await _handler(param.method.toUpperCase(), param.url, param.body);
  let json: any = null;
  try { json = res.text ? JSON.parse(res.text) : null; } catch { json = null; }
  return { status: res.status, text: res.text, json, arrayBuffer: res.arrayBuffer };
}

// Provide window + crypto globals used by the plugin.
(globalThis as any).window = (globalThis as any).window || globalThis;
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = require('crypto').webcrypto;
}
