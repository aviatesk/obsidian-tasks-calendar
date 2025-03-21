import { Notice, TFile, Vault } from "obsidian";
import {
  parseTask,
  reconstructTask,
  hasEmbeddedTags,
  setTaskProperty,
  removeTaskProperty,
  detectTaskIssues,
  cloneTask
} from "./parse";
import { getCurrentDateFormatted, formatDateForTask } from "./date";
import { processFileLine } from "./file-operations";
import { STATUS_OPTIONS } from "./status";

/**
 * Update task status in Obsidian document
 *
 * @param vault Obsidian vault instance
 * @param file Target file
 * @param line Line number of the task
 * @param newStatus New status value
 */
export async function updateTaskStatus(
  vault: Vault,
  file: TFile,
  line: number,
  newStatus: string
): Promise<void> {
  try {
    const result = await processFileLine(vault, file, line, (taskLine) => {
      // Parse the task using our parser
      const parsedTask = parseTask(taskLine);

      // Verify line contains a valid task
      if (!parsedTask) {
        throw new Error(`Line ${line} is not a valid task`);
      }

      // Get the current status and find options
      const currentStatus = parsedTask.status;
      const oldStatusOption = STATUS_OPTIONS.find(option => option.value === currentStatus);
      const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

      const oldProp = oldStatusOption?.prop;
      const newProp = newStatusOption?.prop;

      // Update the task status
      let updatedTask = cloneTask(parsedTask);
      updatedTask.status = newStatus;

      // Only remove old property if:
      // 1. It exists
      // 2. It's different from the new property
      // 3. The new status does NOT have preserveOldProp set to true
      if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
        // Remove old property using our helper function
        updatedTask = removeTaskProperty(updatedTask, oldProp);
      }

      // Add new property if needed
      if (newProp) {
        const currentDate = getCurrentDateFormatted();
        updatedTask = setTaskProperty(updatedTask, newProp, currentDate);
      }

      // Reconstruct and return the updated task line
      return reconstructTask(updatedTask);
    });

    if (!result.changed) {
      // Task was already in the desired state
      new Notice("Task status already set to the requested value");
    }
  } catch (error) {
    console.error("Error updating task status:", error);
    new Notice(`Failed to update task status: ${error.message}`);
    throw error;
  }
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
  wasMultiDay: boolean = false,
): Promise<void> {
  try {
    const result = await processFileLine(vault, file, line, (taskLine) => {
      // Parse the task using our parser
      const parsedTask = parseTask(taskLine);
      if (!parsedTask) {
        throw new Error("Failed to parse task");
      }

      let updatedTask = cloneTask(parsedTask);

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
        // Remove start date property
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

      // Reconstruct and return the updated task line
      return reconstructTask(updatedTask);
    });

    if (result.changed) {
      new Notice("Task date updated successfully");
    } else {
      new Notice("Task date already up to date");
    }
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
    const result = await processFileLine(vault, file, line, (taskLine) => {
      // Parse the task to extract components
      const parsedTask = parseTask(taskLine);

      if (!parsedTask) {
        throw new Error("This line doesn't appear to be a valid task. Task format must begin with '- [ ]'.");
      }

      // Check for potential issues that would make editing unsafe
      const issues = detectTaskIssues(parsedTask, taskLine);

      // Safety check: Reject if the task has multiple content fragments
      if (issues.hasSplitContent) {
        const fragmentsText = issues.contentFragments.map((f: {text: string}) => `"${f.text}"`).join(", ");
        throw new Error(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file to resolve the ambiguity.`);
      }

      // Safety check: Reject if the new text contains embedded tags
      if (hasEmbeddedTags(newText)) {
        throw new Error("Cannot update task: The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
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
          throw new Error(`Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${parsedTask.content.trim()}".`);
        }
      } else if (contentMatch) {
        // Direct match, simply update the content
        updatedTask.content = newText.trim();
      } else {
        // Partial match - update only the matching part
        updatedTask.content = parsedTask.content.replace(originalText.trim(), newText.trim());
      }

      // Reconstruct and return the updated task line
      return reconstructTask(updatedTask);
    });

    if (!result.changed) {
      // Text was already updated or an error was thrown
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error updating task text:", error);
    new Notice(`Failed to update task: ${error.message}`);
    return false;
  }
}
