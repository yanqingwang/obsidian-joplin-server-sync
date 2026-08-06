import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type JoplinSyncPlugin from '../main';

export class JoplinSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: JoplinSyncPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): import('obsidian').SettingDefinitionItem[] {
    // TODO: convert to declarative settings
    return [];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Joplin Server').setHeading();

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('e.g. https://joplin.example.com (without /api)')
      .addText(t => t
        .setPlaceholder('https://joplin.example.com')
        .setValue(this.plugin.settings.serverUrl)
        .onChange(async v => {
          this.plugin.settings.serverUrl = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Email')
      .addText(t => t
        .setValue(this.plugin.settings.email)
        .onChange(async v => {
          this.plugin.settings.email = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Password')
      .setDesc('Warning: stored in plaintext in plugin data.json')
      .addText(t => {
        t.inputEl.type = 'password';
        t.setValue(this.plugin.settings.password)
          .onChange(async v => {
            this.plugin.settings.password = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Test connection')
      .addButton(b => b
        .setButtonText('Test connection')
        .setCta()
        .onClick(async () => {
          b.setDisabled(true).setButtonText('Testing\u2026');
          try {
            await this.plugin.api.login();
            new Notice('\u2705 Connection OK');
          } catch (e: unknown) {
            new Notice('\u274c Connection failed: ' + (e instanceof Error ? e.message : String(e)), 8000);
          } finally {
            b.setDisabled(false).setButtonText('Test connection');
          }
        }));

    new Setting(containerEl).setName('Sync behavior').setHeading();

    new Setting(containerEl)
      .setName('Auto sync interval')
      .setDesc('Seconds. 0 = manual only (min 60)')
      .addText(t => t
        .setValue(String(this.plugin.settings.syncIntervalSec))
        .onChange(async v => {
          const n = parseInt(v);
          if (!isNaN(n) && n >= 0) {
            this.plugin.settings.syncIntervalSec = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Sync on startup')
      .addToggle(t => t
        .setValue(this.plugin.settings.syncOnStartup)
        .onChange(async v => {
          this.plugin.settings.syncOnStartup = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Conflict strategy')
      .addDropdown(d => d
        .addOption('duplicate', 'Duplicate')
        .addOption('local-wins', 'Local wins')
        .addOption('remote-wins', 'Remote wins')
        .setValue(this.plugin.settings.conflictStrategy)
        .onChange(async v => {
          this.plugin.settings.conflictStrategy = v as typeof this.plugin.settings.conflictStrategy;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl).setName('Scope').setHeading();

    new Setting(containerEl)
      .setName('Sync folders only')
      .setDesc('When enabled, only sync folder structure (no note files). Useful for testing.')
      .addToggle(t => t
        .setValue(this.plugin.settings.syncFoldersOnly)
        .onChange(async v => {
          this.plugin.settings.syncFoldersOnly = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Exclude patterns')
      .setDesc('Comma-separated path prefixes to exclude')
      .addText(t => t
        .setValue(this.plugin.settings.excludePatterns.join(', '))
        .onChange(async v => {
          this.plugin.settings.excludePatterns = v.split(',').map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));

    // E2EE section
    new Setting(containerEl).setName('End-to-end encryption').setHeading();

    new Setting(containerEl)
      .setName('Enable E2EE')
      .setDesc('Encrypt notes and attachments before uploading to the server. Requires a password.')
      .addToggle(t => t
        .setValue(this.plugin.settings.e2eeEnabled)
        .onChange(async v => {
          this.plugin.settings.e2eeEnabled = v;
          await this.plugin.saveSettings();
          this.display();
        }));

    const e2eeStatus = this.plugin.e2ee.hasLoadedKeys
      ? 'Keys loaded (' + this.plugin.e2ee.availableMasterKeys.length + ' master key(s))'
      : 'No keys loaded';
    new Setting(containerEl)
      .setName('Status')
      .setDesc(e2eeStatus);

    const e2eeOn = this.plugin.settings.e2eeEnabled;
    new Setting(containerEl)
      .setName('E2EE password')
      .setDesc(e2eeOn ? 'Enter your Joplin E2EE password to encrypt/decrypt items' : 'Enable E2EE first to set the password')
      .addText(t => {
        t.inputEl.type = 'password';
        t.setPlaceholder('E2EE password');
        t.setDisabled(!e2eeOn);
        t.setValue(this.plugin.settings.e2eePassword)
          .onChange(async v => {
            this.plugin.settings.e2eePassword = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Load E2EE keys')
      .addButton(b => b
        .setButtonText('Load keys')
        .setCta()
        .setDisabled(!e2eeOn)
        .onClick(async () => {
          b.setDisabled(true).setButtonText('Loading\u2026');
          try {
            const pw = this.plugin.settings.e2eePassword;
            if (!pw) { new Notice('Enter E2EE password first'); b.setDisabled(false).setButtonText('Load keys'); return; }
            const mks = this.plugin.e2ee.availableMasterKeys;
            if (mks.length === 0) { new Notice('No master key items found. Run a sync cycle first.'); b.setDisabled(false).setButtonText('Load keys'); return; }
            for (const mkId of mks) {
              await this.plugin.e2ee.loadMasterKey(mkId, pw);
            }
            new Notice('Loaded ' + mks.length + ' master key(s)');
          } catch (e: unknown) {
            new Notice('E2EE key load failed: ' + (e instanceof Error ? e.message : String(e)), 8000);
          } finally {
            b.setDisabled(false).setButtonText('Load keys');
            this.display();
          }
        }));

    // Sync log
    new Setting(containerEl).setName('Sync history').setHeading();
    const log = this.plugin.settings.syncLog;
    if (log.length === 0) {
      containerEl.createEl('p', { text: 'No sync history yet.' });
    } else {
      const tbl = containerEl.createEl('table');
      const thead = tbl.createEl('thead');
      const hr = thead.createEl('tr');
      hr.createEl('th', { text: 'Time' });
      hr.createEl('th', { text: 'Type' });
      hr.createEl('th', { text: 'OK' });
      hr.createEl('th', { text: 'Fail' });
      const tbody = tbl.createEl('tbody');
      for (const e of log) {
        const tr = tbody.createEl('tr');
        tr.createEl('td', { text: new Date(e.time).toLocaleTimeString() });
        tr.createEl('td', { text: e.type });
        tr.createEl('td', { text: String(e.ok) });
        tr.createEl('td', { text: String(e.fail) });
      }
    }
  }
}