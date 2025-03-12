import { DataviewApi, SMarkdownPage } from "obsidian-dataview";
import { EventInput } from "@fullcalendar/core";
import { CalendarSettings } from "./TasksCalendarSettings";
import { DEFAULT_CALENDAR_SETTINGS } from "./TasksCalendarSettings";

export default function getTasksAsEvents(
  dataviewApi: DataviewApi, settings: CalendarSettings): EventInput[] {
  try {
    const events: EventInput[] = [];

    // カスタムクエリを使用 - 値が未設定なら デフォルトを使用
    const query = settings.query || DEFAULT_CALENDAR_SETTINGS.query;

    // Dataviewクエリを実行
    dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
      if (page && page.file.tasks) {
        page.file.tasks
          .filter(task => {
            // ステータスによるフィルタリング - 値が未設定ならデフォルトを使用
            const statuses = settings.includedStatuses?.length ?
              settings.includedStatuses : DEFAULT_CALENDAR_SETTINGS.includedStatuses;

            // 指定されたステータスのいずれかに一致するタスクのみを含める
            if (!statuses.includes(task.status)) {
              return false;
            }

            const includedTags = settings.includedTags
            if (includedTags.length && !task.tags.some(tag => includedTags.includes(tag))) {
              return false;
            }

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
            events.push({
              title: cleanText,
              start: startDate,
              end: endDate,
              allDay,
              extendedProps: {
                filePath: page.file.path,
                line: task.line
              }
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
