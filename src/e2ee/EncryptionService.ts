import { JoplinItem } from '../api/models';

export enum EncryptionMethod {
  SJCL1a = 4,
  KeyV1 = 7,
  FileV1 = 8,
  StringV1 = 9,
}

interface MasterKey {
  id: string;
  encryption_method: number;
  checksum: string;
  content: string;
}

export class EncryptionService {
  private loadedKeys = new Map<string, CryptoKey>();

  async loadMasterKey(mk: MasterKey, password: string): Promise<void> {
    if (!password) throw new Error('Password required to load master key');
    // Phase 4: implement PBKDF2 derivation + AES-GCM unwrap
    console.debug('[joplin-sync] E2EE master key loading not yet implemented');
    throw new Error('E2EE not yet implemented');
  }

  isEncrypted(item: JoplinItem): boolean { return item.encryption_applied === 1; }

  async decryptItem(item: JoplinItem): Promise<string> {
    if (!this.isEncrypted(item)) return '';
    // Phase 4: parse encryption_cipher_text header → decrypt chunks
    throw new Error('E2EE decrypt not yet implemented');
  }

  async encryptItem(serialized: string, masterKeyId: string): Promise<string> {
    throw new Error('E2EE encrypt not yet implemented');
  }
}

export class MasterKeyNotLoadedError extends Error {
  constructor(masterKeyId: string) {
    super('Master key ' + masterKeyId + ' not loaded — password required');
  }
}