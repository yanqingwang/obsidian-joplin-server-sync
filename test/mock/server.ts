// In-memory mock of the Joplin Server REST API.
// Faithfully stores items by name and serves children/delta with cursor pagination,
// so we can test the plugin's push/pull logic deterministically.

interface StoredItem {
  name: string;
  content: string;
  binary?: ArrayBuffer;
  updated_time: number;
}

type DeltaType = 1 | 2 | 3; // create / update / delete
interface DeltaEntry {
  name: string;
  type: DeltaType;
  updated_time: number;
}

const PAGE_SIZE = 100;

function extractName(url: string): string {
  // PUT/GET content: /api/items/root:/<NAME>:/content
  let m = url.match(/\/api\/items\/root:\/(.+?):\/content/);
  if (m) return decodeURIComponent(m[1]);
  // DELETE: /api/items/root:/<NAME>:
  m = url.match(/\/api\/items\/root:\/(.+?):$/);
  if (m) return decodeURIComponent(m[1]);
  return '';
}

export class MockJoplinServer {
  private items = new Map<string, StoredItem>();
  private deltas: DeltaEntry[] = [];
  private page = PAGE_SIZE;

  setPageSize(n: number) { this.page = n; }

  async handle(method: string, url: string, body: string | ArrayBuffer | undefined) {
    const pathname = url.replace(/^https?:\/\/[^/]+/, '');
    const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    const text = typeof body === 'string' ? body : '';

    if (url.endsWith('/api/sessions') && method === 'POST') {
      return { status: 200, text: JSON.stringify({ id: 'sess-token' }), arrayBuffer: enc('') };
    }

    if (url.includes('/api/items/root:')) {
      const name = extractName(url);
      if (method === 'PUT') {
        const updated = Date.now();
        const prev = this.items.get(name);
        const bin = typeof body !== 'string' ? body : undefined;
        this.items.set(name, { name, content: text, binary: bin, updated_time: updated });
        // delta
        const dt: DeltaType = prev ? 2 : 1;
        const id = name.replace(/\.md$/, '').replace(/^\.resource\//, '');
        this.deltas.push({ name, type: dt, updated_time: updated });
        return { status: 200, text: JSON.stringify({ id, updated_time: updated }), arrayBuffer: enc('') };
      }
      if (method === 'GET' && url.includes('/content')) {
        const it = this.items.get(name);
        if (!it) return { status: 404, text: 'not found', arrayBuffer: enc('') };
        if (it.binary) return { status: 200, text: '', arrayBuffer: it.binary };
        return { status: 200, text: it.content, arrayBuffer: enc(it.content) };
      }
      if (method === 'DELETE') {
        const existed = this.items.has(name);
        this.items.delete(name);
        this.deltas.push({ name, type: 3, updated_time: Date.now() });
        return { status: existed ? 200 : 404, text: '{}', arrayBuffer: enc('') };
      }
    }

    if (url.includes('/api/items/root:/:/children') || url.includes('/api/items/root:/:/delta')) {
      if (url.includes('/delta')) return this.listDelta(this.cursorFromUrl(url));
      return this.listChildren(this.cursorFromUrl(url));
    }

    return { status: 404, text: 'unknown mock path: ' + url, arrayBuffer: enc('') };
  }

  private cursorFromUrl(url: string): string | undefined {
    const m = url.match(/[?&]cursor=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  }

  private listChildren(cursor?: string) {
    const all = [...this.items.values()];
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = all.slice(start, start + this.page);
    const has_more = start + this.page < all.length;
    const nextCursor = has_more ? String(start + this.page) : undefined;
    const items = slice.map(it => ({ name: it.name, updated_time: it.updated_time }));
    return {
      status: 200,
      text: JSON.stringify({ items, has_more, cursor: nextCursor }),
      arrayBuffer: new ArrayBuffer(0),
    };
  }

  private listDelta(cursor?: string) {
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = this.deltas.slice(start, start + this.page);
    const has_more = start + this.page < this.deltas.length;
    const nextCursor = has_more ? String(start + this.page) : undefined;
    const items = slice.map(d => ({
      name: d.name, type: d.type, updated_time: d.updated_time,
      item_name: d.name, jop_updated_time: d.updated_time,
    }));
    return {
      status: 200,
      text: JSON.stringify({ items, has_more, cursor: nextCursor }),
      arrayBuffer: new ArrayBuffer(0),
    };
  }

  // For debugging
  snapshot() {
    return [...this.items.keys()];
  }
}
