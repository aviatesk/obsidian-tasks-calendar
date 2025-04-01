import { Duration, DateTime } from "luxon";
import { DataviewApi, SMarkdownPage, STask } from "obsidian-dataview";
import { EventInput } from "@fullcalendar/core";
import { CalendarSettings, DEFAULT_EVENT_PROPS } from "../TasksCalendarSettings";
import { DEFAULT_CALENDAR_SETTINGS } from "../TasksCalendarSettings";
import { normalizeTag } from "./tag";

export interface ExtendedProps {
  filePath: string;
  line: number;
  taskText: string;
  status: string;
  priority: number;
  tags: string[];
}

// Helper function to check if a value is a DateTime object
const isDateTime = (value: any): boolean => value && value.isLuxonDateTime && value.isValid;

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

// XXX this is unnecessary if we switch to the new datecore package
function getPageDate(frontMatter: any, dateProperty: string) {
  if (!frontMatter)
    return undefined;
  if (!frontMatter[dateProperty])
    return undefined;
  return DateTime.fromISO(frontMatter[dateProperty]);
}

function sourceFilter(source: STask | SMarkdownPage, settings: CalendarSettings, isPage: boolean) {
  const excludedStatuses = settings.excludedStatuses
  if (excludedStatuses.length && excludedStatuses.includes(source.status))
    return false;

  const includedStatuses = settings.includedStatuses
  if (includedStatuses.length && !includedStatuses.includes(source.status))
    return false;

  if (settings.excludedTags.length && source.tags)
    if (!source.tags.some || source.tags.some((tag: string) => settings.excludedTags.includes(normalizeTag(tag))))
      return false;

  if (settings.includedTags.length && source.tags)
    if (!source.tags.some || !settings.includedTags.some((tag: string) => settings.includedTags.includes(normalizeTag(tag))))
      return false;

  const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;
  const date = isPage ? getPageDate(source.file.frontmatter, dateProperty) : source[dateProperty];
  if (!date || !isDateTime(date))
    return false;
  const startDate = isPage ? getPageDate(source.file.frontmatter, startDateProperty) : source[startDateProperty];
  if (startDate && !isDateTime(startDate))
    return false;
  return true;
}

// Map to store parent task text by recurrence ID
type RecurrenceParentMap = Map<string, string>;

// Helper function to safely get recurrence ID from a dataview task
const getTaskRecurrenceId = (task: any) => task['recurrence_id'];

// Helper function to check if a task is a recurrence child
function isTaskRecurrenceChild(task: any): boolean {
  // A task is a recurrence child if it has a recurrence_id but no recurrence rule
  return Boolean(task['recurrence_id'] && !task['recurrence']);
}

// Helper function to check if a task is a recurrence parent
function isTaskRecurrenceParent(source: any) {
  // A task is a recurrence parent if it has both recurrence_id and recurrence rule
  return Boolean(source['recurrence'] && source['recurrence_id']);
}

function getCleanText(taskText: string) {
  return taskText
    .replace(/#\w+/g, '') // Remove all tags
    .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
    .trim();
}

function createEvent(
  source: STask | SMarkdownPage,
  settings: CalendarSettings,
  isPage: boolean,
  recurrenceParentMap: RecurrenceParentMap
) {
  const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
  const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;

  const taskDate = (isPage ? getPageDate(source.file.frontmatter, dateProperty) : source[dateProperty]) as DateTime;
  let startDate = taskDate;
  let allDay = taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;

  // Check if task has an end date
  let endDate = undefined;
  if (source[startDateProperty]) {
    const taskStartDate = (isPage ? getPageDate(source.file.frontmatter, startDateProperty) : source[startDateProperty]) as DateTime;
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
  // Then check for tag matches with normalized tags
  else if (source.tags && source.tags.length > 0) {
    for (let tag of source.tags) {
      tag = normalizeTag(tag);
      const tagSettings = settings.eventPropsMap[tag]
      if (tagSettings) {
        eventProps = Object.assign(
          {},
          DEFAULT_EVENT_PROPS,
          tagSettings
        );
        break;
      }
    }
  }
  let priority = eventProps.priority;
  if (!allDay) // give a priority to non-all-day events
    priority += calculateEventPriority(startDate);

  const taskText = isPage ?
    (source['taskText'] ? // override with taskText if available (for the markdown file property tasks)
      source['taskText'] :
      source.file.name) :
    source.text;

  let cleanText = getCleanText(taskText);

  // For child tasks with no text, inherit from parent
  if (isTaskRecurrenceChild(source) && (!cleanText || cleanText.trim() === '')) {
    // Get recurrence ID and look up parent text
    const recurrenceId = getTaskRecurrenceId(source);
    if (recurrenceParentMap.has(recurrenceId))
      cleanText = recurrenceParentMap.get(recurrenceId) as string;
  }

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

  // Create a map for all parent tasks by recurrence ID
  const recurrenceParentMap = new Map<string, string>();

  // Process pages and collect events in a single pass
  dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
    if (!page || !page.file) return;

    // First, collect parent tasks from this page
    if (sourceFilter(page, settings, true))
      if (isTaskRecurrenceParent(page))
        recurrenceParentMap.set(page['recurrence_id'], page.file.name);
    if (page.file.tasks)
      page.file.tasks
        .filter(task => sourceFilter(task, settings, false) && isTaskRecurrenceParent(task))
        .forEach(task => recurrenceParentMap.set(getTaskRecurrenceId(task), getCleanText(task.text)))

    // Then, create events for this page
    if (sourceFilter(page, settings, true))
      events.push(createEvent(page, settings, true, recurrenceParentMap));
    if (page.file.tasks)
      page.file.tasks
        .filter(task => sourceFilter(task, settings, false))
        .forEach(task => events.push(createEvent(task, settings, false, recurrenceParentMap)));
  });

  return events;
}
