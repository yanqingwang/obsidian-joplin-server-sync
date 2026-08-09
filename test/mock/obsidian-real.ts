// Real-network mock of the Obsidian module: implement requestUrl via global fetch
// so we can drive the actual JoplinServerApi against a real server from Node.
import { webcrypto } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let vaultRoot = '';
export function setVaultRoot(root: string) { vaultRoot = root; }

export class TFile { path: string; name: string; basename: string; extension: string;
  stat: { ctime: number; mtime: number; size: number };
  constructor(p: string){
    this.path=p; this.name=p.split('/').pop()||p; const d=this.name.lastIndexOf('.');
    this.extension=d>=0?this.name.slice(d+1):''; this.basename=d>=0?this.name.slice(0,d):this.name;
    // populate stat from disk so resource upload (created/updated time) works headless
    const abs = path.isAbsolute(p) ? p : (vaultRoot ? path.join(vaultRoot, p) : p);
    try { const s = fs.statSync(abs); this.stat = { ctime: s.ctimeMs, mtime: s.mtimeMs, size: s.size }; }
    catch { const t = Date.now(); this.stat = { ctime: t, mtime: t, size: 0 }; }
  } }
export class TFolder { path: string; constructor(p:string){this.path=p;} }
export class TAbstractFile { path: string; constructor(p:string){this.path=p;} }
export class Notice { constructor(_m:string){} }
export class Modal {
  app: any; titleEl: HTMLElement; contentEl: HTMLElement;
  constructor(app: any) {
    this.app = app; this.titleEl = { setText(_t:string){} } as any;
    const makeEl = (): any => ({
      setText(_x:string){}, addClass(_c:string){}, onclick: undefined as any,
      createEl(_t:string, _o?:any){ return makeEl(); },
      createDiv(){ return makeEl(); },
    });
    this.contentEl = makeEl();
  }
  open() {}
  close() {}
}
export function normalizePath(p:string){ return p; }

(globalThis as any).window = (globalThis as any).window || globalThis;
if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;

export async function requestUrl(param: any) {
  const headers: Record<string,string> = { ...(param.headers||{}) };
  if (param.contentType) headers['Content-Type'] = param.contentType;
  const res = await fetch(param.url, { method: param.method, headers, body: param.body });
  // Read the RAW body as bytes first so binary content (resource blobs) is
  // preserved exactly. Derive text/json from the decoded bytes afterwards.
  const buf = await res.arrayBuffer();
  let text = '';
  try { text = new TextDecoder().decode(buf); } catch { /* non-text */ }
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json, arrayBuffer: buf };
}
