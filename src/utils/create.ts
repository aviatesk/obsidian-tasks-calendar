import { Vault } from 'obsidian';
import { formatDateForTask } from './date';
import { appendToFile } from './file-operations';

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

  // Add a newline at the end
  formattedTask += '\n';

  // Append the task to the file
  return await appendToFile(vault, targetFilePath, formattedTask);
}
