import { Duration, DateTime } from 'luxon';
import { DataviewApi, SMarkdownPage, STask } from 'obsidian-dataview';
import { EventInput } from '@fullcalendar/core';
import {
  CalendarSettings,
  DEFAULT_EVENT_PROPS,
  STATUS_DEFAULT_EVENT_PROPS,
} from '../TasksCalendarSettings';
import { DEFAULT_CALENDAR_SETTINGS } from '../TasksCalendarSettings';
import { normalizeTag } from './tag';
import { parseRecurrence, calculateNextDate } from './recurrence';

export interface ExtendedProps {
  filePath: string;
  line: number;
  taskText: string;
  status: string;
  priority: number;
  tags: string[];
  recurrence?: string;
  isGhost?: boolean;
}

// Helper function to check if a value is a DateTime object
const isDateTime = (value: any): boolean =>
  value && value.isLuxonDateTime && value.isValid;

const ONE_DAY_DIFF = Duration.fromObject({ days: 1 });

/**
 * Calculates event priority based on start time for non-all-day events.
 * Earlier events in the day get higher priority.
 * Priority is normalized to a maximum value of 1.
 */
function calculateEventPriority(startDate: DateTime) {
  // Extract hours and minutes from start time
  const hours = startDate.hour;
  const minutes = startDate.minute;

  // Convert to decimal hours (e.g., 9:30 becomes 9.5)
  const timeAsDecimal = hours + minutes / 60;

  // Calculate priority based on time of day
  // Earlier events get higher priority (closer to 1)
  // Normalize to keep maximum priority at 1
  return Math.max(0, Math.min(1, 1 - timeAsDecimal / 24));
}

// XXX this is unnecessary if we switch to the new datecore package
function getPageDate(frontMatter: any, dateProperty: string) {
  if (!frontMatter) return undefined;
  if (!frontMatter[dateProperty]) return undefined;
  return DateTime.fromISO(frontMatter[dateProperty]);
}

function sourceFilter(
  source: STask | SMarkdownPage,
  settings: CalendarSettings,
  isPage: boolean
) {
  const status = source.status ?? ' ';
  const excludedStatuses = settings.excludedStatuses;
  if (excludedStatuses.length && excludedStatuses.includes(status))
    return false;

  const includedStatuses = settings.includedStatuses;
  if (includedStatuses.length && !includedStatuses.includes(status))
    return false;

  if (settings.excludedTags.length && source.tags)
    if (
      !source.tags.some ||
      source.tags.some((tag: string) =>
        settings.excludedTags.includes(normalizeTag(tag))
      )
    )
      return false;

  if (settings.includedTags.length && source.tags)
    if (
      !source.tags.some ||
      !settings.includedTags.some((tag: string) =>
        settings.includedTags.includes(normalizeTag(tag))
      )
    )
      return false;

  const dateProperty =
    settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty =
    settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;
  const date = isPage
    ? getPageDate(source.file.frontmatter, dateProperty)
    : source[dateProperty];
  if (!date || !isDateTime(date)) return false;
  const startDate = isPage
    ? getPageDate(source.file.frontmatter, startDateProperty)
    : source[startDateProperty];
  if (startDate && !isDateTime(startDate)) return false;
  return true;
}

