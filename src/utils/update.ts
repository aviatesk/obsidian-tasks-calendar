import { Notice, TFile, Vault } from "obsidian";

/**
 * Returns current date formatted as YYYY-MM-DD in local time zone
 *
 * This function ensures the date is formatted based on the user's local time,
 * not UTC, which is important for task completion dates to reflect when
 * the user actually marked the task as complete in their time zone.
 *
 * @returns Formatted date string YYYY-MM-DD
 */
export function getCurrentDateFormatted(): string {
  const now = new Date();

  // Get local date components
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for task properties.
 *
 * @param date The date to format
 * @param isAllDay Whether the event is an all-day event
 * @param isEndDate Whether the date is an end date (needs adjustment for all-day events)
 * @returns Formatted date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM)
 */
function formatDateForTask(date: Date, isAllDay: boolean, isEndDate: boolean): string {
  // Create copy of the date to avoid modifying the original
  let dateToFormat = new Date(date);

  // For all-day events with end dates, subtract one day
  if (isEndDate) {
    dateToFormat = new Date(dateToFormat.getTime() - 24 * 60 * 60 * 1000);
  }

  // Format date as YYYY-MM-DD using local date parts
  const year = dateToFormat.getFullYear();
  const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
  const day = dateToFormat.getDate().toString().padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  // Add time if the event is not an all-day event
  if (!isAllDay) {
    const hours = dateToFormat.getHours().toString().padStart(2, '0');
    const minutes = dateToFormat.getMinutes().toString().padStart(2, '0');
    return `${dateStr}T${hours}:${minutes}`;
  }

  return dateStr;
}

/**
 * Helper function to update or add a date property in a task line
 *
 * @param line Current line text
 * @param property Property name
 * @param formattedDate Formatted date value
 * @returns Updated line text
 */
function updateDateProperty(line: string, property: string, formattedDate: string): string {
  const propertyPattern = new RegExp(`\\[${property}::\\s*[^\\]]*\\]`);
  const updatedProperty = `[${property}:: ${formattedDate}]`;

  if (propertyPattern.test(line)) {
    return line.replace(propertyPattern, updatedProperty);
  } else {
    return `${line} ${updatedProperty}`;
  }
}

/**
 * Removes a specific property from a task line
 *
 * @param line Current line text
 * @param property Property name to remove
 * @returns Updated line with property removed
 */
function removeProperty(line: string, property: string): string {
  const propertyPattern = new RegExp(`\\s*\\[${property}::\\s*[^\\]]*\\]`);
  return line.replace(propertyPattern, '');
}

/**
 * Updates task dates in a file.
 *
 * @param vault The Obsidian vault to access files
 * @param file The file containing the task
 * @param line The line number of the task
 * @param newStart The new start date to set
 * @param newEnd Optional end date to set
 * @param isAllDay Whether the event is an all-day event
 * @param startDateProperty The property name for the start date
 * @param endDateProperty The property name for the end date
 * @param wasAllDay Whether the event was previously an all-day event
 */
export default async function updateTaskDates(
  vault: Vault,
  file: TFile,
  line: number,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  endDateProperty: string,
  wasAllDay: boolean,
): Promise<void> {
  try {
    await vault.process(file, (content) => {
      const lines = content.split('\n');

      if (line >= lines.length) {
        throw new Error(`Line number ${line} exceeds file length (${lines.length} lines)`);
      }

      const taskLine = lines[line];
      let updatedLine = taskLine;

      // Handle conversion from non-all-day to all-day without end date
      if (isAllDay && !wasAllDay && !newEnd) {
        // Remove start date property
        updatedLine = removeProperty(updatedLine, startDateProperty);

        // Update end date property
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        updatedLine = updateDateProperty(updatedLine, endDateProperty, formattedDate);
      }
      // Handle events with both start and end dates
      else if (newEnd) {
        // Update start date property
        const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
        updatedLine = updateDateProperty(updatedLine, startDateProperty, formattedStartDate);

        // Update end date property
        const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
        updatedLine = updateDateProperty(updatedLine, endDateProperty, formattedEndDate);
      }
      // Handle single-date events
      else {
        // Update only end date property
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        updatedLine = updateDateProperty(updatedLine, endDateProperty, formattedDate);
      }

      // Only update the line if there was a change
      if (updatedLine !== taskLine) {
        lines[line] = updatedLine;
        return lines.join('\n');
      }

      // Return original content if no changes were made
      return content;
    });
  } catch (error) {
    console.error("Error updating task dates:", error);
    new Notice(`Failed to update task: ${error.message}`);
    throw error;
  }
}
