import { App, TFile } from 'obsidian';
import {
  parseTask,
  reconstructTask,
  hasEmbeddedTags,
  setTaskProperty,
  removeTaskProperty,
  detectTaskIssues,
  cloneTask,
} from './parse';
import { getCurrentDateFormatted, formatDateForTask } from './date';
import {
  processFileLine,
  processFileLineWithInsert,
  renameFile,
} from './file-operations';
import { STATUS_OPTIONS } from './status';
import { TaskValidationError } from './error-handling';
import {
  buildRecurringTaskLine,
  buildRecurringFrontmatter,
} from './recurrence';

export interface UpdateStatusResult {
  recurringTaskCreated: boolean;
}

/**
 * Update task status in Obsidian document.
 *
 * When a recurring task is completed, a new task instance is automatically
 * created with the next due date.
 */
export async function updateTaskStatus(
  app: App,
  file: TFile,
  line: number | undefined,
  newStatus: string,
  dateProperty: string,
  startDateProperty: string
): Promise<UpdateStatusResult> {
  const result: UpdateStatusResult = { recurringTaskCreated: false };

  if (line === undefined) {
    await updateFrontmatterTaskStatus(
      app,
      file,
      newStatus,
      dateProperty,
      startDateProperty,
      result
    );
  } else {
    await updateInlineTaskStatus(
      app,
      file,
      line,
      newStatus,
      dateProperty,
      startDateProperty,
      result
    );
  }

  return result;
}

function applyStatusChange(
  currentStatus: string,
  newStatus: string,
  frontmatter: Record<string, unknown>
): void {
  const oldStatusOption = STATUS_OPTIONS.find(o => o.value === currentStatus);
  const newStatusOption = STATUS_OPTIONS.find(o => o.value === newStatus);

  const oldProp = oldStatusOption?.prop;
  const newProp = newStatusOption?.prop;

  frontmatter.status = newStatus;

  if (
    oldProp &&
    oldProp !== newProp &&
    newStatusOption?.preserveOldProp !== true
  ) {
    delete frontmatter[oldProp];
  }

  if (newProp) {
    frontmatter[newProp] = getCurrentDateFormatted();
  }
}

async function updateFrontmatterTaskStatus(
  app: App,
  file: TFile,
  newStatus: string,
  dateProperty: string,
  startDateProperty: string,
  result: UpdateStatusResult
): Promise<void> {
  let savedFrontmatter: Record<string, unknown> | null = null;

  await app.fileManager.processFrontMatter(file, frontmatter => {
    const currentStatus = (frontmatter.status as string) || '';
    applyStatusChange(currentStatus, newStatus, frontmatter);

    if (
      isCompletionStatus(newStatus) &&
      typeof frontmatter.recurrence === 'string'
    ) {
      savedFrontmatter = { ...frontmatter };
    }
  });

  if (!savedFrontmatter) return;

  const content = await app.vault.read(file);
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : '';

  const recurring = buildRecurringFrontmatter(
    savedFrontmatter,
    body,
    dateProperty,
    startDateProperty
  );
  if (!recurring) return;

  const nextDueDate = recurring.frontmatter[dateProperty] as string;
  const safeDueDate = nextDueDate.split('T')[0];
  const originalName = file.basename;
  const parentPath = file.parent ? file.parent.path + '/' : '';
  const newFileName = `${originalName} (${safeDueDate})`;
  const newFilePath = `${parentPath}${newFileName}.${file.extension}`;

  const newFile = await app.vault.create(newFilePath, recurring.body);
  await app.fileManager.processFrontMatter(newFile, fm => {
    Object.assign(fm, recurring.frontmatter);
  });

  result.recurringTaskCreated = true;
}

async function updateInlineTaskStatus(
  app: App,
  file: TFile,
  line: number,
  newStatus: string,
  dateProperty: string,
  startDateProperty: string,
  result: UpdateStatusResult
): Promise<void> {
  const needsRecurrence = isCompletionStatus(newStatus);

  if (needsRecurrence) {
    await processFileLineWithInsert(app.vault, file, line, taskLine => {
      const updatedLine = applyInlineStatusChange(taskLine, newStatus);

      const parsedCompleted = parseTask(updatedLine);
      const newTaskLine = buildRecurringTaskLine(
        parsedCompleted,
        dateProperty,
        startDateProperty
      );

      if (newTaskLine) {
        result.recurringTaskCreated = true;
      }

      return {
        updated: updatedLine,
        insertAfter: newTaskLine ?? undefined,
      };
    });
  } else {
    await processFileLine(app.vault, file, line, taskLine => {
      return applyInlineStatusChange(taskLine, newStatus);
    });
  }
}

