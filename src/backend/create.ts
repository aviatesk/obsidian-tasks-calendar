import { App, TFile, normalizePath } from 'obsidian';
import { formatDateForTask } from './date';
import { appendToFile } from './file-operations';
import { TaskValidationError } from './error-handling';

/**
 * Creates a new task based on the target path
 * - If target is a file, appends task to that file
 * - If target is a folder, creates a new note with task text as the name and adds frontmatter
 *
 * @returns The path of the file the task was written to
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
): Promise<string> {
  // Validate inputs
  if (!taskText.trim()) {
    throw new TaskValidationError('Task text cannot be empty');
  }

  if (!targetPath) {
    throw new TaskValidationError('Target path must be specified');
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
  } else if (startDate && endDate) {
    const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
    formattedTask += ` [${startDateProperty}:: ${formattedStartDate}]`;
    startDateVal = formattedStartDate;

    const formattedEndDate = formatDateForTask(endDate, isAllDay, true);
    formattedTask += ` [${dateProperty}:: ${formattedEndDate}]`;
    dueDate = formattedEndDate;
  } else if (startDate) {
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
      await appendToFile(app.vault, fullPath, formattedTask);
      return fullPath;
    } else {
      const file = await app.vault.create(fullPath, '');
      await app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter[dateProperty] = dueDate;
        if (startDateVal) frontmatter[startDateProperty] = startDateVal;
        frontmatter['status'] = ' ';
      });
      return file.path;
    }
  } else {
    // Regular file path, just append the task
    await appendToFile(app.vault, targetPath, formattedTask);
    return normalizePath(targetPath);
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
