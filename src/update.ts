import { TFile, Vault } from "obsidian";

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
    // Read the file content once
    const content = await vault.read(file);
    const lines = content.split('\n');

    if (line >= lines.length) {
      throw new Error(`Invalid line number: ${line}`);
    }

    const taskLine = lines[line];
    let updatedLine = taskLine;

    // Handle conversion from non-all-day to all-day without end date
    if (isAllDay && !wasAllDay && !newEnd) {
      // Remove start date property
      const startPropertyPattern = new RegExp(`\\s*\\[${startDateProperty}::\\s*[^\\]]*\\]`);
      updatedLine = updatedLine.replace(startPropertyPattern, '');

      // Update end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      const endPropertyPattern = new RegExp(`\\[${endDateProperty}::\\s*[^\\]]*\\]`);
      const updatedEndProperty = `[${endDateProperty}:: ${formattedDate}]`;

      if (endPropertyPattern.test(updatedLine)) {
        updatedLine = updatedLine.replace(endPropertyPattern, updatedEndProperty);
      } else {
        updatedLine += ` ${updatedEndProperty}`;
      }
    }
    // Handle events with both start and end dates
    else if (newEnd) {
      // Update start date property
      const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
      const startPropertyPattern = new RegExp(`\\[${startDateProperty}::\\s*[^\\]]*\\]`);
      const updatedStartProperty = `[${startDateProperty}:: ${formattedStartDate}]`;

      if (startPropertyPattern.test(updatedLine)) {
        updatedLine = updatedLine.replace(startPropertyPattern, updatedStartProperty);
      } else {
        updatedLine += ` ${updatedStartProperty}`;
      }

      // Update end date property
      const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
      const endPropertyPattern = new RegExp(`\\[${endDateProperty}::\\s*[^\\]]*\\]`);
      const updatedEndProperty = `[${endDateProperty}:: ${formattedEndDate}]`;

      if (endPropertyPattern.test(updatedLine)) {
        updatedLine = updatedLine.replace(endPropertyPattern, updatedEndProperty);
      } else {
        updatedLine += ` ${updatedEndProperty}`;
      }
    }
    // Handle single-date events
    else {
      // Update only end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      const endPropertyPattern = new RegExp(`\\[${endDateProperty}::\\s*[^\\]]*\\]`);
      const updatedEndProperty = `[${endDateProperty}:: ${formattedDate}]`;

      if (endPropertyPattern.test(updatedLine)) {
        updatedLine = updatedLine.replace(endPropertyPattern, updatedEndProperty);
      } else {
        updatedLine += ` ${updatedEndProperty}`;
      }
    }

    // Only write to the file if there was a change
    if (updatedLine !== taskLine) {
      lines[line] = updatedLine;
      await vault.modify(file, lines.join('\n'));
    }
  } catch (error) {
    console.error("Error updating task dates:", error);
    throw error;
  }
}
