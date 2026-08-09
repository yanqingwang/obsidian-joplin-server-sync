import { Plugin, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SyncLogEntry } from './settings/PluginSettings';
import { JoplinSyncSettingTab } from './settings/SettingsTab';
import { JoplinServerApi } from './api/JoplinServerApi';
import { MappingStore } from './mapping/MappingStore';
import { SyncEngine } from './core/SyncEngine';
import { StatusBar } from './ui/StatusBar';
import { EncryptionService } from './e2ee/EncryptionService';
import { ChangeLogStore } from './core/ChangeLogStore';
import { FileIdentity } from './core/FileIdentity';

export default class JoplinSyncPlugin extends Plugin {
  settings!: PluginSettings;
  api!: JoplinServerApi;
  mapping!: MappingStore;
  engine!: SyncEngine;
  statusBar!: StatusBar;
  e2ee!: EncryptionService;
  changeLog!: ChangeLogStore;
  identity!: FileIdentity;
  private initialized = false;

  async onload() {
    await this.loadSettings();

    this.api = new JoplinServerApi(() => ({
      baseUrl: this.settings.serverUrl,
      email: this.settings.email,
      password: this.settings.password,
    }));

    this.mapping = new MappingStore(this);
    await this.mapping.load();

    this.changeLog = new ChangeLogStore(this);
    await this.changeLog.load();

    this.statusBar = new StatusBar(this.addStatusBarItem());
    this.e2ee = new EncryptionService();
    this.identity = new FileIdentity(this);
    this.engine = new SyncEngine(this);

    this.addSettingTab(new JoplinSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'joplin-upload-all',
      name: 'Upload vault to Joplin Server',
      callback: () => this.engine.runFullUpload(),
    });

    this.addCommand({
      id: 'joplin-sync-now',
      name: 'Sync now',
      callback: () => this.engine.syncCycle(),
    });

    this.addCommand({
      id: 'joplin-force-push',
      name: 'Force push to server (overwrite remote)',
      callback: () => this.engine.forcePush(),
    });

    this.addCommand({
      id: 'joplin-force-pull',
      name: 'Force pull from server (overwrite local)',
      callback: () => this.engine.forcePull(),
    });

    this.addCommand({
      id: 'joplin-test-connection',
      name: 'Test Joplin Server connection',
      callback: async () => {
        try {
          await this.api.login(true);
          new Notice('Joplin Server: connection OK');
        } catch (e: unknown) {
          new Notice('Connection failed: ' + (e instanceof Error ? e.message : String(e)));
        }
      },
    });

    this.addCommand({
      id: 'joplin-show-about',
      name: 'About / Status',
      callback: () => {
        const total = this.mapping.all().length;
        new Notice('v0.2.1\nMapped items: ' + total + '\nDelta cursor: ' + (this.mapping.getDeltaCursor() ? 'yes' : 'no'));
      },
    });

    // Phase 2: start watcher + scheduler after init.
    // Defer to onLayoutReady: Obsidian fires `create` for every file while
    // loading the vault, so registering in onload would flood the changelog
    // with a full-vault create storm on every startup (B21).
    if (this.settings.serverUrl) {
      this.app.workspace.onLayoutReady(() => {
        this.engine.startWatching();
        this.engine.startScheduler();
      });
    }
  }

  onunload(): void {
    void this.engine?.shutdown();
    void this.mapping?.flush();
  }

  async loadSettings(): Promise<void> {
    const data: Record<string, unknown> | null = await this.loadData() as Record<string, unknown> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    // Deep-copy array fields: if data.json lacks syncLog, the shallow assign
    // leaves settings.syncLog sharing DEFAULT_SETTINGS.syncLog's array, and
    // logSync()'s unshift would pollute the default object (B33).
    this.settings.syncLog = [...((data?.syncLog as SyncLogEntry[] | undefined) ?? [])];
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  logSync(type: string, ok: number, fail: number, detail?: { created: number; updated: number; deleted: number }): void {
    this.settings.syncLog.unshift({ time: Date.now(), type, ok, fail, ...detail });
    if (this.settings.syncLog.length > 5) this.settings.syncLog.length = 5;
    void this.saveSettings();
  }
}