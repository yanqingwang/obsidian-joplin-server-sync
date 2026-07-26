// fs-backed mock of the Obsidian Vault + adapter, enough for forcePush / forcePull.
import * as fs from 'fs';
import * as path from 'path';
import { TFile, TFolder, TAbstractFile } from 'obsidian';

export class MockVault {
  adapter: MockAdapter;
  constructor(public root: string) {
    this.adapter = new MockAdapter();
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  }

  private abs(p: string): string {
    return path.join(this.root, p.replace(/^\/+/, ''));
  }

  getMarkdownFiles(): TFile[] {
    return this.walk().filter(f => f.endsWith('.md')).map(f => new TFile(f));
  }
  getFiles(): TFile[] {
    return this.walk().filter(f => {
      const ext = f.split('.').pop() || '';
      return ext.length > 0 && ext !== 'md' ? true : f.endsWith('.md');
    }).map(f => new TFile(f));
  }
  private walk(): string[] {
    const out: string[] = [];
    const rec = (dir: string) => {
      let ents: fs.Dirent[];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const full = path.join(dir, e.name);
        const rel = path.relative(this.root, full).split(path.sep).join('/');
        if (e.isDirectory()) rec(full);
        else out.push(rel);
      }
    };
    rec(this.root);
    return out;
  }

  getAbstractFileByPath(p: string): TAbstractFile | null {
    const clean = p.replace(/\/+$/, '');
    const abs = this.abs(clean);
    try {
      const st = fs.statSync(abs);
      if (st.isDirectory()) return new TFolder(clean + '/');
      if (st.isFile()) return new TFile(clean);
    } catch { return null; }
    return null;
  }

  async create(p: string, content: string): Promise<void> {
    const abs = this.abs(p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  async createBinary(p: string, content: ArrayBuffer): Promise<void> {
    const abs = this.abs(p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(content));
  }
  async modifyBinary(file: TFile | string, content: ArrayBuffer): Promise<void> {
    const p = typeof file === 'string' ? file : file.path;
    fs.writeFileSync(this.abs(p), Buffer.from(content));
  }
  async modify(file: TFile | string, content: string): Promise<void> {
    const p = typeof file === 'string' ? file : file.path;
    fs.writeFileSync(this.abs(p), content);
  }
  async createFolder(p: string): Promise<void> {
    fs.mkdirSync(this.abs(p), { recursive: true });
  }
  async read(file: TFile | string): Promise<string> {
    const p = typeof file === 'string' ? file : file.path;
    return fs.readFileSync(this.abs(p), 'utf8');
  }
  async readBinary(file: TFile | string): Promise<ArrayBuffer> {
    const p = typeof file === 'string' ? file : file.path;
    // NOTE: `Buffer.buffer` can be a shared pool backing-store (for small
    // files), so slice out exactly the bytes we read to avoid trailing garbage.
    const buf = fs.readFileSync(this.abs(p));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }
}

export class MockFileManager {
  constructor(private vault: MockVault) {}
  async trashFile(file: TFile): Promise<void> {
    const abs = path.join(this.vault.root, file.path);
    try { fs.rmSync(abs, { force: true }); } catch { /* ignore */ }
  }
}

// In-memory adapter for plugin data (mapping.json etc.), isolated from disk.
export class MockAdapter {
  private store = new Map<string, string>();
  async exists(p: string): Promise<boolean> { return this.store.has(p); }
  async read(p: string): Promise<string> { return this.store.get(p) || ''; }
  async write(p: string, content: string): Promise<void> { this.store.set(p, content); }
  async mkdir(_p: string): Promise<void> { /* noop */ }
  async rename(from: string, to: string): Promise<void> {
    const v = this.store.get(from); if (v !== undefined) { this.store.delete(from); this.store.set(to, v); }
  }
  async remove(p: string): Promise<void> { this.store.delete(p); }
}

// Disk-backed adapter: writes plugin data (mapping.json) next to the real
// plugin so the CLI shares state with the Obsidian plugin (no ID churn).
export class DiskAdapter {
  async exists(p: string): Promise<boolean> { try { return fs.existsSync(p); } catch { return false; } }
  async read(p: string): Promise<string> { return fs.readFileSync(p, 'utf8'); }
  async write(p: string, content: string): Promise<void> {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  async mkdir(p: string): Promise<void> { fs.mkdirSync(p, { recursive: true }); }
  async rename(from: string, to: string): Promise<void> {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }
  async remove(p: string): Promise<void> { fs.rmSync(p, { force: true }); }
}
