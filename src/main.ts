import { Plugin, WorkspaceLeaf } from 'obsidian';
import type { DataviewApi } from 'obsidian-dataview';
import {
  HOVER_LINK_SOURCE,
  VIEW_TYPE,
  AUTO_OPEN_DELAY,
} from './TasksCalendarSettings';
import { TasksCalendarItemView } from './TasksCalendarItemView';
import { SettingTab } from './TasksCalendarSettingsTab';
import { TaskPropertySuggest } from './editor/TaskPropertySuggest';
import { createDatePropertyExtension } from './editor/DatePropertyDecoration';
import { createDatePropertyPostProcessor } from './editor/DatePropertyPostProcessor';
import { createLogger, setLogLevel } from './logging';
import { ConfigManager } from './ConfigManager';

function getDataviewApi(app: Plugin['app']): DataviewApi | undefined {
  const plugins = (app as unknown as Record<string, unknown>).plugins as
    | Record<string, unknown>
    | undefined;
  const inner = plugins?.plugins as
    | Record<string, { api?: DataviewApi }>
    | undefined;
  return inner?.dataview?.api;
}

export default class TasksCalendarPlugin extends Plugin {
  private readonly logger = createLogger('Plugin');
  configManager!: ConfigManager;
  dataviewApi?: DataviewApi;
  private originalOnChange?: () => void;
  _onChangeCallback = () => {};

  async onload() {
    this.logger.log('Loading plugin');
    this.configManager = await ConfigManager.initialize(
      () => this.loadData(),
      data => this.saveData(data)
    );

    setLogLevel(this.configManager.get('logLevel'));
    this.configManager.subscribe('logLevel', (_key, value) =>
      setLogLevel(value)
    );

    this.dataviewApi = getDataviewApi(this.app);
    const dataviewApi = this.dataviewApi;
    if (dataviewApi) {
      this.originalOnChange = dataviewApi.index.onChange;
      const originalOnChange = this.originalOnChange;
      dataviewApi.index.onChange = () => {
        originalOnChange();
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

    this.registerEditorExtension(
      createDatePropertyExtension(this.app, this.configManager)
    );
    this.registerMarkdownPostProcessor(
      createDatePropertyPostProcessor(this.app, this.configManager)
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
    if (this.dataviewApi && this.originalOnChange) {
      this.dataviewApi.index.onChange = this.originalOnChange;
    }
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
