import { Vault, TFile } from 'obsidian';

/**
 * Creates a new task in the specified file
 */
export async function createTask(
  vault: Vault,
  targetFilePath: string,
  taskText: string,
  status: string,
  startDate: Date | null,
  endDate: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
): Promise<boolean> {
  try {
    // Check if file exists first
    let file = vault.getAbstractFileByPath(targetFilePath);

    // Create file if it doesn't exist
    if (!file) {
      try {
        // Create necessary directories
        const folders = targetFilePath.split('/');
        if (folders.length > 1) {
          const dirPath = folders.slice(0, -1).join('/');
          await ensureDirectory(vault, dirPath);
        }

        // Create the file
        file = await vault.create(targetFilePath, '');
      } catch (error) {
        console.error("Failed to create file:", error);
        return false;
      }
    }

    // Verify file is valid
    if (!(file instanceof TFile)) {
      console.error(`${targetFilePath} is not a valid file`);
      return false;
    }

    // Format the task and append it to the file
    await vault.process(file, (fileContent) => {
      // Format the task with proper markdown syntax
      let formattedTask = `- [${status}] ${taskText}`;

      // Single day, all-day event uses only the due date property
      if (startDate && !endDate && isAllDay) {
        const formattedDate = formatDateForTask(startDate, isAllDay, false);
        formattedTask += ` [${dateProperty}:: ${formattedDate}]`;
      }
      // Event with both start and end dates
      else if (startDate && endDate) {
        const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
        formattedTask += ` [${startDateProperty}:: ${formattedStartDate}]`;

        const formattedEndDate = formatDateForTask(endDate, isAllDay, true);
        formattedTask += ` [${dateProperty}:: ${formattedEndDate}]`;
      }
      // Just start date with no end date
      else if (startDate) {
        const formattedStartDate = formatDateForTask(startDate, isAllDay, false);
        formattedTask += ` [${dateProperty}:: ${formattedStartDate}]`;
      }

      // Add a newline at the end and append to the file content
      formattedTask += '\n';
      return fileContent + formattedTask;
    });

    return true;
  } catch (error) {
    console.error("Failed to create task:", error);
    return false;
  }
}

/**
 * Formats a date for inclusion in a task, handling all-day events correctly
 *
 * @param date The date to format
 * @param isAllDay Whether the event is an all-day event
 * @param isEndDate Whether the date is an end date (needs adjustment for all-day events)
 * @returns Formatted date string
 */
function formatDateForTask(date: Date, isAllDay: boolean, isEndDate: boolean): string {
  // Create copy of the date to avoid modifying the original
  let dateToFormat = new Date(date);

  // For all-day events with end dates, subtract one day to align with calendar display
  if (isAllDay && isEndDate) {
    dateToFormat = new Date(dateToFormat.getTime() - 24 * 60 * 60 * 1000);
  }

  if (isAllDay) {
    // Format as YYYY-MM-DD for all-day events
    const year = dateToFormat.getFullYear();
    const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
    const day = dateToFormat.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    // For events with time, use ISO format but ensure it's in local timezone
    const year = dateToFormat.getFullYear();
    const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
    const day = dateToFormat.getDate().toString().padStart(2, '0');
    const hours = dateToFormat.getHours().toString().padStart(2, '0');
    const minutes = dateToFormat.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}

/**
 * Ensures a directory exists, creating it and parent directories if needed
 */
async function ensureDirectory(vault: Vault, dirPath: string): Promise<void> {
  const dirs = dirPath.split('/').filter(dir => dir.length > 0);
  let currentPath = '';

  for (const dir of dirs) {
    currentPath += (currentPath ? '/' : '') + dir;
    const exists = vault.getAbstractFileByPath(currentPath);
    if (!exists) {
      await vault.createFolder(currentPath);
    }
  }
}
