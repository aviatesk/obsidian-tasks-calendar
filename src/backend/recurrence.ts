import { DateTime, type WeekdayNumbers } from 'luxon';
import {
  ParsedTask,
  cloneTask,
  getTaskProperty,
  setTaskProperty,
  removeTaskProperty,
  reconstructTask,
} from './parse';

export interface RecurrenceRule {
  interval: number;
  unit: 'day' | 'week' | 'month' | 'year';
  weekday?: number; // 1=Monday .. 7=Sunday (ISO weekday)
}

const WEEKDAY_NAMES: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

export function parseRecurrence(pattern: string): RecurrenceRule | null {
  const normalized = pattern.trim().toLowerCase();

  if (normalized === 'every day') return { interval: 1, unit: 'day' };
  if (normalized === 'every week') return { interval: 1, unit: 'week' };
  if (normalized === 'every month') return { interval: 1, unit: 'month' };
  if (normalized === 'every year') return { interval: 1, unit: 'year' };

  if (normalized === 'every weekday') {
    return { interval: 1, unit: 'day', weekday: -1 };
  }

  const weekdayMatch = normalized.match(/^every (\w+)$/);
  if (weekdayMatch && WEEKDAY_NAMES[weekdayMatch[1]] !== undefined) {
    return {
      interval: 1,
      unit: 'week',
      weekday: WEEKDAY_NAMES[weekdayMatch[1]],
    };
  }

  const intervalMatch = normalized.match(
    /^every (\d+) (days?|weeks?|months?|years?)$/
  );
  if (intervalMatch) {
    const interval = parseInt(intervalMatch[1]);
    const rawUnit = intervalMatch[2].replace(/s$/, '');
    const unit = rawUnit as RecurrenceRule['unit'];
    return { interval, unit };
  }

  return null;
}

export function calculateNextDate(
  currentDate: string,
  rule: RecurrenceRule
): string {
  const hasTime = currentDate.includes('T');
  const dt = DateTime.fromISO(currentDate);
  if (!dt.isValid) return currentDate;

  let next: DateTime;

  if (rule.weekday === -1) {
    // "every weekday": advance to the next weekday (Mon-Fri)
    next = dt.plus({ days: 1 });
    while (next.weekday > 5) {
      next = next.plus({ days: 1 });
    }
  } else if (rule.weekday !== undefined && rule.unit === 'week') {
    // "every monday", etc.: advance to the next occurrence of that weekday
    next = dt.plus({ weeks: rule.interval });
    next = next.set({ weekday: rule.weekday as WeekdayNumbers });
    // Ensure it's strictly after the current date
    if (next <= dt) {
      next = next.plus({ weeks: 1 });
    }
  } else {
    next = dt.plus({ [rule.unit + 's']: rule.interval });
  }

  return hasTime ? next.toFormat("yyyy-MM-dd'T'HH:mm") : next.toISODate()!;
}

const STATUS_PROPERTIES = ['completion', 'cancelled', 'deferred'];

export function buildRecurringTaskLine(
  completedTask: ParsedTask,
  dateProperty: string,
  startDateProperty: string
): string | null {
  const recurrenceValue = getTaskProperty(completedTask, 'recurrence');
  if (!recurrenceValue) return null;

  const rule = parseRecurrence(recurrenceValue);
  if (!rule) return null;

  const dueDate = getTaskProperty(completedTask, dateProperty);
  if (!dueDate) return null;

  const newDueDate = calculateNextDate(dueDate, rule);

  let newTask = cloneTask(completedTask);
  newTask.status = ' ';

  newTask = setTaskProperty(newTask, dateProperty, newDueDate);

  const startDate = getTaskProperty(completedTask, startDateProperty);
  if (startDate) {
    const oldDue = DateTime.fromISO(dueDate);
    const newDue = DateTime.fromISO(newDueDate);
    const oldStart = DateTime.fromISO(startDate);
    if (oldDue.isValid && newDue.isValid && oldStart.isValid) {
      const delta = newDue.diff(oldDue);
      const newStart = oldStart.plus(delta);
      const hasTime = startDate.includes('T');
      const formatted = hasTime
        ? newStart.toFormat("yyyy-MM-dd'T'HH:mm")
        : newStart.toISODate()!;
      newTask = setTaskProperty(newTask, startDateProperty, formatted);
    }
  }

  for (const prop of STATUS_PROPERTIES) {
    newTask = removeTaskProperty(newTask, prop);
  }

  return reconstructTask(newTask);
}

export interface RecurringFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function buildRecurringFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  dateProperty: string,
  startDateProperty: string
): RecurringFrontmatter | null {
  const recurrenceValue = frontmatter.recurrence;
  if (typeof recurrenceValue !== 'string') return null;

  const rule = parseRecurrence(recurrenceValue);
  if (!rule) return null;

  const dueDate = frontmatter[dateProperty];
  if (typeof dueDate !== 'string') return null;

  const newDueDate = calculateNextDate(dueDate, rule);

  const newFm: Record<string, unknown> = { ...frontmatter };
  newFm.status = ' ';
  newFm[dateProperty] = newDueDate;

  const startDate = frontmatter[startDateProperty];
  if (typeof startDate === 'string') {
    const oldDue = DateTime.fromISO(dueDate);
    const newDue = DateTime.fromISO(newDueDate);
    const oldStart = DateTime.fromISO(startDate);
    if (oldDue.isValid && newDue.isValid && oldStart.isValid) {
      const delta = newDue.diff(oldDue);
      const newStart = oldStart.plus(delta);
      const hasTime = startDate.includes('T');
      newFm[startDateProperty] = hasTime
        ? newStart.toFormat("yyyy-MM-dd'T'HH:mm")
        : newStart.toISODate()!;
    }
  }

  for (const prop of STATUS_PROPERTIES) {
    delete newFm[prop];
  }

  return { frontmatter: newFm, body };
}
