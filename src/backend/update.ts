import { App, TFile } from "obsidian";
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
import { processFileLine, renameFile } from "./file-operations";
import { STATUS_OPTIONS } from "./status";
import { TaskValidationError } from "./error-handling";
import { DateTime } from "luxon";
import {
  getRecurrenceId,
  isRecurrenceChild,
  isRecurrenceParent,
  RecurrenceRule,
  formatRecurrenceRule,
  generateRecurrenceDates
} from "./recurrence";

/**
 * Updates all tasks in a recurrence group with new status
 */
export async function updateRecurrenceGroupStatus(
  app: App,
  file: TFile,
  recurrenceId: string,
  newStatus: string
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let updatedLine = line;

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        let updatedTask = cloneTask(task);
        updatedTask.status = newStatus;

        // Handle status-related properties
        const oldStatusOption = STATUS_OPTIONS.find(option => option.value === task.status);
        const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

        const oldProp = oldStatusOption?.prop;
        const newProp = newStatusOption?.prop;

        if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
          updatedTask = removeTaskProperty(updatedTask, oldProp);
        }

        if (newProp) {
          const currentDate = getCurrentDateFormatted();
          updatedTask = setTaskProperty(updatedTask, newProp, currentDate);
        }

        updatedLine = reconstructTask(updatedTask);
        changed = true;
      }
    } catch (error) {
      // Not a task line, keep original
    }

    newContent += updatedLine + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        const oldStatusOption = STATUS_OPTIONS.find(option => option.value === frontmatter.status);
        const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

        const oldProp = oldStatusOption?.prop;
        const newProp = newStatusOption?.prop;

        frontmatter.status = newStatus;

        if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
          delete frontmatter[oldProp];
        }

        if (newProp) {
          frontmatter[newProp] = getCurrentDateFormatted();
        }
      }
    });
  }

  return changed;
}

/**
 * Updates tasks in a recurrence group after a specific date with new status
 */
export async function updateRecurrenceStatusAfter(
  app: App,
  file: TFile,
  recurrenceId: string,
  afterDate: DateTime,
  newStatus: string,
  dateProperty: string
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let updatedLine = line;

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                        task.propertiesBeforeContent.get(dateProperty);

        if (taskDate) {
          const date = DateTime.fromISO(taskDate);
          if (date > afterDate) {
            let updatedTask = cloneTask(task);
            updatedTask.status = newStatus;

            const oldStatusOption = STATUS_OPTIONS.find(option => option.value === task.status);
            const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

            const oldProp = oldStatusOption?.prop;
            const newProp = newStatusOption?.prop;

            if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
              updatedTask = removeTaskProperty(updatedTask, oldProp);
            }

            if (newProp) {
              updatedTask = setTaskProperty(updatedTask, newProp, getCurrentDateFormatted());
            }

            updatedLine = reconstructTask(updatedTask);
            changed = true;
          }
        }
      }
    } catch (error) {
      // Not a task line or invalid date, keep original
    }

    newContent += updatedLine + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        const taskDate = frontmatter[dateProperty];
        if (taskDate) {
          const date = DateTime.fromISO(taskDate);
          if (date > afterDate) {
            const oldStatusOption = STATUS_OPTIONS.find(option => option.value === frontmatter.status);
            const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

            const oldProp = oldStatusOption?.prop;
            const newProp = newStatusOption?.prop;

            frontmatter.status = newStatus;

            if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
              delete frontmatter[oldProp];
            }

            if (newProp) {
              frontmatter[newProp] = getCurrentDateFormatted();
            }
          }
        }
      }
    });
  }

  return changed;
}

/**
 * Updates all tasks in a recurrence group with new dates and rule
 */
