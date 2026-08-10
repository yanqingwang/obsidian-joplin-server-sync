import { JoplinItem, ModelType } from '../api/models';

/**
 * Joplin-compatible End-to-End Encryption (E2EE).
 *
 * Protocol aligned with the official Joplin implementation
 * (`packages/lib/services/e2ee/EncryptionService.ts` on `dev` branch):
 *
 *  - Encryption methods: SJCL(1), SJCL2(2), SJCL3(3), SJCL4(4), SJCL1a(5),
 *    Custom(6), SJCL1b(7), KeyV1(8), FileV1(9), StringV1(10).
 *  - Master key (type_=9): 256 random bytes → 512 hex chars, wrapped with
 *    KeyV1: AES-256-GCM with a PBKDF2-SHA512 key derived from the user
 *    password (220000 iterations). `content` = JSON {salt, iv, ct} base64.
 *  - Items (notes): StringV1 — AES-256-GCM with PBKDF2-SHA512 (3 iterations)
 *    derived from the master key HEX STRING as password; data encoded utf16le.
 *  - Resources: FileV1 — same but data encoded base64, 128k chunks.
 *  - Encryption layout (cipher text):
 *        [JED01][6-hex metadataLen][2-hex method][32-hex masterKeyId]
 *        + for each chunk: [6-hex chunkLen][JSON {salt,iv,ct} base64]
 *
 *  Chunk sizes: StringV1 = 65536 (64k), FileV1 = 131072 (128k), SJCL = 5000.
 */

export enum EncryptionMethod {
  SJCL = 1,
  SJCL2 = 2,
  SJCL3 = 3,
  SJCL4 = 4,
  SJCL1a = 5,
  Custom = 6,
  SJCL1b = 7,
  KeyV1 = 8,
  FileV1 = 9,
  StringV1 = 10,
}

const HEADER_IDENTIFIER = 'JED01';
const GCM_TAG_BITS = 128;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const KEYV1_ITERATIONS = 220000;
const CHUNK_ITERATIONS = 3;

const CHUNK_SIZES: Record<number, number> = {
  [EncryptionMethod.SJCL]: 5000,
  [EncryptionMethod.SJCL2]: 5000,
  [EncryptionMethod.SJCL3]: 5000,
  [EncryptionMethod.SJCL4]: 5000,
  [EncryptionMethod.SJCL1a]: 5000,
  [EncryptionMethod.SJCL1b]: 5000,
  [EncryptionMethod.KeyV1]: 5000,
  [EncryptionMethod.FileV1]: 131072,
  [EncryptionMethod.StringV1]: 65536,
};

interface EncryptedHeader {
  version: number;
  method: EncryptionMethod;
  masterKeyId: string;
}

interface EncryptionResult {
  salt: string; // base64
  iv: string;   // base64
  ct: string;   // cipherText base64
}

interface MasterKeyData {
  id: string;
  encryptionMethod: number;
  checksum: string;
  encryptedContent: string;
}

export class EncryptionService {
  /** masterKeyId → decrypted master key plain text (512 hex chars) */
  private masterKeyPlainTexts = new Map<string, string>();
  private masterKeyItems = new Map<string, MasterKeyData>();
  private activeMasterKeyId: string | null = null;

  /** Feed a MasterKey item (type_=9) so it can be used for decryption. */
  feedMasterKey(item: JoplinItem): void {
    if (item.type_ !== ModelType.MasterKey) return;
    const candidates: string[] = [
      (item as Record<string, unknown>).content as string ?? '',
      item.body ?? '',
      item.encryption_cipher_text ?? '',
    ];
    let encryptedContent = '';
    for (const c of candidates) {
      if (!c) continue;
      try {
        const p = JSON.parse(c) as Record<string, unknown>;
        if (p && p.iv && p.ct && p.salt) { encryptedContent = c; break; }
      } catch { /* try next candidate */ }
    }
    if (!encryptedContent) encryptedContent = candidates.find(c => !!c) ?? '';
    this.masterKeyItems.set(item.id, {
      id: item.id,
      encryptionMethod: (item as Record<string, unknown>).encryption_method as number ?? EncryptionMethod.KeyV1,
      checksum: (item as Record<string, unknown>).checksum as string ?? '',
      encryptedContent,
    });
  }

