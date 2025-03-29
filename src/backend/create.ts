import { App, TFile, normalizePath } from 'obsidian';
import { DateTime } from "luxon";
import { formatDateForTask } from './date';
import { appendToFile } from './file-operations';
import { TaskValidationError } from './error-handling';
import {
  RecurrenceRule,
  generateRecurrenceDates,
  generateRecurrenceId,
  formatRecurrenceRule
} from './recurrence';

function getDateValues(
  startDate: Date,
  endDate: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
) {
  let listFormatText = "";
  let dateValue = null;
  let startDateValue = null;
  if (startDate && !endDate && isAllDay) {
    dateValue = formatDateForTask(startDate, isAllDay, false);
    listFormatText += ` [${dateProperty}:: ${dateValue}]`;
  } else if (startDate && endDate) {
    startDateValue = formatDateForTask(startDate, isAllDay, false);
    listFormatText += ` [${startDateProperty}:: ${startDateValue}]`;
    dateValue = formatDateForTask(endDate, isAllDay, true);
    listFormatText += ` [${dateProperty}:: ${dateValue}]`;
  } else if (startDate) {
    dateValue = formatDateForTask(startDate, isAllDay, false);
    listFormatText += ` [${dateProperty}:: ${dateValue}]`;
  }
  return { listFormatText, dateValue, startDateValue };
}

