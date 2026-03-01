import type { ConfigManager } from './ConfigManager';

const EXTRA_DATE_PROPERTIES = new Set(['created', 'completion', 'cancelled']);

export function getDatePropertyNames(
  configManager: ConfigManager
): Set<string> {
  const cal = configManager.getCalendarSettings();
  return new Set([
    cal.dateProperty,
    cal.startDateProperty,
    ...EXTRA_DATE_PROPERTIES,
  ]);
}
