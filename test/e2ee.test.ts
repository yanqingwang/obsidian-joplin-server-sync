// E2EE protocol verification test — mirrors official Joplin test vectors.
// Run: npx esbuild test/e2ee.test.ts --bundle --platform=node --format=esm --outfile=test/e2ee-out.mjs && node test/e2ee-out.mjs
import { EncryptionService, EncryptionMethod } from '../src/e2ee/EncryptionService';
// Node 18+ exposes globalThis.crypto (WebCrypto) natively — no shim needed.

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

async function assertThrows(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try { await fn(); failed++; console.error('  ✗ FAIL (expected throw): ' + msg); }
  catch { passed++; console.log('  ✓ ' + msg); }
}

function randomString(len: number): string {
  let s = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789中文测试🐶🐱';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const service = new EncryptionService();
const masterKeyId = '01234568abcdefgh01234568abcdefgh';
const PASSWORD = '123456';

console.log('\n=== E2EE Protocol Verification ===\n');

// ---- Master key generation ----
console.log('[master key]');
const mk = await service.generateMasterKey(PASSWORD, masterKeyId);
assert(mk.id === masterKeyId, 'master key id preserved');
assert(mk.encryptionMethod === EncryptionMethod.KeyV1, 'master key method = KeyV1(8), got ' + mk.encryptionMethod);
assert(!!mk.encryptedContent, 'master key has encrypted content');
const mkJson = JSON.parse(mk.encryptedContent) as Record<string, string>;
assert(mkJson.salt && mkJson.iv && mkJson.ct, 'master key content = JSON {salt, iv, ct}');

// ---- Wrong password rejected ----
console.log('[master key load]');
service.feedMasterKey({ id: masterKeyId, type_: 9, content: mk.encryptedContent } as never);
await assertThrows(() => service.loadMasterKey(masterKeyId, 'wrongpassword'), 'wrong password throws');

// ---- Correct password loads ----
await service.loadMasterKey(masterKeyId, PASSWORD);
assert(service.hasLoadedKeys, 'master key loaded');
assert(service.activeKeyId === masterKeyId, 'active master key set');
assert(service.availableMasterKeys.includes(masterKeyId), 'master key listed');

// ---- StringV1 roundtrip (single chunk) ----
console.log('[StringV1]');
const plain1 = 'some secret';
const cipher1 = await service.encryptItem(plain1, masterKeyId);
assert(cipher1.startsWith('JED01'), 'cipher text starts with JED01 header: ' + cipher1.slice(0, 12));
assert(cipher1.length > 45, 'cipher text has header + chunk');
const dec1 = await service.decryptItem({ encryption_applied: 1, encryption_cipher_text: cipher1, type_: 1 } as never);
assert(dec1 === plain1, 'single-chunk roundtrip');

// ---- Header decode: method + masterKeyId ----
console.log('[header]');
const headerHex = cipher1.slice(0, 5 + 6 + 34);
const mdSize = parseInt(headerHex.slice(5, 11), 16);
const md = headerHex.slice(11, 11 + mdSize);
const methodHex = md.slice(0, 2);
const keyFromHeader = md.slice(2);
assert(parseInt(methodHex, 16) === EncryptionMethod.StringV1, 'header method = StringV1(10), got ' + parseInt(methodHex, 16));
assert(keyFromHeader === masterKeyId, 'header master key ID matches');

// ---- Multi-chunk roundtrip (long string > 64k) ----
const longPlain = randomString(65536 * 2 + 100);
const longCipher = await service.encryptItem(longPlain, masterKeyId);
const longDec = await service.decryptItem({ encryption_applied: 1, encryption_cipher_text: longCipher, type_: 1 } as never);
assert(longDec === longPlain, 'multi-chunk (2×64k+100) roundtrip');
assert(longCipher.length > 65536 * 2, 'multi-chunk produces >128k cipher text');

// ---- Tamper detection ----
console.log('[integrity]');
const tampered = cipher1.slice(0, -10) + 'ABCDEFGHIJ';
await assertThrows(
  () => service.decryptItem({ encryption_applied: 1, encryption_cipher_text: tampered, type_: 1 } as never),
  'tampered cipher text fails decryption (GCM auth)',
);

// ---- Invalid header ----
await assertThrows(
  () => service.decryptItem({ encryption_applied: 1, encryption_cipher_text: 'garbage-not-jed', type_: 1 } as never),
  'non-JED01 cipher text rejected',
);

// ---- FileV1 (resources) roundtrip ----
console.log('[FileV1]');
const blobBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 255, 254, 253]);
const blobCipher = await service.encryptBlob(blobBytes.buffer as ArrayBuffer, masterKeyId);
assert(blobCipher.startsWith('JED01'), 'blob cipher starts with JED01');
const blobDec = await service.decryptBlob(blobCipher);
const roundtrip = new Uint8Array(blobDec);
assert(roundtrip.length === blobBytes.length && roundtrip.every((v, i) => v === blobBytes[i]), 'blob roundtrip byte-identical');

// ---- FileV1 ArrayBuffer path (used by ResourceManager) ----
console.log('[FileV1 blob data path]');
const encData = await service.encryptBlobData(blobBytes.buffer as ArrayBuffer, masterKeyId);
const decData = await service.decryptBlobData(encData);
const roundtrip2 = new Uint8Array(decData);
assert(roundtrip2.every((v, i) => v === blobBytes[i]), 'blob-data path roundtrip');

// ---- Large blob (multi-chunk, > 128k) ----
const bigBlob = new Uint8Array(131072 * 2 + 500);
for (let i = 0; i < bigBlob.length; i++) bigBlob[i] = i % 251;
const bigCipher = await service.encryptBlob(bigBlob.buffer as ArrayBuffer, masterKeyId);
const bigDec = await service.decryptBlob(bigCipher);
const bigRt = new Uint8Array(bigDec);
assert(bigRt.length === bigBlob.length && bigRt.every((v, i) => v === bigBlob[i]), 'large blob (2×128k+500) roundtrip');

// ---- Unicode surrogate pairs (utf16le) ----
console.log('[unicode]');
const emoji = '🐶🐶🐶'; // 3 full surrogate pairs
const emojiCipher = await service.encryptItem(emoji, masterKeyId);
const emojiDec = await service.decryptItem({ encryption_applied: 1, encryption_cipher_text: emojiCipher, type_: 1 } as never);
assert(emojiDec === emoji, 'emoji (surrogate pairs) roundtrip: ' + JSON.stringify(emojiDec));

// ---- Unloaded key fails ----
console.log('[key mgmt]');
await assertThrows(
  () => service.encryptItem('x', '01234568abcdefgh01234568abceffff'),
  'unloaded master key id fails to encrypt',
);

// ---- Invalid encryption method rejection ----
console.log('[method guards]');
const sjclCipher = cipher1.slice(0, 11).replace(/(.{5})(.{2})/, '$10a') + cipher1.slice(11);
void sjclCipher;
// Craft a FileV1 header but call decryptItem (should reject)
const fakeFileHeader = 'JED01' + (34).toString(16).padStart(6, '0') + (9).toString(16).padStart(2, '0') + masterKeyId;
await assertThrows(
  () => service.decryptItem({ encryption_applied: 1, encryption_cipher_text: fakeFileHeader + '00000100', type_: 1 } as never),
  'decryptItem rejects FileV1 method',
);

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) process.exit(1);
