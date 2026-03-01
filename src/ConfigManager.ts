import type {
  PluginSettings,
  CalendarSettings,
  UserCalendarSettings,
} from './TasksCalendarSettings';
import {
  DEFAULT_PLUGIN_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  toCalendarSettings,
  toUserCalendarSettings,
} from './TasksCalendarSettings';
import { createLogger, type Logger } from './logging';

export type ConfigChangeListener<K extends keyof PluginSettings> = (
  key: K,
  value: PluginSettings[K],
  oldValue: PluginSettings[K]
) => void;

export class ConfigManager {
  private readonly logger: Logger = createLogger('ConfigManager');
  private settings: PluginSettings;
  private saveCallback: (settings: PluginSettings) => Promise<void>;
  private changeListeners: Map<string, Set<ConfigChangeListener<any>>> =
    new Map();

  private constructor(
    initialSettings: PluginSettings,
    saveCallback: (settings: PluginSettings) => Promise<void>
  ) {
    this.settings = { ...initialSettings };
    this.saveCallback = saveCallback;
  }

  static async initialize(
    loadData: () => Promise<any>,
    saveData: (data: any) => Promise<void>
  ): Promise<ConfigManager> {
    const loadedData = await loadData();
    const settings = ConfigManager.migrateSettings(loadedData);
    const saveCallback = async (settings: PluginSettings) => {
      const dataToSave = {
        activeCalendar: settings.activeCalendar,
        calendars: settings.calendars.map(toUserCalendarSettings),
        autoOpenOnStartup: settings.autoOpenOnStartup,
        logLevel: settings.logLevel,
      };
      await saveData(dataToSave);
    };
    return new ConfigManager(settings, saveCallback);
  }

  private static migrateSettings(loadedData: any | undefined): PluginSettings {
    if (!loadedData) {
      return { ...DEFAULT_PLUGIN_SETTINGS };
    }

    const settings: PluginSettings = {
      activeCalendar:
        loadedData.activeCalendar ?? DEFAULT_PLUGIN_SETTINGS.activeCalendar,
      calendars: loadedData.calendars
        ? loadedData.calendars.map((cal: UserCalendarSettings) =>
            toCalendarSettings(cal)
          )
        : DEFAULT_PLUGIN_SETTINGS.calendars,
      autoOpenOnStartup:
        loadedData.autoOpenOnStartup ??
        DEFAULT_PLUGIN_SETTINGS.autoOpenOnStartup,
      logLevel: loadedData.logLevel ?? DEFAULT_PLUGIN_SETTINGS.logLevel,
    };

    return settings;
  }

  get<K extends keyof PluginSettings>(key: K): PluginSettings[K] {
    return this.settings[key];
  }

  async set<K extends keyof PluginSettings>(
    key: K,
    value: PluginSettings[K]
  ): Promise<void> {
    const oldValue = this.settings[key];

    if (oldValue === value) {
      return;
    }

    this.settings[key] = value;
    this.notifyListeners(key, value, oldValue);
    await this.save();
  }

  async update(changes: Partial<PluginSettings>): Promise<void> {
    const oldValues: Partial<PluginSettings> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(changes)) {
      const k = key as keyof PluginSettings;
      if (this.settings[k] !== value) {
        (oldValues as any)[k] = this.settings[k];
        (this.settings as any)[k] = value;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return;
    }

    for (const [key, value] of Object.entries(changes)) {
      const k = key as keyof PluginSettings;
      if (oldValues[k] !== undefined) {
        this.notifyListeners(k, value, oldValues[k]);
      }
    }

    await this.save();
  }

  subscribe<K extends keyof PluginSettings>(
    key: K,
    listener: ConfigChangeListener<K>
  ): () => void {
    const keyStr = String(key);
    if (!this.changeListeners.has(keyStr)) {
      this.changeListeners.set(keyStr, new Set());
    }
    this.changeListeners.get(keyStr)!.add(listener);

    return () => {
      const listeners = this.changeListeners.get(keyStr);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.changeListeners.delete(keyStr);
        }
      }
    };
  }

  private notifyListeners<K extends keyof PluginSettings>(
    key: K,
    value: PluginSettings[K],
    oldValue: PluginSettings[K]
  ): void {
    const listeners = this.changeListeners.get(String(key));
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(key, value, oldValue);
        } catch (err) {
          this.logger.error(
            `Error in config listener for ${String(key)}: ${err}`
          );
        }
      });
    }
  }

  private async save(): Promise<void> {
    await this.saveCallback(this.settings);
  }

  async setActiveCalendarId(id: string): Promise<void> {
    await this.set('activeCalendar', id);
  }

  getCalendarsList(): { id: string; name: string }[] {
    return this.settings.calendars.map(cal => ({
      id: cal.id,
      name: cal.name,
    }));
  }

  async addCalendar(settings: CalendarSettings): Promise<void> {
    const calendars = [...this.settings.calendars, settings];
    await this.set('calendars', calendars);
  }

  async deleteCalendar(id: string): Promise<void> {
    const index = this.settings.calendars.findIndex(c => c.id === id);
    if (index === -1) {
      return;
    }

    const calendars = this.settings.calendars.filter(c => c.id !== id);
    await this.set('calendars', calendars);

    if (this.settings.activeCalendar === id) {
      await this.set('activeCalendar', DEFAULT_PLUGIN_SETTINGS.activeCalendar);
    }
  }

  getCalendarSettings(id?: string): CalendarSettings {
    const targetId = id ?? this.settings.activeCalendar;
    return (
      this.settings.calendars.find(c => c.id === targetId) ??
      DEFAULT_CALENDAR_SETTINGS
    );
  }

  async saveCalendarSettings(settings: CalendarSettings): Promise<void> {
    const index = this.settings.calendars.findIndex(c => c.id === settings.id);
    const calendars = [...this.settings.calendars];

    if (index > -1) {
      calendars[index] = settings;
    } else {
      calendars.push(settings);
    }

    await this.set('calendars', calendars);
  }
}