  /** Generate a fresh master key (KeyV1) from a password. Returns the wrapped key entity. */
  async generateMasterKey(password: string, id: string): Promise<MasterKeyData> {
    if (!password) throw new Error('Password required to generate a master key');
    // Joplin master keys are 256 random bytes → 512 hex chars.
    const keyBytes = crypto.getRandomValues(new Uint8Array(256));
    const hexKey = this.bytesToHex(keyBytes);

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const result = await this.encryptAesGcm(password, salt, this.buf(new TextEncoder().encode(hexKey)), KEYV1_ITERATIONS);
    return {
      id,
      encryptionMethod: EncryptionMethod.KeyV1,
      checksum: '',
      encryptedContent: JSON.stringify(result),
    };
  }

  /** Load a master key into memory by decrypting its content with the user password. */
  async loadMasterKey(masterKeyId: string, password: string): Promise<void> {
    const mk = this.masterKeyItems.get(masterKeyId);
    if (!mk) throw new Error('Master key item not found: ' + masterKeyId);
    if (!password) throw new Error('Password required');

    let result: EncryptionResult;
    try {
      result = JSON.parse(mk.encryptedContent) as EncryptionResult;
    } catch {
      throw new Error('Master key ' + masterKeyId + ' has invalid encrypted content (not JSON)');
    }
    if (!result.salt || !result.iv || !result.ct) {
      throw new Error('Master key ' + masterKeyId + ' has invalid encrypted content (missing salt/iv/ct)');
    }

    const plainBuf = await this.decryptAesGcm(
      password,
      this.base64ToBytes(result.salt),
      this.base64ToBytes(result.iv),
      this.base64ToBytes(result.ct),
      KEYV1_ITERATIONS,
    );
    const hexKey = new TextDecoder().decode(plainBuf).trim();
    if (!/^[0-9a-f]+$/i.test(hexKey)) {
      throw new Error('Master key ' + masterKeyId + ' decrypted to invalid key material (wrong password?)');
    }
    this.masterKeyPlainTexts.set(masterKeyId, hexKey);
    this.activeMasterKeyId = masterKeyId;
  }

  isEncrypted(item: JoplinItem): boolean {
    return item.encryption_applied === 1;
  }

  async tryDecrypt(item: JoplinItem): Promise<string | null> {
    if (!this.isEncrypted(item)) return item.body ?? '';
    return this.decryptItem(item);
  }

  /** Decrypt an item's `encryption_cipher_text` → serialized (plain) item text. */
  async decryptItem(item: JoplinItem): Promise<string> {
    if (!this.isEncrypted(item)) return item.body ?? '';
    const header = this.parseHeader(item.encryption_cipher_text);
    if (header.method !== EncryptionMethod.StringV1) {
      throw new Error('Item encryption method ' + header.method + ' not supported (only StringV1=10)');
    }
    const masterKeyHex = this.masterKeyPlainTexts.get(header.masterKeyId);
    if (!masterKeyHex) throw new Error('Master key not loaded: ' + header.masterKeyId + ' — enter password');
    return this.decryptChunks(item.encryption_cipher_text, header.method, masterKeyHex, 'utf16le');
  }

  /** Encrypt a serialized item string → `encryption_cipher_text` (StringV1). */
  async encryptItem(serialized: string, masterKeyId: string): Promise<string> {
    const masterKeyHex = this.masterKeyPlainTexts.get(masterKeyId);
    if (!masterKeyHex) throw new Error('Master key not loaded: ' + masterKeyId);
    const chunks = await this.encryptChunks(serialized, EncryptionMethod.StringV1, masterKeyHex, 'utf16le');
    return this.buildCipherText(EncryptionMethod.StringV1, masterKeyId, chunks);
  }

  /** Encrypt binary resource data (FileV1) → hex cipher text string. */
  async encryptBlob(data: ArrayBuffer, masterKeyId: string): Promise<string> {
    const masterKeyHex = this.masterKeyPlainTexts.get(masterKeyId);
    if (!masterKeyHex) throw new Error('Master key not loaded: ' + masterKeyId);
    // Joplin encodes file content to base64, then encrypts the base64 string.
    const b64 = this.arrayBufferToBase64(data);
    const chunks = await this.encryptChunks(b64, EncryptionMethod.FileV1, masterKeyHex, 'base64');
    return this.buildCipherText(EncryptionMethod.FileV1, masterKeyId, chunks);
  }

