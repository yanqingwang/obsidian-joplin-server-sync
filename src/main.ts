import { Plugin, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './settings/PluginSettings';
import { JoplinSyncSettingTab } from './settings/SettingsTab';
import { JoplinServerApi } from './api/JoplinServerApi';
import { MappingStore } from './mapping/MappingStore';
import { SyncEngine } from './core/SyncEngine';
import { StatusBar } from './ui/StatusBar';

export default class JoplinSyncPlugin extends Plugin {
  settings!: PluginSettings;
  api!: JoplinServerApi;
  mapping!: MappingStore;
  engine!: SyncEngine;
  statusBar!: StatusBar;

  async onload() {
    await this.loadSettings();

    this.api = new JoplinServerApi(() => ({
      baseUrl: this.settings.serverUrl,
      email: this.settings.email,
      password: this.settings.password,
    }));

    this.mapping = new MappingStore(this);
    await this.mapping.load();

    this.statusBar = new StatusBar(this.addStatusBarItem());
    this.engine = new SyncEngine(this);

    this.addSettingTab(new JoplinSyncSettingTab(this.app, this));

    this.addCommand({
      id: 'joplin-upload-all',
      name: 'Upload vault to Joplin Server',
      callback: () => this.engine.runFullUpload(),
    });

    this.addCommand({
      id: 'joplin-test-connection',
      name: 'Test Joplin Server connection',
      callback: async () => {
        try {
          await this.api.login();
          new Notice('Joplin Server: connection OK');
        } catch (e: any) {
          new Notice('Connection failed: ' + e.message);
        }
      },
    });

    this.addCommand({
      id: 'joplin-show-about',
      name: 'Joplin Server Sync: About / Status',
      callback: () => {
        const total = this.mapping.all().length;
        new Notice('Joplin Server Sync v0.1.0\nMapped items: ' + total + '\nDelta cursor: ' + (this.mapping.getDeltaCursor() ? 'yes' : 'no'));
      },
    });
  }

  async onunload() {
    await this.engine?.shutdown();
    await this.mapping?.flush();
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}