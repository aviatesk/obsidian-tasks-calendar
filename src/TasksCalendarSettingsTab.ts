import { App, PluginSettingTab, Setting } from 'obsidian';
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
    containerEl.createEl('h2', { text: 'Tasks Calendar Settings' });

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
  }
}
