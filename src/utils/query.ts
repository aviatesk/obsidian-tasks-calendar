import { DataviewApi, SMarkdownPage } from "obsidian-dataview";
import { EventInput } from "@fullcalendar/core";
import { CalendarSettings, DEFAULT_EVENT_PROPS } from "../TasksCalendarSettings";
import { DEFAULT_CALENDAR_SETTINGS } from "../TasksCalendarSettings";

export interface ExtendedProps {
  filePath: string;
  line: number;
  taskText: string;
  status: string;
  priority: number;
}

export default function getTasksAsEvents(
  dataviewApi: DataviewApi, settings: CalendarSettings): EventInput[] {
  try {
    const events: EventInput[] = [];

    const query = settings.query || DEFAULT_CALENDAR_SETTINGS.query;

    dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
      if (page && page.file.tasks) {
        page.file.tasks
          .filter(task => {
            const includedStatuses = settings.includedStatuses
            if (includedStatuses.length && !includedStatuses.includes(task.status))
              return false;

            const includedTags = settings.includedTags
            if (includedTags.length && !task.tags.some(tag => includedTags.includes(tag)))
              return false;

            // 日付プロパティの存在確認 - 値が未設定ならデフォルトを使用
            const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
            return !!task[dateProperty];
          })
          .forEach(task => {
            const dateProperty = settings.dateProperty || DEFAULT_CALENDAR_SETTINGS.dateProperty;
            const startDateProperty = settings.startDateProperty || DEFAULT_CALENDAR_SETTINGS.startDateProperty;

            const taskDate = task[dateProperty];
            const date = taskDate.toString();
            let allDay = taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;
            const cleanText = task.text
              .replace(/#\w+/g, '') // Remove all tags
              .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
              .trim();

            // Check if task has an end date
            let startDate = date;
            let endDate = undefined;
            if (task[startDateProperty]) {
              const taskStartDate = task[startDateProperty];
              startDate = taskStartDate.toString();
              if (allDay) {
                allDay = taskStartDate.hour == 0 && taskStartDate.minute == 0 && taskStartDate.second == 0;
              }
              endDate = task[dateProperty].plus(dataviewApi.func.dur("1 day")).toString();
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
                if (settings.eventPropsMap['#' + tag]) {
                  eventProps = Object.assign({}, DEFAULT_EVENT_PROPS, settings.eventPropsMap['#' + tag]);
                  break;
                }
              }
            }
            if (eventProps.forceAllDay)
              allDay = true;
            let priority = eventProps.priority;
            if (!allDay) // give a priority to non-all-day events
              priority += 1;
            const extendedProps: ExtendedProps = {
              filePath: page.file.path,
              line: task.line,
              taskText: task.text,
              status: task.status,
              priority,
            };
            events.push({
              textColor: eventProps.textColor,
              backgroundColor: eventProps.backgroundColor,
              editable: eventProps.editable,
              title: cleanText,
              start: startDate,
              end: endDate,
              allDay,
              extendedProps,
            });
          });
      }
    });

    return events;
  } catch (error) {
    console.error("Error getting tasks:", error);
    return [];
  }
}
