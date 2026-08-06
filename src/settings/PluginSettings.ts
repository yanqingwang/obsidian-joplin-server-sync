export type ConflictStrategy = 'duplicate' | 'local-wins' | 'remote-wins';

export interface SyncLogEntry {
  time: number;
  type: string;
  ok: number;
  fail: number;
}

export interface PluginSettings {
  serverUrl: string;
  email: string;
  password: string;
  syncIntervalSec: number;
  syncOnStartup: boolean;
  syncFoldersOnly: boolean;
  conflictStrategy: ConflictStrategy;
  excludePatterns: string[];
  attachmentFolder: string;
  maxAttachmentMB: number;
  clientId: string;
  logLevel: 'error' | 'info' | 'debug';
  syncLog: SyncLogEntry[];
  e2eeEnabled: boolean;
  e2eePassword: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  serverUrl: '',
  email: '',
  password: '',
  syncIntervalSec: 300,
  syncOnStartup: false,
  syncFoldersOnly: false,
  conflictStrategy: 'duplicate',
  excludePatterns: ['.obsidian/', '_conflicts/', 'templates/', '.directory', '.noteforge/'],
  attachmentFolder: 'attachments',
  maxAttachmentMB: 100,
  clientId: '',
  logLevel: 'info',
  syncLog: [],
  e2eeEnabled: false,
  e2eePassword: '',
};