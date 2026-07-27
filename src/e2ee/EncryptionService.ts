import { JoplinItem, ModelType } from '../api/models';

export enum EncryptionMethod {
  SJCL1a = 4,
  KeyV1 = 7,
  FileV1 = 8,
  StringV1 = 9,
}

const GCM_TAG_BITS = 128;
const GCM_TAG_BYTES = 16; void GCM_TAG_BYTES;
const NONCE_BYTES = 12;
const PBKDF2_ITERATIONS = 100000;
const KEY_BITS = 256;

interface EncryptedHeader {
  version: number;
  method: number;
  masterKeyId: string;
  chunks: string[];
}

interface MasterKeyData {
  id: string;
  encryptionMethod: number;
  checksum: string;
  encryptedContent: string;
}

export class EncryptionService {
  private loadedKeys = new Map<string, CryptoKey>();
  private masterKeyItems = new Map<string, MasterKeyData>();

  /** Feed a MasterKey item (type_=9) to the service so it can be used for decryption */
  feedMasterKey(item: JoplinItem): void {
    if (item.type_ !== ModelType.MasterKey) return;
    this.masterKeyItems.set(item.id, {
      id: item.id,
      encryptionMethod: item.encryption_method as number || 7,
      checksum: item.checksum as string || '',
      encryptedContent: item.encryption_cipher_text || '',
    });
  }

  /** Try decrypting item body using loaded master keys. Returns null if cannot decrypt. */
  async tryDecrypt(item: JoplinItem): Promise<string | null> {
    if (!this.isEncrypted(item)) return item.body ?? '';
    const plain = await this.decryptItem(item);
    return plain;
  }

  isEncrypted(item: JoplinItem): boolean {
    return item.encryption_applied === 1;
  }

  /** Decrypt item: parse header, decrypt chunks with master key */
  async decryptItem(item: JoplinItem): Promise<string> {
    if (!this.isEncrypted(item)) return item.body ?? '';
    const header = this.parseHeader(item.encryption_cipher_text);
    const mk = this.masterKeyItems.get(header.masterKeyId);
    if (!mk) throw new Error('Master key not found: ' + header.masterKeyId);
    const key = this.loadedKeys.get(header.masterKeyId);
    if (!key) throw new Error('Master key not loaded: ' + header.masterKeyId + ' — enter password in settings');

    const parts: string[] = [];
    for (const chunk of header.chunks) {
      const decrypted = await this.decryptChunk(header.method, key, chunk);
      parts.push(decrypted);
    }
    return parts.join('');
  }

