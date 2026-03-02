import type {
  PluginSettings,
  LogLevel,
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

type UntypedListener = (...args: unknown[]) => void;

export class ConfigManager {
  private readonly logger: Logger = createLogger('ConfigManager');
  private settings: PluginSettings;
  private saveCallback: (settings: PluginSettings) => Promise<void>;
  private changeListeners: Map<string, Set<UntypedListener>> = new Map();

  private constructor(
    initialSettings: PluginSettings,
    saveCallback: (settings: PluginSettings) => Promise<void>
  ) {
    this.settings = { ...initialSettings };
    this.saveCallback = saveCallback;
  }

  static async initialize(
    loadData: () => Promise<unknown>,
    saveData: (data: unknown) => Promise<void>
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

  private static isLogLevel(value: unknown): value is LogLevel {
    return value === 'error' || value === 'warn' || value === 'log';
  }

  private static isCalendarEntry(
    value: unknown
  ): value is UserCalendarSettings {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.id === 'string' && typeof obj.name === 'string';
  }

  private static migrateSettings(loadedData: unknown): PluginSettings {
    if (!loadedData || typeof loadedData !== 'object') {
      return { ...DEFAULT_PLUGIN_SETTINGS };
    }

    const data = loadedData as Record<string, unknown>;

    const activeCalendar =
      typeof data.activeCalendar === 'string'
        ? data.activeCalendar
        : DEFAULT_PLUGIN_SETTINGS.activeCalendar;

    const calendars = Array.isArray(data.calendars)
      ? data.calendars
          .filter(ConfigManager.isCalendarEntry)
          .map(toCalendarSettings)
      : DEFAULT_PLUGIN_SETTINGS.calendars;

    const autoOpenOnStartup =
      typeof data.autoOpenOnStartup === 'boolean'
        ? data.autoOpenOnStartup
        : DEFAULT_PLUGIN_SETTINGS.autoOpenOnStartup;

    const logLevel = ConfigManager.isLogLevel(data.logLevel)
      ? data.logLevel
      : DEFAULT_PLUGIN_SETTINGS.logLevel;

    return { activeCalendar, calendars, autoOpenOnStartup, logLevel };
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
        (oldValues as unknown as Record<string, unknown>)[k] = this.settings[k];
        (this.settings as unknown as Record<string, unknown>)[k] = value;
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
    this.changeListeners.get(keyStr)!.add(listener as UntypedListener);

    return () => {
      const listeners = this.changeListeners.get(keyStr);
      if (listeners) {
        listeners.delete(listener as UntypedListener);
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
      listeners.forEach(fn => {
        const listener = fn as ConfigChangeListener<K>;
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