export async function updateRecurrenceGroupDates(
  app: App,
  file: TFile,
  recurrenceId: string,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string,
  newRule: RecurrenceRule
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let changed = false;
  let foundParent = false;

  // Generate new dates
  const startDateTime = DateTime.fromJSDate(newStart);
  const dates = generateRecurrenceDates(startDateTime, newRule);
  let dateIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let updatedLine = line;

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        if (isRecurrenceParent(task)) {
          foundParent = true;
          let updatedTask = cloneTask(task);
          updatedTask = setTaskProperty(updatedTask, 'recurrence', formatRecurrenceRule(newRule));

          if (newEnd) {
            const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
            updatedTask = setTaskProperty(updatedTask, startDateProperty, formattedStartDate);
            const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
            updatedTask = setTaskProperty(updatedTask, dateProperty, formattedEndDate);
          } else {
            const formattedDate = formatDateForTask(newStart, isAllDay, false);
            updatedTask = removeTaskProperty(updatedTask, startDateProperty);
            updatedTask = setTaskProperty(updatedTask, dateProperty, formattedDate);
          }

          updatedLine = reconstructTask(updatedTask);
          changed = true;
        } else if (isRecurrenceChild(task) && dateIndex < dates.length) {
          let updatedTask = cloneTask(task);
          const date = dates[dateIndex];

          if (newEnd) {
            const duration = DateTime.fromJSDate(newEnd).diff(startDateTime);
            const childEndDate = date.plus(duration);

            const formattedStartDate = formatDateForTask(date.toJSDate(), isAllDay, false);
            updatedTask = setTaskProperty(updatedTask, startDateProperty, formattedStartDate);

            const formattedEndDate = formatDateForTask(childEndDate.toJSDate(), isAllDay, true);
            updatedTask = setTaskProperty(updatedTask, dateProperty, formattedEndDate);
          } else {
            const formattedDate = formatDateForTask(date.toJSDate(), isAllDay, false);
            updatedTask = removeTaskProperty(updatedTask, startDateProperty);
            updatedTask = setTaskProperty(updatedTask, dateProperty, formattedDate);
          }

          updatedLine = reconstructTask(updatedTask);
          changed = true;
          dateIndex++;
        }
      }
    } catch (error) {
      // Not a task line, keep original
    }

    newContent += updatedLine + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    if (foundParent) {
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (frontmatter['recurrence_id'] === recurrenceId) {
          frontmatter['recurrence'] = formatRecurrenceRule(newRule);
          if (newEnd) {
            frontmatter[startDateProperty] = formatDateForTask(newStart, isAllDay, false);
            frontmatter[dateProperty] = formatDateForTask(newEnd, isAllDay, true);
          } else {
            delete frontmatter[startDateProperty];
            frontmatter[dateProperty] = formatDateForTask(newStart, isAllDay, false);
          }
        }
      });
    }
  }

  return changed;
}

/**
 * Updates tasks in a recurrence group after a specific date with new dates and rule
 */
export async function updateRecurrenceDatesAfter(
  app: App,
  file: TFile,
  recurrenceId: string,
  afterDate: DateTime,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string,
  newRule: RecurrenceRule
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let changed = false;
  let foundParent = false;

  // Generate new dates starting from afterDate
  const startDateTime = afterDate;
  const dates = generateRecurrenceDates(startDateTime, newRule);
  let dateIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let updatedLine = line;

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        if (isRecurrenceParent(task)) {
          foundParent = true;
          let updatedTask = cloneTask(task);
          updatedTask = setTaskProperty(updatedTask, 'recurrence', formatRecurrenceRule(newRule));
          updatedLine = reconstructTask(updatedTask);
          changed = true;
        } else if (isRecurrenceChild(task)) {
          const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                          task.propertiesBeforeContent.get(dateProperty);

          if (taskDate) {
            const date = DateTime.fromISO(taskDate);
            if (date > afterDate && dateIndex < dates.length) {
              let updatedTask = cloneTask(task);
              const newDate = dates[dateIndex];

              if (newEnd) {
                const duration = DateTime.fromJSDate(newEnd).diff(DateTime.fromJSDate(newStart));
                const childEndDate = newDate.plus(duration);

                const formattedStartDate = formatDateForTask(newDate.toJSDate(), isAllDay, false);
                updatedTask = setTaskProperty(updatedTask, startDateProperty, formattedStartDate);

                const formattedEndDate = formatDateForTask(childEndDate.toJSDate(), isAllDay, true);
                updatedTask = setTaskProperty(updatedTask, dateProperty, formattedEndDate);
              } else {
                const formattedDate = formatDateForTask(newDate.toJSDate(), isAllDay, false);
                updatedTask = removeTaskProperty(updatedTask, startDateProperty);
                updatedTask = setTaskProperty(updatedTask, dateProperty, formattedDate);
              }

              updatedLine = reconstructTask(updatedTask);
              changed = true;
              dateIndex++;
            }
          }
        }
      }
    } catch (error) {
      // Not a task line or invalid date, keep original
    }

    newContent += updatedLine + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    if (foundParent) {
      await app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (frontmatter['recurrence_id'] === recurrenceId) {
          frontmatter['recurrence'] = formatRecurrenceRule(newRule);
          const taskDate = frontmatter[dateProperty];
          if (taskDate) {
            const date = DateTime.fromISO(taskDate);
            if (date > afterDate) {
              if (newEnd) {
                frontmatter[startDateProperty] = formatDateForTask(newStart, isAllDay, false);
                frontmatter[dateProperty] = formatDateForTask(newEnd, isAllDay, true);
              } else {
                delete frontmatter[startDateProperty];
                frontmatter[dateProperty] = formatDateForTask(newStart, isAllDay, false);
              }
            }
          }
        }
      });
    }
  }

  return changed;
}

/**
 * Updates all tasks in a recurrence group with new text
 */