/**
 * Creates a new task based on the target path
 * - If target is a file, appends task to that file
 * - If target is a folder, creates a new note with task text as the name and adds frontmatter
 *
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export async function createRecurrenceTask(
  app: App,
  targetPath: string,
  taskText: string,
  status: string,
  startDate: Date,
  endDate: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string,
  recurrenceRule: RecurrenceRule
): Promise<boolean> {
  // Generate recurrence ID
  const recurrenceId = generateRecurrenceId();

  const dateValues = getDateValues(
    startDate,
    endDate,
    isAllDay,
    startDateProperty,
    dateProperty
  );
  const dateValue = dateValues.dateValue;
  const startDateValue = dateValues.startDateValue;

  // Generate recurrence dates
  const startDateTime = DateTime.fromJSDate(startDate);
  const dates = generateRecurrenceDates(startDateTime, recurrenceRule);

  const recurrence = formatRecurrenceRule(recurrenceRule)

  // Check if the target path ends with / or \ indicating a folder
  const isFolder = targetPath.endsWith('/') || targetPath.endsWith('\\');

  if (isFolder) {
    // Create a new task with the markdown property format
    const fileName = `${sanitizeFilename(taskText)}.md`;
    const fullPath = normalizePath(`${targetPath}${fileName}`);
    const existingFile = app.vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile)
      throw new TaskValidationError(`Task file already exists: ${fullPath}`);
    const file = await app.vault.create(fullPath, "");
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[dateProperty] = dateValue;
      if (startDateValue)
        frontmatter[startDateProperty] = startDateValue;
      frontmatter['status'] = status;
      frontmatter['recurrence'] = recurrence;
      frontmatter['recurrence_id'] = recurrenceId;
      frontmatter['taskText'] = taskText;
    });

    // Then create child task files in the same directory
    for (let i = 1; i < dates.length; i++) {
      const date = dates[i];
      const childFileName = `${sanitizeFilename(taskText)}_${i+1}.md`;
      const childPath = normalizePath(`${targetPath}${childFileName}`);

      const childFile = await app.vault.create(childPath, "");
      await app.fileManager.processFrontMatter(childFile, (frontmatter) => {
        frontmatter['status'] = status;
        frontmatter['recurrence_id'] = recurrenceId;
        frontmatter['taskText'] = taskText;

        if (endDate) {
          // For multi-day events, maintain the same duration
          const duration = DateTime.fromJSDate(endDate).diff(startDateTime);
          const childEndDate = date.plus(duration);
          const formattedStartDate = formatDateForTask(date.toJSDate(), isAllDay, false);
          frontmatter[startDateProperty] = formattedStartDate;
          const formattedEndDate = formatDateForTask(childEndDate.toJSDate(), isAllDay, true);
          frontmatter[dateProperty] = formattedEndDate;
        } else {
          const formattedDate = formatDateForTask(date.toJSDate(), isAllDay, false);
          frontmatter[dateProperty] = formattedDate;
        }
      });
    }

    return true;
  } else {
    // Regular file path, create new tasks with the markdown list format
    // Create child tasks - without duplicating the task text
    const childTasks = dates.map(date => {
      let task = `    - [${status}] [recurrence_id:: ${recurrenceId}]`;
      if (endDate) {
        // For multi-day events, maintain the same duration
        const duration = DateTime.fromJSDate(endDate).diff(startDateTime);
        const childEndDate = date.plus(duration);
        const formattedStartDate = formatDateForTask(date.toJSDate(), isAllDay, false);
        task += ` [${startDateProperty}:: ${formattedStartDate}]`;
        const formattedEndDate = formatDateForTask(childEndDate.toJSDate(), isAllDay, true);
        task += ` [${dateProperty}:: ${formattedEndDate}]`;
      } else {
        const formattedDate = formatDateForTask(date.toJSDate(), isAllDay, false);
        task += ` [${dateProperty}:: ${formattedDate}]`;
      }
      return task;
    });
    let formattedTask = `- [${status}] ${taskText} [recurrence:: ${recurrence}] [recurrence_id:: ${recurrenceId}]`;
    formattedTask += dateValues.listFormatText;
    formattedTask += '\n' + childTasks.join('\n') + '\n';
    return await appendToFile(app.vault, targetPath, formattedTask);
  }
}

/**
 * Creates a new task based on the target path
 * - If target is a file, appends task to that file
 * - If target is a folder, creates a new note with task text as the name and adds frontmatter
 *
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export async function createTask(
  app: App,
  targetPath: string,
  taskText: string,
  status: string,
  startDate: Date | null,
  endDate: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
): Promise<boolean> {
  // Validate inputs
  if (!taskText.trim())
    throw new TaskValidationError("Task text cannot be empty");

  if (!targetPath)
    throw new TaskValidationError("Target path must be specified");

  if (!startDate)
    throw new TaskValidationError("Start date must be specified");

  // Prepare date values for both task formatting and frontmatter
  const dateValues = getDateValues(
    startDate,
    endDate,
    isAllDay,
    startDateProperty,
    dateProperty
  );

  const dateValue = dateValues.dateValue;
  const startDateValue = dateValues.startDateValue;

  // Check if the target path ends with / or \ indicating a folder
  const isFolder = targetPath.endsWith('/') || targetPath.endsWith('\\');

  if (isFolder) {
    // Create a new task with the markdown property format
    const fileName = `${sanitizeFilename(taskText)}.md`;
    const fullPath = normalizePath(`${targetPath}${fileName}`);
    const existingFile = app.vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile)
      throw new TaskValidationError(`Task file already exists: ${fullPath}`);
    const file = await app.vault.create(fullPath, "");
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[dateProperty] = dateValue;
      if (startDateValue)
        frontmatter[startDateProperty] = startDateValue;
      frontmatter['status'] = ' ';
    });
    return true;
  } else {
    // Regular file path, create a new task with the markdown list format
    let formattedTask = `- [${status}] ${taskText}`;
    formattedTask += dateValues.listFormatText;
    formattedTask += '\n';
    return await appendToFile(app.vault, targetPath, formattedTask);
  }
}

/**
 * Sanitize a string to be used as a filename
 * Replaces invalid characters with underscores
 */
export function sanitizeFilename(name: string): string {
  // Trim the name to a reasonable length for a filename (50 chars)
  let sanitized = name.trim().substring(0, 50);

  // Replace characters that aren't allowed in filenames
  sanitized = sanitized.replace(/[\\/:*?"<>|]/g, '_');

  // Ensure the filename is not empty after sanitization
  if (!sanitized) {
    return 'New_Task';
  }

  return sanitized;
}
