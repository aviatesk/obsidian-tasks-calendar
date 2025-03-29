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

  // Create parent task with recurrence rule
  let parentTask = `- [${status}] ${taskText} [recurrence:: ${formatRecurrenceRule(recurrenceRule)}] [recurrence_id:: ${recurrenceId}]`;

  // Format date properties for parent task
  if (startDate && !endDate && isAllDay) {
    const formattedDate = formatDateForTask(startDate, isAllDay, false);
    parentTask += ` [${dateProperty}:: ${formattedDate}]`;
  }
  else if (startDate && endDate) {
    const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
    parentTask += ` [${startDateProperty}:: ${formattedStartDate}]`;
    const formattedEndDate = formatDateForTask(endDate, isAllDay, true);
    parentTask += ` [${dateProperty}:: ${formattedEndDate}]`;
  }
  else if (startDate) {
    const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
    parentTask += ` [${dateProperty}:: ${formattedStartDate}]`;
  }

  // Generate recurrence dates
  const startDateTime = DateTime.fromJSDate(startDate);
  const dates = generateRecurrenceDates(startDateTime, recurrenceRule);

  // Create child tasks
  const childTasks = dates.map(date => {
    let task = `    - [${status}] ${taskText} [recurrence_id:: ${recurrenceId}]`;

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

  // Combine parent and child tasks
  const formattedTask = parentTask + '\n' + childTasks.join('\n') + '\n';

  // Check if the target path ends with / or \ indicating a folder
  const isFolder = targetPath.endsWith('/') || targetPath.endsWith('\\');

  if (isFolder) {
    // Create a new note in the folder with task text as the name
    const fileName = `${sanitizeFilename(taskText)}.md`;
    const fullPath = normalizePath(`${targetPath}${fileName}`);

    // Check if file already exists
    const existingFile = app.vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile) {
      // If file exists, append the task to it
      return await appendToFile(app.vault, fullPath, formattedTask);
    } else {
      const file = await app.vault.create(fullPath, "");
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (endDate) {
          frontmatter[startDateProperty] = formatDateForTask(startDate, isAllDay, false);
          frontmatter[dateProperty] = formatDateForTask(endDate, isAllDay, true);
        } else {
          frontmatter[dateProperty] = formatDateForTask(startDate, isAllDay, false);
        }
        frontmatter['status'] = status;
        frontmatter['recurrence'] = formatRecurrenceRule(recurrenceRule);
        frontmatter['recurrence_id'] = recurrenceId;
      });
      return true;
    }
  } else {
    // Regular file path, just append the task
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
  if (!taskText.trim()) {
    throw new TaskValidationError("Task text cannot be empty");
  }

  if (!targetPath) {
    throw new TaskValidationError("Target path must be specified");
  }

  // Format the task with proper markdown syntax
  let formattedTask = `- [${status}] ${taskText}`;

  // Prepare date values for both task formatting and frontmatter
  let dueDate: string | null = null;
  let startDateVal: string | null = null;

  // Format date properties exactly as before
  if (startDate && !endDate && isAllDay) {
    const formattedDate = formatDateForTask(startDate, isAllDay, false);
    formattedTask += ` [${dateProperty}:: ${formattedDate}]`;
    dueDate = formattedDate;
  }
  else if (startDate && endDate) {
    const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
    formattedTask += ` [${startDateProperty}:: ${formattedStartDate}]`;
    startDateVal = formattedStartDate;

    const formattedEndDate = formatDateForTask(endDate, isAllDay, true);
    formattedTask += ` [${dateProperty}:: ${formattedEndDate}]`;
    dueDate = formattedEndDate;
  }
  else if (startDate) {
    const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
    formattedTask += ` [${dateProperty}:: ${formattedStartDate}]`;
    dueDate = formattedStartDate;
  }

  // Add a newline at the end
  formattedTask += '\n';

  // Check if the target path ends with / or \ indicating a folder
  const isFolder = targetPath.endsWith('/') || targetPath.endsWith('\\');

  if (isFolder) {
    // Create a new note in the folder with task text as the name
    const fileName = `${sanitizeFilename(taskText)}.md`;
    const fullPath = normalizePath(`${targetPath}${fileName}`);

    // Check if file already exists
    const existingFile = app.vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile) {
      // If file exists, append the task to it
      return await appendToFile(app.vault, fullPath, formattedTask);
    } else {
      const file = await app.vault.create(fullPath, "");
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[dateProperty] = dueDate;
        if (startDateVal)
          frontmatter[startDateProperty] = startDateVal;
        frontmatter['status'] = ' ';
      });
      return true;
    }
  } else {
    // Regular file path, just append the task
    return await appendToFile(app.vault, targetPath, formattedTask);
  }
}

/**
 * Sanitize a string to be used as a filename
 * Replaces invalid characters with underscores
 */
function sanitizeFilename(name: string): string {
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