export async function updateRecurrenceGroupText(
  app: App,
  file: TFile,
  recurrenceId: string,
  originalText: string,
  newText: string
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let updatedLine = line;

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        // Check for potential issues
        const issues = detectTaskIssues(task, line);
        if (issues.hasSplitContent) {
          const fragmentsText = issues.contentFragments.map(f => `"${f.text}"`).join(", ");
          throw new TaskValidationError(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file.`);
        }

        if (hasEmbeddedTags(newText)) {
          throw new TaskValidationError("The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
        }

        const contentMatch = task.content.trim() === originalText.trim();
        const contentIncludes = task.content.includes(originalText.trim());

        let updatedTask = cloneTask(task);

        if (!contentMatch && !contentIncludes) {
          if (task.content.length === 0 && originalText.trim().length === 0) {
            updatedTask.content = newText.trim();
          } else {
            throw new TaskValidationError(`Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${task.content.trim()}".`);
          }
        } else if (contentMatch) {
          updatedTask.content = newText.trim();
        } else {
          updatedTask.content = task.content.replace(originalText.trim(), newText.trim());
        }

        updatedLine = reconstructTask(updatedTask);
        changed = true;
      }
    } catch (error) {
      if (error instanceof TaskValidationError) {
        throw error;
      }
      // Not a task line, keep original
    }

    newContent += updatedLine + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        const title = frontmatter['title'];
        if (title && title.trim() === originalText.trim()) {
          frontmatter['title'] = newText.trim();
        }
      }
    });
  }

  return changed;
}

/**
 * Update task status in Obsidian document
 *
 * @param app Obsidian app instance
 * @param file Target file
 * @param line Line number of the task (undefined for frontmatter)
 * @param newStatus New status value
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export async function updateTaskStatus(
  app: App,
  file: TFile,
  line: number | undefined,
  newStatus: string
): Promise<void> {
  // Handle frontmatter task property
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      // Get current status
      const currentStatus = frontmatter.status || '';

      // Find status options
      const oldStatusOption = STATUS_OPTIONS.find(option => option.value === currentStatus);
      const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

      const oldProp = oldStatusOption?.prop;
      const newProp = newStatusOption?.prop;

      // Update status
      frontmatter.status = newStatus;

      // Handle old property
      if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
        delete frontmatter[oldProp];
      }

      // Add new property if needed
      if (newProp) {
        const currentDate = getCurrentDateFormatted();
        frontmatter[newProp] = currentDate;
      }
    });
  } else {
    // Handle regular inline task
    await processFileLine(app.vault, file, line, (taskLine) => {
      // Parse the task using our parser - may throw TaskValidationError
      const parsedTask = parseTask(taskLine);

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
  }
}

/**
 * Updates task dates in a file.
 *
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export default async function updateTaskDates(
  app: App,
  file: TFile,
  line: number | undefined,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  endDateProperty: string,
  wasAllDay: boolean,
  wasMultiDay: boolean = false,
): Promise<void> {
  // Handle frontmatter task property
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      // Handle conversion from non-all-day to all-day without end date
      if (isAllDay && !wasAllDay && !newEnd) {
        // Remove start date property
        delete frontmatter[startDateProperty];

        // Update end date property
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      }
      // Handle conversion from multi-day to single-day
      else if (wasMultiDay && !newEnd) {
        // Remove start date property
        delete frontmatter[startDateProperty];

        // Update end date property
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      }
      // Handle events with both start and end dates
      else if (newEnd) {
        // Update start date property
        const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[startDateProperty] = formattedStartDate;

        // Update end date property
        const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
        frontmatter[endDateProperty] = formattedEndDate;
      }
      // Handle single-date events
      else {
        // Update only end date property
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      }
    });
    return;
  }

  // Handle regular inline task
  await processFileLine(app.vault, file, line, (taskLine) => {
    // Parse the task using our parser - may throw TaskValidationError
    const parsedTask = parseTask(taskLine);

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
}

/**
 * Updates the text of a task in a file.
 *
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export async function updateTaskText(
  app: App,
  file: TFile,
  line: number | undefined,
  originalText: string,
  newText: string,
): Promise<string|undefined> {
  // Handle frontmatter task property
  if (line === undefined) {
    return await renameFile(app, file, newText.trim());
  }

  // Handle regular inline task
  const result = await processFileLine(app.vault, file, line, (taskLine) => {
    // Parse the task to extract components - may throw TaskValidationError
    const parsedTask = parseTask(taskLine);

    // Check for potential issues that would make editing unsafe
    const issues = detectTaskIssues(parsedTask, taskLine);

    // Safety check: Reject if the task has multiple content fragments
    if (issues.hasSplitContent) {
      const fragmentsText = issues.contentFragments.map((f: {text: string}) => `"${f.text}"`).join(", ");
      throw new TaskValidationError(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file.`);
    }

    // Safety check: Reject if the new text contains embedded tags
    if (hasEmbeddedTags(newText)) {
      throw new TaskValidationError("The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
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
        throw new TaskValidationError(`Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${parsedTask.content.trim()}".`);
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

  return result.changed ? file.path : undefined;
}