function createEvent(
  source: STask | SMarkdownPage,
  settings: CalendarSettings,
  isPage: boolean
) {
  const dateProperty =
    settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty =
    settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;

  const taskDate = (
    isPage
      ? getPageDate(source.file.frontmatter, dateProperty)
      : source[dateProperty]
  ) as DateTime;
  let startDate = taskDate;
  let allDay =
    taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;

  // Check if task has an end date
  let endDate = undefined;
  if (source[startDateProperty]) {
    const taskStartDate = (
      isPage
        ? getPageDate(source.file.frontmatter, startDateProperty)
        : source[startDateProperty]
    ) as DateTime;
    startDate = taskStartDate;
    endDate = taskDate;
    if (allDay) {
      allDay =
        taskStartDate.hour == 0 &&
        taskStartDate.minute == 0 &&
        taskStartDate.second == 0;
      if (allDay) endDate = taskDate.plus(ONE_DAY_DIFF);
    }
  }

  // apply event info
  let eventProps = Object.assign(
    {},
    DEFAULT_EVENT_PROPS,
    STATUS_DEFAULT_EVENT_PROPS[source.status] ?? {}
  );
  // User-defined eventPropsMap overrides built-in defaults.
  if (settings.eventPropsMap[source.status]) {
    eventProps = Object.assign(
      {},
      eventProps,
      settings.eventPropsMap[source.status]
    );
  }
  // Then check for tag matches with normalized tags
  else if (source.tags && source.tags.length > 0) {
    for (let tag of source.tags) {
      tag = normalizeTag(tag);
      const tagSettings = settings.eventPropsMap[tag];
      if (tagSettings) {
        eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, tagSettings);
        break;
      }
    }
  }
  let priority = eventProps.priority;
  if (!allDay)
    // give a priority to non-all-day events
    priority += calculateEventPriority(startDate);
  const taskText = source.text ? source.text : source.file.name;
  const cleanText = taskText
    .replace(/#\w+/g, '') // Remove all tags
    .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
    .trim();
  const filePath = source.path ? source.path : source.file.path;
  const recurrence = isPage
    ? (source.file.frontmatter?.recurrence as string | undefined)
    : (source['recurrence'] as string | undefined);

  const extendedProps: ExtendedProps = {
    filePath,
    taskText,
    line: source.line,
    status: source.status ?? ' ',
    tags: source.tags,
    priority,
    recurrence: typeof recurrence === 'string' ? recurrence : undefined,
  };
  const classNames =
    source.status === '-' ? ['tasks-calendar-event-cancelled'] : [];
  return {
    textColor: eventProps.textColor,
    backgroundColor: eventProps.backgroundColor,
    display: eventProps.display,
    classNames,
    title: cleanText,
    start: startDate.toJSDate(),
    end: endDate?.toJSDate(),
    allDay,
    extendedProps,
  };
}

function maybeCreateGhostEvent(
  event: EventInput,
  extendedProps: ExtendedProps
): EventInput | null {
  if (!extendedProps.recurrence) return null;
  if (extendedProps.status === 'x' || extendedProps.status === 'X') return null;

  const start = event.start;
  if (!start) return null;

  const rule = parseRecurrence(extendedProps.recurrence);
  if (!rule) return null;

  const startDate =
    start instanceof Date
      ? DateTime.fromJSDate(start)
      : DateTime.fromISO(start as string);
  if (!startDate.isValid) return null;

  const hasTime =
    startDate.hour !== 0 || startDate.minute !== 0 || startDate.second !== 0;
  const isoStr = hasTime
    ? startDate.toFormat("yyyy-MM-dd'T'HH:mm")
    : startDate.toISODate()!;
  const nextDateStr = calculateNextDate(isoStr, rule);
  const nextDate = DateTime.fromISO(nextDateStr);
  if (!nextDate.isValid) return null;

  const ghostProps: ExtendedProps = {
    ...extendedProps,
    isGhost: true,
  };

  return {
    textColor: event.textColor,
    backgroundColor: event.backgroundColor,
    display: event.display,
    classNames: [
      ...(Array.isArray(event.classNames) ? event.classNames : []),
      'tasks-calendar-event-ghost',
    ],
    title: event.title,
    start: nextDate.toJSDate(),
    allDay: event.allDay,
    editable: false,
    extendedProps: ghostProps,
  };
}

export default function getTasksAsEvents(
  dataviewApi: DataviewApi,
  settings: CalendarSettings
): EventInput[] {
  const events: EventInput[] = [];

  const query = settings.query || DEFAULT_CALENDAR_SETTINGS.query;

  dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
    if (page && sourceFilter(page, settings, true)) {
      const event = createEvent(page, settings, true);
      events.push(event);
      const ghost = maybeCreateGhostEvent(
        event,
        event.extendedProps as ExtendedProps
      );
      if (ghost) events.push(ghost);
    }
    if (page && page.file.tasks) {
      page.file.tasks
        .filter(task => sourceFilter(task, settings, false))
        .forEach(task => {
          const event = createEvent(task, settings, false);
          events.push(event);
          const ghost = maybeCreateGhostEvent(
            event,
            event.extendedProps as ExtendedProps
          );
          if (ghost) events.push(ghost);
        });
    }
  });

  return events;
}
