export interface CalendarSettings {
  id: string;               // カレンダーごとの一意のID
  name: string;             // カレンダーの表示名
  viewType: string;           // デフォルトのビュータイプ
  query: string;              // Dataviewクエリ
  dateProperty: string;       // 日付情報を取得するプロパティ名
  startDateProperty: string;  // 開始日付を取得するプロパティ名
  includedStatuses: string[]; // 含めるタスクのステータス
  includedTags: string[];     // 含めるタスクのタグ, empty array means including everything
}

export interface PluginSettings {
  activeCalendar: string;
  calendars: CalendarSettings[];
}

export const VIEW_TYPE = 'tasks-calendar-view';

export const HOVER_LINK_SOURCE = "tasks-calendar-hover-link"

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  id: 'default',
  name: 'Default',
  viewType: 'dayGridMonth',
  dateProperty: 'due',
  startDateProperty: 'start',
  query: '""',
  includedStatuses: [' ', '/'],
  includedTags: [],
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  activeCalendar: 'default',
  calendars: [],
};
