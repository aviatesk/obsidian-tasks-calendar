import { Duration } from "luxon";
import { DataviewApi, SMarkdownPage, DateTime } from "obsidian-dataview";
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

export default function getTasksAsEvents(
  dataviewApi: DataviewApi, settings: CalendarSettings): EventInput[] {
  const events: EventInput[] = [];

  const query = settings.query || DEFAULT_CALENDAR_SETTINGS.query;

  dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
    if (page && page.file.tasks) {
      page.file.tasks
        .filter(task => {
          const excludedStatuses = settings.excludedStatuses
          if (excludedStatuses.length && excludedStatuses.includes(task.status))
            return false;

          const excludedTags = settings.excludedTags
          if (excludedTags.length && task.tags.some(tag => excludedTags.includes(tag)))
            return false;

          const includedStatuses = settings.includedStatuses
          if (includedStatuses.length && !includedStatuses.includes(task.status))
            return false;

          const includedTags = settings.includedTags
          if (includedTags.length && !task.tags.some(tag => includedTags.includes(tag)))
            return false;

          const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
          const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;
          const date = task[dateProperty]
          if (!date || !isDateTime(date))
            return false;
          const startDate = task[startDateProperty]
          if (startDate && !isDateTime(startDate))
            return false;

          return true;
        })
        .forEach(task => {
          const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
          const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;

          const taskDate = task[dateProperty] as DateTime;
          let startDate = taskDate;
          let allDay = taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;

          // Check if task has an end date
          let endDate = undefined;
          if (task[startDateProperty]) {
            const taskStartDate = task[startDateProperty] as DateTime;
            startDate = taskStartDate;
            endDate = taskDate;
            if (allDay) {
              allDay = taskStartDate.hour == 0 && taskStartDate.minute == 0 && taskStartDate.second == 0;
              endDate = taskDate.plus(ONE_DAY_DIFF);
            }
          }

          // apply event info
          let eventProps = DEFAULT_EVENT_PROPS;
          // Check for status match first (highest priority)
          if (settings.eventPropsMap[task.status]) {
            eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, settings.eventPropsMap[task.status]);
          }
          // Then check for tag matches
          else if (task.tags && task.tags.length > 0) {
            for (const tag of task.tags) {
              if (settings.eventPropsMap[tag]) {
                eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, settings.eventPropsMap[tag]);
                break;
              }
            }
          }
          let priority = eventProps.priority;
          if (!allDay) // give a priority to non-all-day events
            priority += calculateEventPriority(startDate);
          const cleanText = task.text
            .replace(/#\w+/g, '') // Remove all tags
            .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
            .trim();
          const extendedProps: ExtendedProps = {
            filePath: page.file.path,
            line: task.line,
            taskText: task.text,
            status: task.status,
            tags: task.tags,
            priority,
          };
          events.push({
            textColor: eventProps.textColor,
            backgroundColor: eventProps.backgroundColor,
            display: eventProps.display,
            title: cleanText,
            start: startDate.toJSDate(),
            end: endDate?.toJSDate(),
            allDay,
            extendedProps,
          });
        });
    }
  });

  return events;
}