  /** Decrypt a resource blob cipher text (FileV1) → binary. */
  async decryptBlob(data: string, _masterKeyId?: string): Promise<ArrayBuffer> {
    const header = this.parseHeader(data);
    if (header.method !== EncryptionMethod.FileV1) {
      throw new Error('Resource encryption method ' + header.method + ' not supported (only FileV1=9)');
    }
    const masterKeyHex = this.masterKeyPlainTexts.get(header.masterKeyId);
    if (!masterKeyHex) throw new Error('Master key not loaded: ' + header.masterKeyId + ' — enter password');
    const b64 = await this.decryptChunks(data, header.method, masterKeyHex, 'base64');
    return this.base64ToBytes(b64).buffer as ArrayBuffer;
  }

  /** Encrypt binary data → ArrayBuffer (JED01 cipher text bytes, for direct upload). */
  async encryptBlobData(data: ArrayBuffer, masterKeyId: string): Promise<ArrayBuffer> {
    const hex = await this.encryptBlob(data, masterKeyId);
    return new TextEncoder().encode(hex).buffer;
  }

  /** Decrypt a JED01 cipher text blob (ArrayBuffer from server) → plaintext ArrayBuffer. */
  async decryptBlobData(data: ArrayBuffer, masterKeyId?: string): Promise<ArrayBuffer> {
    const hex = new TextDecoder().decode(data);
    return this.decryptBlob(hex, masterKeyId);
  }

  // === Chunked encryption (StringV1 / FileV1) ===

  private async encryptChunks(
    plain: string,
    method: number,
    masterKeyHex: string,
    encoding: 'utf16le' | 'base64',
  ): Promise<string[]> {
    const chunkSize = CHUNK_SIZES[method] ?? 65536;
    const chunks: string[] = [];
    for (let i = 0; i < plain.length; i += chunkSize) {
      const block = plain.slice(i, i + chunkSize);
      chunks.push(await this.encryptBlock(block, masterKeyHex, encoding));
    }
    return chunks;
  }

  private async decryptChunks(
    cipherText: string,
    method: number,
    masterKeyHex: string,
    encoding: 'utf16le' | 'base64',
  ): Promise<string> {
    const headerLenHex = cipherText.slice(HEADER_IDENTIFIER.length, HEADER_IDENTIFIER.length + 6);
    const headerLen = parseInt(headerLenHex, 16);
    // headerLen is the metadata length in CHARACTERS (2 method + 32 key id = 34)
    let pos = HEADER_IDENTIFIER.length + 6 + headerLen;

    const parts: string[] = [];
    while (pos < cipherText.length) {
      const chunkLenHex = cipherText.slice(pos, pos + 6);
      if (chunkLenHex.length < 6) break;
      const chunkLen = parseInt(chunkLenHex, 16);
      pos += 6;
      if (isNaN(chunkLen) || chunkLen <= 0) break;
      const block = cipherText.slice(pos, pos + chunkLen);
      pos += chunkLen;
      parts.push(await this.decryptBlock(block, masterKeyHex, encoding));
    }
    return parts.join('');
  }