  /** Load master key from encrypted master key item + user password */
  async loadMasterKey(masterKeyId: string, password: string): Promise<void> {
    const mk = this.masterKeyItems.get(masterKeyId);
    if (!mk) throw new Error('Master key item not found: ' + masterKeyId);
    if (!password) throw new Error('Password required');

    // Parse the encrypted content (JSON: {ct, iv, salt, ...})
    let payload: Record<string, string>;
    try {
      payload = JSON.parse(mk.encryptedContent) as Record<string, string>;
    } catch {
      // Raw hex format fallback
      payload = { ct: mk.encryptedContent };
    }

    const salt = this.hexToBytes(payload.salt || '');
    const iv = this.hexToBytes(payload.iv || '');
    const ct = this.hexToBytes(payload.ct || payload.cipherText || '');

    // Derive key from password using PBKDF2
    const pbkdf2Key = await crypto.subtle.importKey(
      'raw', this.buf(new TextEncoder().encode(password)),
      { name: 'PBKDF2' }, false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this.buf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      pbkdf2Key,
      { name: 'AES-GCM', length: KEY_BITS },
      false, ['decrypt'],
    );

    // Decrypt master key content with AES-GCM
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.buf(iv), tagLength: GCM_TAG_BITS },
      key, this.buf(this.concat(iv, ct)),
    );
    const plainStr = new TextDecoder().decode(plain);

    // The decrypted content is a JSON with the actual master key
    interface MkPayload { encryption_method?: number; content?: string; ct?: string }
    let mkPayload: MkPayload;
    try {
      mkPayload = JSON.parse(plainStr) as MkPayload;
    } catch {
      // Maybe it's base64-encoded raw key material
      const rawKey = this.base64ToBytes(plainStr);
      const aesKey = await crypto.subtle.importKey(
        'raw', this.buf(rawKey), { name: 'AES-GCM' }, false, ['decrypt'],
      );
      this.loadedKeys.set(masterKeyId, aesKey);
      return;
    }

    // If the decrypted content has another layer of encryption (method 9 StringV1 uses this key directly)
    if (mkPayload.encryption_method === EncryptionMethod.StringV1 || mkPayload.encryption_method === EncryptionMethod.FileV1) {
      const rawKey = this.hexToBytes(mkPayload.content || '');
      const aesKey = await crypto.subtle.importKey(
        'raw', this.buf(rawKey), { name: 'AES-GCM' }, false, ['decrypt'],
      );
      this.loadedKeys.set(masterKeyId, aesKey);
    } else {
      // Fallback: try the content directly as key material
      const rawKey = this.hexToBytes(mkPayload.content || mkPayload.ct || '');
      const aesKey = await crypto.subtle.importKey(
        'raw', this.buf(rawKey), { name: 'AES-GCM' }, false, ['decrypt'],
      );
      this.loadedKeys.set(masterKeyId, aesKey);
    }
  }

  // === Internal: header parsing ===

  private parseHeader(ct: string): EncryptedHeader {
    // Joplin format: hex-encoded header + cipher chunks
    // Header: [3 bytes length][1 byte version][2 bytes method][32 bytes masterKeyId]
    // Then: zero or more chunks, each [6 hex chars length][hex data]

    let pos = 0;
    // Read 3-byte header length (hex)
    const headerLenHex = ct.slice(pos, pos + 6);
    const headerLen = parseInt(headerLenHex, 16);
    pos += 6;
    if (isNaN(headerLen)) throw new Error('Invalid header length');

    const headerHex = ct.slice(pos, pos + headerLen * 2);
    pos += headerLen * 2;

    const headerBytes = this.hexToBytes(headerHex);
    let hp = 0;
    const version = headerBytes[hp++];
    const method = (headerBytes[hp] << 8) | headerBytes[hp + 1]; hp += 2;
    const masterKeyId = this.bytesToHex(headerBytes.slice(hp, hp + 32)); hp += 32;

    // Parse remaining as chunks
    const chunks: string[] = [];
    while (pos < ct.length) {
      const chunkLenHex = ct.slice(pos, pos + 6);
      if (chunkLenHex.length < 6) break;
      const chunkLen = parseInt(chunkLenHex, 16);
      pos += 6;
      if (isNaN(chunkLen) || chunkLen <= 0) break;
      const chunkHex = ct.slice(pos, pos + chunkLen * 2);
      pos += chunkLen * 2;
      chunks.push(chunkHex);
    }

    return { version, method, masterKeyId, chunks };
  }

  /** Decrypt a single hex-encoded chunk with AES-GCM */
  private async decryptChunk(method: number, key: CryptoKey, chunkHex: string): Promise<string> {
    if (method === (EncryptionMethod.StringV1 as number) || method === (EncryptionMethod.FileV1 as number)) {
      const data = this.hexToBytes(chunkHex);
      const nonce = data.slice(0, NONCE_BYTES);
      const ctWithTag = data.slice(NONCE_BYTES);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.buf(nonce), tagLength: GCM_TAG_BITS },
        key, this.buf(ctWithTag),
      );
      return new TextDecoder().decode(plain);
    }
    if (method === (EncryptionMethod.SJCL1a as number)) {
      // SJCL format: not implemented, skip
      console.warn('[joplin-sync] SJCL encryption method not supported, skipping chunk');
      return '';
    }
    throw new Error('Unsupported encryption method: ' + method);
  }

  // === Helpers ===
  private hexToBytes(hex: string): Uint8Array {
    if (!hex) return new Uint8Array(0);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  private buf(u8: Uint8Array): Uint8Array<ArrayBuffer> {
    return new Uint8Array(u8.buffer, u8.byteOffset, u8.byteLength) as Uint8Array<ArrayBuffer>;
  }

  private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b);
    return out;
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

/** Encrypt a serialized item string → encryption_cipher_text (method=StringV1) */
  async encryptItem(serialized: string, masterKeyId: string): Promise<string> {
    const key = this.loadedKeys.get(masterKeyId);
    if (!key) throw new Error('Master key not loaded: ' + masterKeyId);
    const chunks: string[] = [];
    const CHUNK_SIZE = 5000; // Joplin default chunk size
    for (let i = 0; i < serialized.length; i += CHUNK_SIZE) {
      const chunk = serialized.slice(i, i + CHUNK_SIZE);
      const encrypted = await this.encryptChunk(key, chunk);
      chunks.push(encrypted);
    }
    return this.buildHeader(EncryptionMethod.StringV1, masterKeyId, chunks);
  }

  /** Encrypt a plaintext chunk → hex-encoded nonce+ciphertext+tag */
  private async encryptChunk(key: CryptoKey, plain: string): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const encoded = new TextEncoder().encode(plain);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: this.buf(nonce), tagLength: GCM_TAG_BITS },
      key, this.buf(encoded),
    );
    const encryptedBytes = new Uint8Array(encrypted);
    const combined = this.concat(nonce, encryptedBytes);
    return this.bytesToHex(combined);
  }

  /** Build Joplin header hex: [3B len][1B ver][2B method][32B masterKeyId] + chunks */
  private buildHeader(method: number, masterKeyId: string, chunks: string[]): string {
    const headerBytes = new Uint8Array(1 + 2 + 32);
    let p = 0;
    headerBytes[p++] = 1; // version
    headerBytes[p++] = (method >> 8) & 0xFF;
    headerBytes[p++] = method & 0xFF;
    const mkBytes = this.hexToBytes(masterKeyId);
    headerBytes.set(mkBytes, p); p += 32;
    const headerHex = this.bytesToHex(headerBytes);
    // 3-byte header length in hex
    const hLenHex = (headerBytes.length).toString(16).padStart(6, '0');
    let out = hLenHex + headerHex;
    for (const chunk of chunks) {
      const chunkBytes = chunk.length / 2;
      out += (chunkBytes).toString(16).padStart(6, '0') + chunk;
    }
    return out;
  }

  get hasLoadedKeys(): boolean { return this.loadedKeys.size > 0; }
  get availableMasterKeys(): string[] { return [...this.masterKeyItems.keys()]; }
  get firstLoadedKeyId(): string | null { return this.loadedKeys.keys().next().value ?? null; }
}