import { Plugin, WorkspaceLeaf } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import {
  HOVER_LINK_SOURCE,
  VIEW_TYPE,
  AUTO_OPEN_DELAY,
} from './TasksCalendarSettings';
import { TasksCalendarItemView } from './TasksCalendarItemView';
import { SettingTab } from './TasksCalendarSettingsTab';
import { TaskPropertySuggest } from './editor/TaskPropertySuggest';
import { createLogger } from './logging';
import { ConfigManager } from './ConfigManager';

export default class TasksCalendarPlugin extends Plugin {
  private readonly logger = createLogger('Plugin');
  configManager!: ConfigManager;
  dataviewApi = getAPI();
  _onChangeCallback = () => {};

  async onload() {
    this.logger.log('Loading plugin');
    this.configManager = await ConfigManager.initialize(
      () => this.loadData(),
      data => this.saveData(data)
    );

    const dataviewApi = this.dataviewApi;
    if (dataviewApi) {
      const oldOnChange = dataviewApi.index.onChange;
      dataviewApi.index.onChange = () => {
        oldOnChange();
        this._onChangeCallback();
      };
    } else {
      this.logger.warn('Dataview API not available');
    }

    this.registerView(VIEW_TYPE, leaf => new TasksCalendarItemView(leaf, this));

    this.addCommand({
      id: 'open',
      name: 'Open Tasks Calendar',
      callback: () => this.activateView(),
    });

    this.addSettingTab(new SettingTab(this.app, this));

    this.registerHoverLinkSource(HOVER_LINK_SOURCE, {
      defaultMod: true,
      display: 'Tasks Calendar',
    });

    this.registerEditorSuggest(
      new TaskPropertySuggest(this.app, this.configManager)
    );

    this.app.workspace.onLayoutReady(() => {
      this.addRibbonIcon('lucide-calendar-check', 'Tasks Calendar', () => {
        this.activateView();
      });

      this.registerEvent(
        this.app.workspace.on('layout-change', () => {
          setTimeout(() => {
            if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length > 0) {
              const view =
                this.app.workspace.getLeavesOfType(VIEW_TYPE)[0].view;
              if (view instanceof TasksCalendarItemView && view.calendar) {
                view.calendar.updateSize();
              }
            }
          }, 100);
        })
      );

      if (this.configManager.get('autoOpenOnStartup')) {
        setTimeout(() => this.activateView(), AUTO_OPEN_DELAY);
      }
    });
  }

  onunload() {
    this.logger.log('Unloading plugin');
    this._onChangeCallback = () => {};
  }

  private async activateView() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);
    let leaf: WorkspaceLeaf | null = null;
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE,
          active: true,
        });
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
