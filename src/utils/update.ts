import { Notice, TFile, Vault } from "obsidian";
import {
  parseTask,
  reconstructTask,
  hasEmbeddedTags,
  setTaskProperty,
  removeTaskProperty,
  detectTaskIssues, // Added missing import
  cloneTask // Added missing import
} from "./parse";

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
 * @param wasMultiDay Whether the event was previously a multi-day event
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
  wasMultiDay: boolean = false,  // Add this parameter with a default value
): Promise<void> {
  try {
    // Read the file content
    const content = await vault.read(file);
    const lines = content.split('\n');

    if (line >= lines.length) {
      throw new Error(`Line number ${line} exceeds file length (${lines.length} lines)`);
    }

    const taskLine = lines[line];

    // Parse the task using our new parser
    const parsedTask = parseTask(taskLine);
    if (!parsedTask) {
      throw new Error("Failed to parse task");
    }

    let updatedTask = { ...parsedTask };

    // Handle conversion from non-all-day to all-day without end date
    if (isAllDay && !wasAllDay && !newEnd) {
      // Remove start date property
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);

      // Update end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    }
    // Handle conversion from multi-day to single-day
    else if (wasMultiDay && !newEnd) {
      // Remove start date property - this was previously missing
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);

      // Update end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    }
    // Handle events with both start and end dates
    else if (newEnd) {
      // Update start date property
      const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, startDateProperty, formattedStartDate);

      // Update end date property
      const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedEndDate);
    }
    // Handle single-date events
    else {
      // Update only end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    }

    // Reconstruct the task line
    const updatedLine = reconstructTask(updatedTask);

    // Update file if the line has changed
    if (updatedLine !== taskLine) {
      lines[line] = updatedLine;
      await vault.modify(file, lines.join('\n'));
      new Notice("Task date updated successfully");
    } else
      new Notice("Task date already updated");
  } catch (error) {
    console.error("Error updating task dates:", error);
    new Notice(`Failed to update task: ${error.message}`);
    throw error;
  }
}

/**
 * Updates the text of a task in a file.
 *
 * @param vault The Obsidian vault to access files
 * @param file The file containing the task
 * @param line The line number of the task
 * @param originalText The original task text
 * @param newText The new task text to set
 * @returns Whether the update was successful
 */
export async function updateTaskText(
  vault: Vault,
  file: TFile,
  line: number,
  originalText: string,
  newText: string,
): Promise<boolean> {
  try {
    // Get the full task line from the file
    const content = await vault.read(file);
    const lines = content.split('\n');

    if (line >= lines.length) {
      throw new Error(`Line number ${line} exceeds file length (${lines.length} lines)`);
    }

    const fullTaskLine = lines[line];

    // Parse the task to extract components
    const parsedTask = parseTask(fullTaskLine);

    if (!parsedTask) {
      new Notice("This line doesn't appear to be a valid task. Task format must begin with '- [ ]'.");
      return false;
    }

    // Check for potential issues that would make editing unsafe
    const issues = detectTaskIssues(parsedTask, fullTaskLine);

    // Safety check: Reject if the task has multiple content fragments
    if (issues.hasSplitContent) {
      const fragmentsText = issues.contentFragments.map((f: {text: string}) => `"${f.text}"`).join(", "); // Added type annotation for parameter f
      new Notice(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file to resolve the ambiguity.`);
      return false;
    }

    // Safety check: Reject if the new text contains embedded tags
    if (hasEmbeddedTags(newText)) {
      new Notice("Cannot update task: The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
      return false;
    }

    // Check if we can find the original text in the content
    const contentMatch = parsedTask.content.trim() === originalText.trim();
    const contentIncludes = parsedTask.content.includes(originalText.trim());

    // Create a deep copy of the task to avoid modifying the original
    let updatedTask = cloneTask(parsedTask);

    if (!contentMatch && !contentIncludes) {
      // Cannot find the exact text - try to be helpful in the error message
      if (parsedTask.content.length === 0 && originalText.trim().length === 0) {
        // Both are empty - handle as updating an empty task
        updatedTask.content = newText.trim();
      } else {
        new Notice(`Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${parsedTask.content.trim()}".`);
        return false;
      }
    } else if (contentMatch) {
      // Direct match, simply update the content
      updatedTask.content = newText.trim();
    } else {
      // Partial match - update only the matching part
      updatedTask.content = parsedTask.content.replace(originalText.trim(), newText.trim());
    }

    // Reconstruct the task line with the updated content
    const updatedTaskLine = reconstructTask(updatedTask);

    // Update file if the line has changed
    if (updatedTaskLine !== fullTaskLine) {
      lines[line] = updatedTaskLine;
      await vault.modify(file, lines.join('\n'));
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error updating task text:", error);
    new Notice(`Failed to update task: ${error.message}`);
    return false;
  }
}
