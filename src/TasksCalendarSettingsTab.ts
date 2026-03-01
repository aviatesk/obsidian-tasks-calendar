import { App, PluginSettingTab, Setting } from 'obsidian';
import type { LogLevel } from './TasksCalendarSettings';
import TasksCalendarPlugin from './main';

export class SettingTab extends PluginSettingTab {
  plugin: TasksCalendarPlugin;

  constructor(app: App, plugin: TasksCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Auto-open on startup')
      .setDesc(
        'Automatically open the Tasks Calendar view when Obsidian starts'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.configManager.get('autoOpenOnStartup'))
          .onChange(async value => {
            await this.plugin.configManager.set('autoOpenOnStartup', value);
          })
      );

    new Setting(containerEl).setName('Advanced').setHeading();

    new Setting(containerEl)
      .setName('Log level')
      .setDesc('Controls which messages appear in the developer console')
      .addDropdown(dropdown =>
        dropdown
          .addOptions({
            error: 'Error',
            warn: 'Warning',
            log: 'All',
          })
          .setValue(this.plugin.configManager.get('logLevel'))
          .onChange(async value => {
            await this.plugin.configManager.set('logLevel', value as LogLevel);
          })
      );
  }
}
