import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type JoplinSyncPlugin from '../main';

export class JoplinSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: JoplinSyncPlugin) {
    super(app, plugin);
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
          } catch (e: any) {
            new Notice('\u274c Connection failed: ' + e.message, 8000);
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
      .setName('Exclude patterns')
      .setDesc('Comma-separated path prefixes to exclude')
      .addText(t => t
        .setValue(this.plugin.settings.excludePatterns.join(', '))
        .onChange(async v => {
          this.plugin.settings.excludePatterns = v.split(',').map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        }));
  }
}