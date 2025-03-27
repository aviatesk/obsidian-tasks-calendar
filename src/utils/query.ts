import { Duration } from "luxon";
import { DataviewApi, SMarkdownPage, DateTime, STask } from "obsidian-dataview";
import { EventInput } from "@fullcalendar/core";
import { CalendarSettings, DEFAULT_EVENT_PROPS } from "../TasksCalendarSettings";
import { DEFAULT_CALENDAR_SETTINGS } from "../TasksCalendarSettings";

export interface ExtendedProps {
  filePath: string;
  line: number;
  taskText: string;
  status: string;
  priority: number;
  tags: string[];
}

// Helper function to check if a value is a DateTime object
const isDateTime = (value: any): boolean => value && value.isLuxonDateTime;

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
  const timeAsDecimal = hours + (minutes / 60);

  // Calculate priority based on time of day
  // Earlier events get higher priority (closer to 1)
  // Normalize to keep maximum priority at 1
  return Math.max(0, Math.min(1, 1 - (timeAsDecimal / 24)));
}

function sourceFilter(source: STask | SMarkdownPage, settings: CalendarSettings, isPage: boolean) {
  const excludedStatuses = settings.excludedStatuses
  if (excludedStatuses.length && excludedStatuses.includes(source.status))
    return false;

  const excludedTags = settings.excludedTags
  if (excludedTags.length && source.tags && source.tags.some((tag: string) => excludedTags.includes(tag)))
    return false;

  const includedStatuses = settings.includedStatuses
  if (includedStatuses.length && !includedStatuses.includes(source.status))
    return false;

  const includedTags = settings.includedTags
  if (includedTags.length && source.tags && !source.tags.some((tag: string) => includedTags.includes(tag)))
    return false;

  const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;
  const date = source[dateProperty]
  if (!date || !isDateTime(date))
    return false;
  if (isPage && source.file.frontmatter && !source.file.frontmatter[dateProperty])
    return false; // XXX this is unnecessary if we switch to the new datecore package
  const startDate = source[startDateProperty]
  if (startDate && !isDateTime(startDate))
    return false;
  if (startDate && isPage && source.file.frontmatter && !source.file.frontmatter[startDateProperty])
    return false; // XXX this is unnecessary if we switch to the new datecore package

  return true;
}

function createEvent(source: STask | SMarkdownPage, settings: CalendarSettings) {
  const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;

  const taskDate = source[dateProperty] as DateTime;
  let startDate = taskDate;
  let allDay = taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;

  // Check if task has an end date
  let endDate = undefined;
  if (source[startDateProperty]) {
    const taskStartDate = source[startDateProperty] as DateTime;
    startDate = taskStartDate;
    endDate = taskDate;
    if (allDay) {
      allDay = taskStartDate.hour == 0 && taskStartDate.minute == 0 && taskStartDate.second == 0;
      if (allDay)
        endDate = taskDate.plus(ONE_DAY_DIFF);
    }
  }

  // apply event info
  let eventProps = DEFAULT_EVENT_PROPS;
  // Check for status match first (highest priority)
  if (settings.eventPropsMap[source.status]) {
    eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, settings.eventPropsMap[source.status]);
  }
  // Then check for tag matches
  else if (source.tags && source.tags.length > 0) {
    for (const tag of source.tags) {
      if (settings.eventPropsMap[tag]) {
        eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, settings.eventPropsMap[tag]);
        break;
      }
    }
  }
  let priority = eventProps.priority;
  if (!allDay) // give a priority to non-all-day events
    priority += calculateEventPriority(startDate);
  const taskText = source.text ? source.text : source.file.name;
  const cleanText = taskText
    .replace(/#\w+/g, '') // Remove all tags
    .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
    .trim();
  const filePath = source.path ? source.path : source.file.path;
  const extendedProps: ExtendedProps = {
    filePath,
    taskText,
    line: source.line,
    status: source.status,
    tags: source.tags,
    priority,
  };
  return {
    textColor: eventProps.textColor,
    backgroundColor: eventProps.backgroundColor,
    display: eventProps.display,
    title: cleanText,
    start: startDate.toJSDate(),
    end: endDate?.toJSDate(),
    allDay,
    extendedProps,
  };
}

export default function getTasksAsEvents(
  dataviewApi: DataviewApi, settings: CalendarSettings): EventInput[] {
  const events: EventInput[] = [];

  const query = settings.query || DEFAULT_CALENDAR_SETTINGS.query;

  dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
    if (page && sourceFilter(page, settings, true))
      events.push(createEvent(page, settings));
    if (page && page.file.tasks) {
      page.file.tasks
        .filter(task=>sourceFilter(task, settings, false))
        .forEach(task => events.push(createEvent(task, settings)));
    }
  });

  return events;
}
