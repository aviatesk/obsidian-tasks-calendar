import { Plugin, WorkspaceLeaf } from 'obsidian';
import { getAPI } from "obsidian-dataview";
import { CalendarSettings, PluginSettings, DEFAULT_PLUGIN_SETTINGS, DEFAULT_CALENDAR_SETTINGS, HOVER_LINK_SOURCE, VIEW_TYPE } from './TasksCalendarSettings';
import { TasksCalendarItemView } from './TasksCalendarItemView';
import { SettingTab } from './TasksCalendarSettingsTab';

// メインのプラグインクラス
export default class TasksCalendarPlugin extends Plugin {
  settings: PluginSettings;
  dataviewApi = getAPI();
  _onChangeCallback = () => {};

  async onload() {
    await this.loadSettings();

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
      id: 'open-tasks-calendar',
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

    // プラグイン起動時に自動的にビューを開く
    setTimeout(() => this.activateView(), 300);
  }

  onunload() {
    this._onChangeCallback = () => {};
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, await this.loadData());

    if (!this.settings.activeCalendar) {
      this.settings.activeCalendar = DEFAULT_PLUGIN_SETTINGS.activeCalendar;
    }

    // 各カレンダー設定のデフォルト値を確実に設定
    this.settings.calendars = this.settings.calendars.map(cal => {
      return {
        id: cal.id,
        name: cal.name,
        viewType: cal.viewType || DEFAULT_CALENDAR_SETTINGS.viewType,
        query: cal.query || DEFAULT_CALENDAR_SETTINGS.query,
        dateProperty: cal.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty,
        startDateProperty: cal.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty,
        includedStatuses: cal.includedStatuses || DEFAULT_CALENDAR_SETTINGS.includedStatuses,
        includedTags: cal.includedTags || DEFAULT_CALENDAR_SETTINGS.includedTags,
      };
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // 指定IDのカレンダー設定を取得
  getCalendarSettings(id: string): CalendarSettings {
    const calendar = this.settings.calendars.find(c => c.id === id);

    // カレンダーが見つからない場合はデフォルトを使用
    if (!calendar) {
      return { ...DEFAULT_CALENDAR_SETTINGS };
    }

    // 設定が不足している場合、デフォルト値で補完
    const result: CalendarSettings = {
      id: calendar.id,
      name: calendar.name,
      viewType: calendar.viewType || DEFAULT_CALENDAR_SETTINGS.viewType,
      query: calendar.query || DEFAULT_CALENDAR_SETTINGS.query,
      dateProperty: calendar.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty,
      startDateProperty: calendar.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty,
      includedStatuses: calendar.includedStatuses || DEFAULT_CALENDAR_SETTINGS.includedStatuses,
      includedTags: calendar.includedTags || DEFAULT_CALENDAR_SETTINGS.includedTags,
    };

    return result;
  }

  // カレンダー設定を保存
  saveCalendarSettings(settings: CalendarSettings) {
    const index = this.settings.calendars.findIndex(c => c.id === settings.id);
    if (index > -1) {
      this.settings.calendars[index] = settings;
    } else {
      this.settings.calendars.push(settings);
    }
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
