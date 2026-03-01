export interface EventProps {
  textColor?: string;
  backgroundColor?: string;
  display?: string;
  priority?: number;
}
interface DefaultEventProps {
  textColor: string;
  backgroundColor: string;
  display: string;
  priority: number;
}

/**
 * The supported event info key format:
 * - '*': a single character matches task status of the same character
 * - '#xxx': string starting with '#' matches task tag of the same string
 */
interface EventPropsMap {
  [key: string]: EventProps;
}

/**
 * Represents the minimal calendar settings stored in data.json
 * All properties except id and name are optional
 */
export interface UserCalendarSettings {
  id: string;
  name: string; // name to be displayed in the UI
  viewType?: string; // the default view type
  query?: string; // Dataview query
  dateProperty?: string; // property name to get the date
  startDateProperty?: string; // property name to get the start date
  excludedStatuses?: string[]; // excluded statuses, tasks with these statuses will be filtered out
  includedStatuses?: string[]; // included statuses, empty array means including every task
  excludedTags?: string[]; // excluded tags, tasks with these tags will be filtered out
  includedTags?: string[]; // included tags, empty array means including every task
  eventPropsMap?: EventPropsMap; // event info map
  newTaskFilePaths?: string[]; // New setting for multiple task creation file paths
}

/**
 * Represents the complete calendar settings used throughout the application
 * All properties are required to have values
 */
export interface CalendarSettings {
  id: string;
  name: string; // name to be displayed in the UI
  viewType: string; // the default view type
  query: string; // Dataview query
  dateProperty: string; // property name to get the date
  startDateProperty: string; // property name to get the start date
  excludedStatuses: string[]; // excluded statuses, tasks with these statuses will be filtered out
  includedStatuses: string[]; // included statuses, empty array means including every task
  excludedTags: string[]; // excluded tags, tasks with these tags will be filtered out
  includedTags: string[]; // included tags, empty array means including every task
  eventPropsMap: EventPropsMap; // event info map
  newTaskFilePaths: string[]; // New setting for multiple task creation file paths
}

export type LogLevel = 'error' | 'warn' | 'log';

export interface PluginSettings {
  activeCalendar: string;
  calendars: CalendarSettings[];
  autoOpenOnStartup: boolean;
  logLevel: LogLevel;
}

export const VIEW_TYPE = 'tasks-calendar-view';

export const HOVER_LINK_SOURCE = 'tasks-calendar-hover-link';

export const DEFAULT_EVENT_PROPS: DefaultEventProps = {
  textColor: 'var(--text-on-accent)',
  backgroundColor: 'var(--interactive-accent)',
  display: 'auto',
  priority: 0,
};

/**
 * Built-in default styles for well-known task statuses, applied before
 * any user-defined `eventPropsMap` overrides.
 */
export const STATUS_DEFAULT_EVENT_PROPS: Record<string, EventProps> = {
  x: {
    textColor: 'var(--text-faint)',
    backgroundColor: 'var(--background-secondary)',
    display: 'block',
    priority: -1,
  },
  X: {
    textColor: 'var(--text-faint)',
    backgroundColor: 'var(--background-secondary)',
    display: 'block',
    priority: -1,
  },
  '-': {
    textColor: 'var(--text-faint)',
    backgroundColor: 'var(--background-secondary)',
    display: 'block',
    priority: -2,
  },
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  id: 'default',
  name: 'Default',
  viewType: 'dayGridMonth',
  dateProperty: 'due',
  startDateProperty: 'start',
  query: '""',
  excludedStatuses: [],
  includedStatuses: [],
  excludedTags: [],
  includedTags: [],
  eventPropsMap: {
    // E.g., include completed status with a different style
    // 'x': { textColor: 'var(--text-faint)', backgroundColor: 'var(--background-secondary)', display: 'block', priority: -1 },
  },
  newTaskFilePaths: ['Tasks.md'], // Default file path for new tasks
};

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  activeCalendar: 'default',
  calendars: [DEFAULT_CALENDAR_SETTINGS],
  autoOpenOnStartup: true,
  logLevel: 'warn',
};

export const AUTO_OPEN_DELAY = 300;

/**
 * Convert a UserCalendarSettings object to a complete CalendarSettings object
 * by filling in missing properties with defaults
 */
export function toCalendarSettings(
  settings: UserCalendarSettings
): CalendarSettings {
  return Object.assign({}, DEFAULT_CALENDAR_SETTINGS, settings);
}

/**
 * Convert a CalendarSettings object to a minimal UserCalendarSettings object
 * for storage in data.json
 */
export function toUserCalendarSettings(
  settings: CalendarSettings
): UserCalendarSettings {
  const userSettings: UserCalendarSettings = {
    id: settings.id,
    name: settings.name,
  };

  // Only include properties that differ from defaults
  if (settings.viewType !== DEFAULT_CALENDAR_SETTINGS.viewType)
    userSettings.viewType = settings.viewType;
  if (settings.query !== DEFAULT_CALENDAR_SETTINGS.query)
    userSettings.query = settings.query;
  if (settings.dateProperty !== DEFAULT_CALENDAR_SETTINGS.dateProperty)
    userSettings.dateProperty = settings.dateProperty;
  if (
    settings.startDateProperty !== DEFAULT_CALENDAR_SETTINGS.startDateProperty
  )
    userSettings.startDateProperty = settings.startDateProperty;
  if (settings.newTaskFilePaths !== DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths)
    userSettings.newTaskFilePaths = settings.newTaskFilePaths;

  // For arrays and objects, we need to check if they're different
  if (
    JSON.stringify(settings.includedStatuses) !==
    JSON.stringify(DEFAULT_CALENDAR_SETTINGS.includedStatuses)
  )
    userSettings.includedStatuses = settings.includedStatuses;
  if (
    JSON.stringify(settings.includedTags) !==
    JSON.stringify(DEFAULT_CALENDAR_SETTINGS.includedTags)
  )
    userSettings.includedTags = settings.includedTags;
  if (
    JSON.stringify(settings.excludedStatuses) !==
    JSON.stringify(DEFAULT_CALENDAR_SETTINGS.excludedStatuses)
  )
    userSettings.excludedStatuses = settings.excludedStatuses;
  if (
    JSON.stringify(settings.excludedTags) !==
    JSON.stringify(DEFAULT_CALENDAR_SETTINGS.excludedTags)
  )
    userSettings.excludedTags = settings.excludedTags;
  if (
    JSON.stringify(settings.eventPropsMap) !==
    JSON.stringify(DEFAULT_CALENDAR_SETTINGS.eventPropsMap)
  )
    userSettings.eventPropsMap = settings.eventPropsMap;

  return userSettings;
}

export const FIRST_DAY = 1; // Monday