  /** Encrypt one block → JSON {salt, iv, ct} base64 */
  private async encryptBlock(plain: string, masterKeyHex: string, encoding: 'utf16le' | 'base64'): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const data = encoding === 'utf16le' ? this.utf16leEncode(plain) : this.base64ToBytes(plain);
    const result = await this.encryptAesGcm(masterKeyHex, salt, this.buf(data), CHUNK_ITERATIONS);
    return JSON.stringify(result);
  }

  /** Decrypt one JSON block → plain string */
  private async decryptBlock(block: string, masterKeyHex: string, encoding: 'utf16le' | 'base64'): Promise<string> {
    let result: EncryptionResult;
    try {
      result = JSON.parse(block) as EncryptionResult;
    } catch {
      throw new Error('Invalid encrypted block (not JSON): ' + block.slice(0, 32) + '…');
    }
    if (!result.salt || !result.iv || !result.ct) {
      throw new Error('Invalid encrypted block (missing salt/iv/ct)');
    }
    const plainBuf = await this.decryptAesGcm(
      masterKeyHex,
      this.base64ToBytes(result.salt),
      this.base64ToBytes(result.iv),
      this.base64ToBytes(result.ct),
      CHUNK_ITERATIONS,
    );
    if (encoding === 'utf16le') return this.utf16leDecode(plainBuf);
    return this.bytesToBase64(new Uint8Array(plainBuf));
  }

  // === AES-GCM + PBKDF2 (matches Joplin native crypto) ===

  private async deriveKey(
    password: string,
    salt: Uint8Array,
    iterations: number,
    usage: KeyUsage[],
  ): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw', this.buf(new TextEncoder().encode(password)),
      { name: 'PBKDF2' }, false, ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: this.buf(salt), iterations, hash: 'SHA-512' },
      baseKey,
      { name: 'AES-GCM', length: KEY_BYTES * 8 },
      false, usage,
    );
  }

  private async encryptAesGcm(
    password: string,
    salt: Uint8Array,
    data: Uint8Array,
    iterations: number,
  ): Promise<EncryptionResult> {
    const key = await this.deriveKey(password, salt, iterations, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: this.buf(iv), tagLength: GCM_TAG_BITS },
      key, this.buf(data),
    );
    return {
      salt: this.bytesToBase64(salt),
      iv: this.bytesToBase64(iv),
      ct: this.bytesToBase64(new Uint8Array(ct)),
    };
  }

  private async decryptAesGcm(
    password: string,
    salt: Uint8Array,
    iv: Uint8Array,
    ct: Uint8Array,
    iterations: number,
  ): Promise<Uint8Array> {
    const key = await this.deriveKey(password, salt, iterations, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.buf(iv), tagLength: GCM_TAG_BITS },
      key, this.buf(ct),
    );
    return new Uint8Array(plain);
  }

  // === Header parsing/building (JED01) ===

  private parseHeader(ct: string): EncryptedHeader {
    if (!ct.startsWith(HEADER_IDENTIFIER)) {
      throw new Error('Invalid E2EE header (missing JED01 identifier)');
    }
    const mdSizeHex = ct.slice(HEADER_IDENTIFIER.length, HEADER_IDENTIFIER.length + 6);
    const mdSize = parseInt(mdSizeHex, 16);
    if (isNaN(mdSize) || !mdSize) throw new Error('Invalid E2EE header metadata size: ' + mdSizeHex);
    const md = ct.slice(HEADER_IDENTIFIER.length + 6, HEADER_IDENTIFIER.length + 6 + mdSize);
    // md layout: [2-hex method][32-hex masterKeyId]
    const method = parseInt(md.slice(0, 2), 16) as EncryptionMethod;
    const masterKeyId = md.slice(2, 34);
    if (masterKeyId.length !== 32) throw new Error('Invalid E2EE header master key ID size');
    return { version: 1, method, masterKeyId };
  }

  private buildHeader(method: number, masterKeyId: string): string {
    if (masterKeyId.length !== 32) throw new Error('Invalid master key ID size: ' + masterKeyId);
    const metadata = method.toString(16).padStart(2, '0') + masterKeyId;
    const mdSizeHex = metadata.length.toString(16).padStart(6, '0');
    return HEADER_IDENTIFIER + mdSizeHex + metadata;
  }

  private buildCipherText(method: number, masterKeyId: string, chunks: string[]): string {
    let out = this.buildHeader(method, masterKeyId);
    for (const chunk of chunks) {
      out += chunk.length.toString(16).padStart(6, '0') + chunk;
    }
    return out;
  }

  // === Encoding helpers ===

  private utf16leEncode(s: string): Uint8Array {
    const out = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      out[i * 2] = code & 0xFF;
      out[i * 2 + 1] = (code >> 8) & 0xFF;
    }
    return out;
  }

  private utf16leDecode(bytes: Uint8Array): string {
    const chars: string[] = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      chars.push(String.fromCharCode(bytes[i] | (bytes[i + 1] << 8)));
    }
    return chars.join('');
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Uint8Array(bytes.buffer);
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  private arrayBufferToBase64(data: ArrayBuffer): string {
    return this.bytesToBase64(new Uint8Array(data));
  }

  private hexToBytes(hex: string): Uint8Array {
    if (!hex) return new Uint8Array(0);
    const clean = hex.length % 2 ? '0' + hex : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return new Uint8Array(bytes.buffer);
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Copy into a fresh concrete ArrayBuffer-backed view (BufferSource compat). */
  private buf(u8: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(u8.byteLength);
    out.set(u8);
    return new Uint8Array(out.buffer);
  }

  get hasLoadedKeys(): boolean { return this.masterKeyPlainTexts.size > 0; }
  get availableMasterKeys(): string[] { return [...this.masterKeyItems.keys()]; }
  get activeKeyId(): string | null { return this.activeMasterKeyId; }
  get firstLoadedKeyId(): string | null { return this.masterKeyPlainTexts.keys().next().value ?? null; }
}

export class MasterKeyNotLoadedError extends Error {
  constructor(public masterKeyId: string) {
    super(`Master key ${masterKeyId} not loaded — password required`);
  }
}
