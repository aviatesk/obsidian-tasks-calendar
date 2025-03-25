import { Plugin, WorkspaceLeaf } from 'obsidian';
import { getAPI } from "obsidian-dataview";
import {
  CalendarSettings,
  PluginSettings,
  DEFAULT_PLUGIN_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  HOVER_LINK_SOURCE,
  VIEW_TYPE,
  toCalendarSettings,
  toUserCalendarSettings
} from './TasksCalendarSettings';
import { TasksCalendarItemView } from './TasksCalendarItemView';
import { SettingTab } from './TasksCalendarSettingsTab';

export default class TasksCalendarPlugin extends Plugin {
  private _settings: PluginSettings;
  dataviewApi = getAPI();
  _onChangeCallback = () => {};

  async onload() {
    await this.loadSettings();

    // for first time users, save the default settings
    await this.saveSettings();

    const dataviewApi = this.dataviewApi
    if (dataviewApi) {
      const oldOnChange = dataviewApi.index.onChange;
      dataviewApi.index.onChange = () => {
        oldOnChange();
        this._onChangeCallback();
      }
    }

    // Register view with plugin instance
    this.registerView(
      VIEW_TYPE,
      (leaf) => new TasksCalendarItemView(leaf, this)
    );

    // Add ribbon icon with a better calendar icon
    this.addRibbonIcon("lucide-calendar-check", "Tasks Calendar", () => {
      this.activateView();
    });

    // Add command to open calendar
    this.addCommand({
      id: 'open',
      name: 'Open Tasks Calendar',
      callback: () => this.activateView()
    });

    // Add settings tab
    this.addSettingTab(new SettingTab(this.app, this));

    // Add workspace event listeners to track calendar view position
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        setTimeout(() => {
          if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length > 0) {
            const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0].view;
            if (view instanceof TasksCalendarItemView && view.calendar) {
              view.calendar.updateSize();
            }
          }
        }, 100);
      })
    );

    this.registerHoverLinkSource(HOVER_LINK_SOURCE, {
      defaultMod: true,
      display: "Tasks Calendar",
    })

    setTimeout(() => this.activateView(), 300);
  }

  onunload() {
    this._onChangeCallback = () => {};
  }

  private async loadSettings() {
    let loaded: PluginSettings = await this.loadData();
    if (!loaded)
      loaded = DEFAULT_PLUGIN_SETTINGS;
    this._settings = loaded;
  }

  async saveSettings() {
    const calendars = this._settings.calendars.map(toUserCalendarSettings);
    await this.saveData({
      activeCalendar: this._settings.activeCalendar,
      calendars
    });
  }

  // Accessor methods for plugin settings
  getActiveCalendarId(): string {
    return this._settings.activeCalendar;
  }

  async setActiveCalendarId(id: string): Promise<void> {
    this._settings.activeCalendar = id;
    await this.saveSettings();
  }

  getCalendarsList(): { id: string, name: string }[] {
    return this._settings.calendars.map(cal => ({
      id: cal.id,
      name: cal.name
    }));
  }

  async addCalendar(settings: CalendarSettings): Promise<void> {
    this._settings.calendars.push(settings);
    await this.saveSettings();
  }

  async deleteCalendar(id: string): Promise<void> {
    const index = this._settings.calendars.findIndex(c => c.id === id);
    if (index > -1) {
      this._settings.calendars.splice(index, 1);
    }

    if (this._settings.activeCalendar === id) {
      this._settings.activeCalendar = DEFAULT_PLUGIN_SETTINGS.activeCalendar;
    }

    await this.saveSettings();
  }

  async getCalendarSettings({
    id = this._settings.activeCalendar,
    reload = false
  } = {}): Promise<CalendarSettings> {
    if (reload) {
      await this.loadSettings();
    }

    const userSettings = this._settings.calendars.find(c => c.id === id);
    if (!userSettings) {
      return DEFAULT_CALENDAR_SETTINGS;
    }

    // Convert from UserCalendarSettings to CalendarSettings
    return toCalendarSettings(userSettings);
  }

  async saveCalendarSettings(settings: CalendarSettings): Promise<void> {
    const index = this._settings.calendars.findIndex(c => c.id === settings.id);
    if (index > -1) {
      this._settings.calendars[index] = settings;
    } else {
      this._settings.calendars.push(settings);
    }
    await this.saveSettings();
  }

  async activateView() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);

    let leaf: WorkspaceLeaf | null = null;

    if (leaves.length > 0) {
      // View already exists, show it
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE,
          active: true
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