function applyInlineStatusChange(taskLine: string, newStatus: string): string {
  const parsedTask = parseTask(taskLine);

  const currentStatus = parsedTask.status;
  const oldStatusOption = STATUS_OPTIONS.find(o => o.value === currentStatus);
  const newStatusOption = STATUS_OPTIONS.find(o => o.value === newStatus);

  const oldProp = oldStatusOption?.prop;
  const newProp = newStatusOption?.prop;

  let updatedTask = cloneTask(parsedTask);
  updatedTask.status = newStatus;

  if (
    oldProp &&
    oldProp !== newProp &&
    newStatusOption?.preserveOldProp !== true
  ) {
    updatedTask = removeTaskProperty(updatedTask, oldProp);
  }

  if (newProp) {
    updatedTask = setTaskProperty(
      updatedTask,
      newProp,
      getCurrentDateFormatted()
    );
  }

  return reconstructTask(updatedTask);
}

function isCompletionStatus(status: string): boolean {
  return status === 'x' || status === 'X';
}

export async function updateTaskRecurrence(
  app: App,
  file: TFile,
  line: number | undefined,
  newRecurrence: string
): Promise<void> {
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, frontmatter => {
      if (newRecurrence) {
        frontmatter.recurrence = newRecurrence;
      } else {
        delete frontmatter.recurrence;
      }
    });
    return;
  }

  await processFileLine(app.vault, file, line, taskLine => {
    const parsedTask = parseTask(taskLine);
    let updatedTask = cloneTask(parsedTask);
    if (newRecurrence) {
      updatedTask = setTaskProperty(updatedTask, 'recurrence', newRecurrence);
    } else {
      updatedTask = removeTaskProperty(updatedTask, 'recurrence');
    }
    return reconstructTask(updatedTask);
  });
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
  wasMultiDay: boolean = false
): Promise<void> {
  // Handle frontmatter task property
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, frontmatter => {
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
  await processFileLine(app.vault, file, line, taskLine => {
    // Parse the task using our parser - may throw TaskValidationError
    const parsedTask = parseTask(taskLine);

    let updatedTask = cloneTask(parsedTask);

    // Handle conversion from non-all-day to all-day without end date
    if (isAllDay && !wasAllDay && !newEnd) {
      // Remove start date property
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);

      // Update end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(
        updatedTask,
        endDateProperty,
        formattedDate
      );
    }
    // Handle conversion from multi-day to single-day
    else if (wasMultiDay && !newEnd) {
      // Remove start date property
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);

      // Update end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(
        updatedTask,
        endDateProperty,
        formattedDate
      );
    }
    // Handle events with both start and end dates
    else if (newEnd) {
      // Update start date property
      const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(
        updatedTask,
        startDateProperty,
        formattedStartDate
      );

      // Update end date property
      const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
      updatedTask = setTaskProperty(
        updatedTask,
        endDateProperty,
        formattedEndDate
      );
    }
    // Handle single-date events
    else {
      // Update only end date property
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(
        updatedTask,
        endDateProperty,
        formattedDate
      );
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
  newText: string
): Promise<string | undefined> {
  // Handle frontmatter task property
  if (line === undefined) {
    return await renameFile(app, file, newText.trim());
  }

  // Handle regular inline task
  const result = await processFileLine(app.vault, file, line, taskLine => {
    // Parse the task to extract components - may throw TaskValidationError
    const parsedTask = parseTask(taskLine);

    // Check for potential issues that would make editing unsafe
    const issues = detectTaskIssues(parsedTask, taskLine);

    // Safety check: Reject if the task has multiple content fragments
    if (issues.hasSplitContent) {
      const fragmentsText = issues.contentFragments
        .map((f: { text: string }) => `"${f.text}"`)
        .join(', ');
      throw new TaskValidationError(
        `Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file.`
      );
    }

    // Safety check: Reject if the new text contains embedded tags
    if (hasEmbeddedTags(newText)) {
      throw new TaskValidationError(
        "The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags."
      );
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
        throw new TaskValidationError(
          `Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${parsedTask.content.trim()}".`
        );
      }
    } else if (contentMatch) {
      // Direct match, simply update the content
      updatedTask.content = newText.trim();
    } else {
      // Partial match - update only the matching part
      updatedTask.content = parsedTask.content.replace(
        originalText.trim(),
        newText.trim()
      );
    }

    // Reconstruct and return the updated task line
    return reconstructTask(updatedTask);
  });

  return result.changed ? file.path : undefined;
}
