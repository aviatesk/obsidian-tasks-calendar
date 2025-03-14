export interface EventProps {
  textColor?: string,
  backgroundColor?: string,
  editable?: boolean,
  priority?: number,
  forceAllDay?: boolean, // HACK for styling with past non-all-day events
}

/**
 * The supported event info key format:
 * - '*': a single character matches task status of the same character
 * - '#xxx': string starting with '#' matches task tag of the same string
 */
interface EventPropsMap {
  [key: string]: EventProps
}

/**
 * Represents the minimal calendar settings stored in data.json
 * All properties except id and name are optional
 */
export interface UserCalendarSettings {
  id: string;
  name: string;                  // name to be displayed in the UI
  viewType?: string;             // the default view type
  query?: string;                // Dataview query
  dateProperty?: string;         // property name to get the date
  startDateProperty?: string;    // property name to get the start date
  includedStatuses?: string[];   // included statuses, empty array means including every task
  includedTags?: string[];       // included tags, empty array means including every task
  eventPropsMap?: EventPropsMap  // event info map
}

/**
 * Represents the complete calendar settings used throughout the application
 * All properties are required to have values
 */
export interface CalendarSettings {
  id: string;
  name: string;                 // name to be displayed in the UI
  viewType: string;             // the default view type
  query: string;                // Dataview query
  dateProperty: string;         // property name to get the date
  startDateProperty: string;    // property name to get the start date
  includedStatuses: string[];   // included statuses, empty array means including every task
  includedTags: string[];       // included tags, empty array means including every task
  eventPropsMap: EventPropsMap  // event info map
}

export interface PluginSettings {
  activeCalendar: string;
  calendars: UserCalendarSettings[];
}

export const VIEW_TYPE = 'tasks-calendar-view';

export const HOVER_LINK_SOURCE = "tasks-calendar-hover-link"

export const DEFAULT_EVENT_PROPS = {
  textColor: 'var(--text-on-accent)',
  backgroundColor: 'var(--interactive-accent)',
  editable: true,
  priority: 0,
  forceAllDay: false,
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  id: 'default',
  name: 'Default',
  viewType: 'dayGridMonth',
  dateProperty: 'due',
  startDateProperty: 'start',
  query: '""',
  includedStatuses: [],
  includedTags: [],
  eventPropsMap: {
    // completed status
    'x': { textColor: 'var(--text-faint)', backgroundColor: 'var(--background-secondary)', editable: false, forceAllDay: true, priority: -1 },
    // cancelled status
    '-': { textColor: 'var(--text-faint)', backgroundColor: 'var(--background-secondary)', editable: false, forceAllDay: true, priority: -2 },
  },
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  activeCalendar: 'default',
  calendars: [],
};

/**
 * Convert a UserCalendarSettings object to a complete CalendarSettings object
 * by filling in missing properties with defaults
 */
export function toCalendarSettings(settings: UserCalendarSettings): CalendarSettings {
  return Object.assign({}, DEFAULT_CALENDAR_SETTINGS, settings);
}

/**
 * Convert a CalendarSettings object to a minimal UserCalendarSettings object
 * for storage in data.json
 */
export function toUserCalendarSettings(settings: CalendarSettings): UserCalendarSettings {
  const userSettings: UserCalendarSettings = {
    id: settings.id,
    name: settings.name,
  };

  // Only include properties that differ from defaults
  if (settings.viewType !== DEFAULT_CALENDAR_SETTINGS.viewType) {
    userSettings.viewType = settings.viewType;
  }
  if (settings.query !== DEFAULT_CALENDAR_SETTINGS.query) {
    userSettings.query = settings.query;
  }
  if (settings.dateProperty !== DEFAULT_CALENDAR_SETTINGS.dateProperty) {
    userSettings.dateProperty = settings.dateProperty;
  }
  if (settings.startDateProperty !== DEFAULT_CALENDAR_SETTINGS.startDateProperty) {
    userSettings.startDateProperty = settings.startDateProperty;
  }

  // For arrays and objects, we need to check if they're different
  if (JSON.stringify(settings.includedStatuses) !== JSON.stringify(DEFAULT_CALENDAR_SETTINGS.includedStatuses)) {
    userSettings.includedStatuses = settings.includedStatuses;
  }
  if (JSON.stringify(settings.includedTags) !== JSON.stringify(DEFAULT_CALENDAR_SETTINGS.includedTags)) {
    userSettings.includedTags = settings.includedTags;
  }
  if (JSON.stringify(settings.eventPropsMap) !== JSON.stringify(DEFAULT_CALENDAR_SETTINGS.eventPropsMap)) {
    userSettings.eventPropsMap = settings.eventPropsMap;
  }

  return userSettings;
}

export const FIRST_DAY = 1; // Monday
