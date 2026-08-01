// Cross-implementation verification: our EncryptionService vs official Joplin algorithm.
// Re-implements the official Joplin E2EE flow independently (Node Buffer, direct PBKDF2/AES-GCM)
// and checks our plugin output decrypts correctly with the reference implementation and vice versa.
// Run: npx esbuild test/e2ee-interop.test.ts --bundle --platform=node --format=esm --outfile=test/e2ee-interop-out.mjs && node test/e2ee-interop-out.mjs
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { EncryptionService, EncryptionMethod } from '../src/e2ee/EncryptionService';

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

// === Reference implementation mirroring official Joplin crypto.ts ===
const pbkdf2Raw = async (password: string, salt: Uint8Array, iterations: number, keylenBytes: number) => {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(password, 'utf8'), { name: 'PBKDF2' }, false, ['deriveKey']);
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-512' },
    key, { name: 'AES-GCM', length: keylenBytes * 8 }, false, ['encrypt', 'decrypt'],
  );
};

const refEncrypt = async (password: string, salt: Uint8Array, data: Buffer, iterations: number) => {
  const key = await pbkdf2Raw(password, salt, iterations, 32);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data));
  return { salt: Buffer.from(salt).toString('base64'), iv: Buffer.from(iv).toString('base64'), ct: ct.toString('base64') };
};

const refDecrypt = async (password: string, r: { salt: string; iv: string; ct: string }, iterations: number) => {
  const key = await pbkdf2Raw(password, Buffer.from(r.salt, 'base64'), iterations, 32);
  return Buffer.from(await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(r.iv, 'base64'), tagLength: 128 },
    key, Buffer.from(r.ct, 'base64'),
  ));
};

// Reference: master key wrap (KeyV1, 220000 iterations), official generateMasterKeyContent_
const refGenerateMasterKey = async (password: string) => {
  const hexKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(256))).toString('hex');
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const result = await refEncrypt(password, salt, Buffer.from(hexKey, 'utf8'), 220000);
  return { encryptionMethod: EncryptionMethod.KeyV1, encryptedContent: JSON.stringify(result), plainHex: hexKey };
};

// Reference: item chunk encryption (StringV1, 3 iterations, utf16le) — official encryptString + encryptAbstract_
const refEncryptString = async (masterKeyHex: string, plain: string): Promise<string> => {
  const chunkSize = 65536;
  const header = 'JED01' + (34).toString(16).padStart(6, '0') + (10).toString(16).padStart(2, '0') + '01234568abcdefgh01234568abcdefgh';
  let out = header;
  for (let i = 0; i < plain.length; i += chunkSize) {
    const block = plain.slice(i, i + chunkSize);
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const result = await refEncrypt(masterKeyHex, salt, Buffer.from(block, 'utf16le'), 3);
    const json = JSON.stringify(result);
    out += json.length.toString(16).padStart(6, '0') + json;
  }
  return out;
};

// Reference: item chunk decryption
const refDecryptString = async (masterKeyHex: string, cipherText: string): Promise<string> => {
  const pos = 5 + 6 + 34;
  let i = pos;
  const parts: string[] = [];
  while (i < cipherText.length) {
    const len = parseInt(cipherText.slice(i, i + 6), 16);
    i += 6;
    const r = JSON.parse(cipherText.slice(i, i + len));
    i += len;
    const plain = await refDecrypt(masterKeyHex, r, 3);
    parts.push(plain.toString('utf16le'));
  }
  return parts.join('');
};

console.log('\n=== E2EE Interop: plugin ↔ reference (official algorithm) ===\n');

const service = new EncryptionService();
const keyId = '01234568abcdefgh01234568abcdefgh';
const PASSWORD = 'interop-password-123';

// 1. Plugin generates master key → reference decrypts it
console.log('[master key: plugin gen → ref decrypt]');
const mk = await service.generateMasterKey(PASSWORD, keyId);
const mkRef = await refDecrypt(PASSWORD, JSON.parse(mk.encryptedContent), 220000);
const mkHex = mkRef.toString('utf8');
assert(/^[0-9a-f]{512}$/.test(mkHex), 'reference decrypts plugin master key to 512-hex');
service.feedMasterKey({ id: keyId, type_: 9, content: mk.encryptedContent } as never);
await service.loadMasterKey(keyId, PASSWORD);

// 2. Reference generates master key → plugin loads it
console.log('[master key: ref gen → plugin load]');
const refMk = await refGenerateMasterKey(PASSWORD);
const refKeyId2 = 'fedcba9876543210fedcba9876543210';
service.feedMasterKey({ id: refKeyId2, type_: 9, content: refMk.encryptedContent, encryption_method: 8 } as never);
await service.loadMasterKey(refKeyId2, PASSWORD);
assert(true, 'plugin loads reference-generated master key');

// 3. Plugin encrypts note → reference decrypts (StringV1, utf16le)
console.log('[note: plugin encrypt → ref decrypt]');
const noteText = 'Hello interop! 跨实现验证 🚀 测试内容 '.repeat(3000); // > 64k → multi-chunk
const pluginCipher = await service.encryptItem(noteText, keyId);
const refPlain = await refDecryptString(mkHex, pluginCipher);
assert(refPlain === noteText, 'reference decrypts plugin-encrypted note (' + refPlain.length + ' chars)');

// 4. Reference encrypts note → plugin decrypts
console.log('[note: ref encrypt → plugin decrypt]');
const refCipher = await refEncryptString(mkHex, noteText);
const pluginPlain = await service.decryptItem({ encryption_applied: 1, encryption_cipher_text: refCipher, type_: 1 } as never);
assert(pluginPlain === noteText, 'plugin decrypts reference-encrypted note');

// 5. Plugin encrypts with ref-loaded key → plugin decrypts
console.log('[note: plugin encrypt with ref key → plugin decrypt]');
const cipherViaRefKey = await service.encryptItem('encrypted with ref-generated master key', refKeyId2);
const plainViaRefKey = await service.decryptItem({ encryption_applied: 1, encryption_cipher_text: cipherViaRefKey, type_: 1 } as never);
assert(plainViaRefKey === 'encrypted with ref-generated master key', 'cross-key roundtrip via ref master key');

// 6. Header structure matches official (JED01 + 000022 + 0a + 32-hex key)
console.log('[header structure]');
assert(pluginCipher.startsWith('JED010000220a' + keyId), 'header = JED01+000022+0a+keyId: ' + pluginCipher.slice(0, 45));
assert(refCipher.startsWith('JED010000220a' + keyId), 'ref header matches plugin header format');

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) process.exit(1);
