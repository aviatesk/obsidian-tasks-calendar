import { App, PluginSettingTab } from 'obsidian';
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
  }
}
