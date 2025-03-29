import { App, TFile } from "obsidian";
import {
  ParsedTask,
  parseTask,
  reconstructTask,
  hasEmbeddedTags,
  setTaskProperty,
  removeTaskProperty,
  detectTaskIssues,
  cloneTask
} from "./parse";
import { getCurrentDateFormatted, formatDateForTask } from "./date";
import { processFileLine, renameFile, processRecurrenceGroup } from "./file-operations";
import { STATUS_OPTIONS } from "./status";
import { TaskValidationError } from "./error-handling";
import { DateTime } from "luxon";
import {
  isRecurrenceChild,
  RecurrenceRule,
  formatRecurrenceRule,
  generateRecurrenceDates
} from "./recurrence";
import { sanitizeFilename } from "./create";

/**
 * Helper function to update task status
 */
function updateTaskStatusHelper(task: ParsedTask, newStatus: string): any {
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
    const currentDate = getCurrentDateFormatted();
    updatedTask = setTaskProperty(updatedTask, newProp, currentDate);
  }

  return updatedTask;
}

/**
 * Updates status related properties in frontmatter
 */
function updateFrontmatterStatus(frontmatter: any, newStatus: string): void {
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

/**
 * Updates dates in frontmatter based on various conditions
 */
function updateFrontmatterDates(
  frontmatter: any,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
): void {
  if (newEnd) {
    frontmatter[startDateProperty] = formatDateForTask(newStart, isAllDay, false);
    frontmatter[dateProperty] = formatDateForTask(newEnd, isAllDay, true);
  } else {
    delete frontmatter[startDateProperty];
    frontmatter[dateProperty] = formatDateForTask(newStart, isAllDay, false);
  }
}

/**
 * Updates child task dates in frontmatter
 */
function updateChildFrontmatterDates(
  frontmatter: any,
  date: DateTime,
  startDateTime: DateTime,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
): void {
  if (newEnd) {
    const duration = DateTime.fromJSDate(newEnd).diff(startDateTime);
    const childEndDate = date.plus(duration);

    const formattedStartDate = formatDateForTask(date.toJSDate(), isAllDay, false);
    frontmatter[startDateProperty] = formattedStartDate;

    const formattedEndDate = formatDateForTask(childEndDate.toJSDate(), isAllDay, true);
    frontmatter[dateProperty] = formattedEndDate;
  } else {
    const formattedDate = formatDateForTask(date.toJSDate(), isAllDay, false);
    delete frontmatter[startDateProperty];
    frontmatter[dateProperty] = formattedDate;
  }
}

/**
 * Process file property recurrence tasks
 */
async function processFilePropertyRecurrenceTasks(
  app: App,
  file: TFile,
  recurrenceId: string,
  processor: (file: TFile, index: number, isParent: boolean) => Promise<void>
): Promise<boolean> {
  // Get all files with this recurrence ID
  const recurrenceFiles = getRecurrenceFiles(app, recurrenceId);

  // Sort files to ensure parent is first, then children in order
  recurrenceFiles.sort((a, b) => {
    // Parent file should come first
    if (a.path === file.path) return -1;
    if (b.path === file.path) return 1;

    // Sort by filename for consistent ordering
    return a.basename.localeCompare(b.basename);
  });

  // Process each file
  for (let i = 0; i < recurrenceFiles.length; i++) {
    const isParent = recurrenceFiles[i].path === file.path;
    await processor(recurrenceFiles[i], i, isParent);
  }

  return recurrenceFiles.length > 0;
}

/**
 * Updates all tasks in a recurrence group with new status
 */
export async function updateRecurrenceGroupStatus(
  app: App,
  file: TFile,
  recurrenceId: string,
  newStatus: string
): Promise<boolean> {
  // First check if this is a file property task
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    return processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile) => {
        await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
          updateFrontmatterStatus(frontmatter, newStatus);
        });
      }
    );
  }

  // For regular list-format tasks, use the existing implementation
  return (await processRecurrenceGroup(
    app.vault,
    file,
    recurrenceId,
    (task) => {
      return {
        updatedTask: updateTaskStatusHelper(task, newStatus),
        shouldProcess: true
      };
    }
  )).changed;
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
  // First check if this is a file property task
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    let changed = false;

    await processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile) => {
        await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
          const taskDate = frontmatter[dateProperty];
          if (taskDate) {
            const date = DateTime.fromISO(taskDate);
            if (date > afterDate) {
              updateFrontmatterStatus(frontmatter, newStatus);
              changed = true;
            }
          }
        });
      }
    );

    return changed;
  }

  // For regular list-format tasks, use the existing implementation
  const result = await processRecurrenceGroup(
    app.vault,
    file,
    recurrenceId,
    (task) => {
      const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                      task.propertiesBeforeContent.get(dateProperty);

      if (taskDate) {
        const date = DateTime.fromISO(taskDate);
        if (date > afterDate) {
          return {
            updatedTask: updateTaskStatusHelper(task, newStatus),
            shouldProcess: true
          };
        }
      }

      return { shouldProcess: false };
    },
  )
  return result.changed;
}

/**
 * Helper function to update task dates in a recurrence group
 */
function updateTaskDatesHelper(
  task: ParsedTask,
  isParent: boolean,
  date: DateTime,
  newStart: Date,
  newEnd: Date | null,
  isAllDay: boolean,
  startDateProperty: string,
  dateProperty: string
): ParsedTask {
  let updatedTask = cloneTask(task);

  if (isParent) {
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
  } else {
    if (newEnd) {
      const startDateTime = DateTime.fromJSDate(newStart);
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
  }

  return updatedTask;
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
  // First check if this is a file property task
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    // Generate recurrence dates
    const startDateTime = DateTime.fromJSDate(newStart);
    const dates = generateRecurrenceDates(startDateTime, newRule);

    return processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile, index, isParent) => {
        await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
          if (isParent) {
            // This is the parent task
            frontmatter['recurrence'] = formatRecurrenceRule(newRule);
            updateFrontmatterDates(frontmatter, newStart, newEnd, isAllDay, startDateProperty, dateProperty);
          } else if (index - 1 < dates.length) {
            // This is a child task
            const date = dates[index - 1];
            updateChildFrontmatterDates(
              frontmatter,
              date,
              startDateTime,
              newEnd,
              isAllDay,
              startDateProperty,
              dateProperty
            );
          }
        });
      }
    );
  }

  // For regular list-format tasks, use the existing implementation
  const startDateTime = DateTime.fromJSDate(newStart);
  const dates = generateRecurrenceDates(startDateTime, newRule);
  let dateIndex = 0;

  const result = await processRecurrenceGroup(
    app.vault,
    file,
    recurrenceId,
    (task, isParent) => {
      if (isParent) {
        let updatedTask = cloneTask(task);
        updatedTask = setTaskProperty(updatedTask, 'recurrence', formatRecurrenceRule(newRule));
        updatedTask = updateTaskDatesHelper(
          updatedTask,
          true,
          startDateTime,
          newStart,
          newEnd,
          isAllDay,
          startDateProperty,
          dateProperty
        );
        return { updatedTask, shouldProcess: true };
      } else if (isRecurrenceChild(task) && dateIndex < dates.length) {
        const updatedTask = updateTaskDatesHelper(
          task,
          false,
          dates[dateIndex],
          newStart,
          newEnd,
          isAllDay,
          startDateProperty,
          dateProperty
        );
        dateIndex++;
        return { updatedTask, shouldProcess: true };
      }
      return { shouldProcess: false };
    }
  )
  return result.changed;
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
  // First check if this is a file property task
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    // Generate recurrence dates
    const dates = generateRecurrenceDates(afterDate, newRule);
    let dateIndex = 0;
    let changed = false;

    // Update the recurrence rule in the parent task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        frontmatter['recurrence'] = formatRecurrenceRule(newRule);
        changed = true;
      }
    });

    // Get all files with this recurrence ID except the parent
    const recurrenceFiles = getRecurrenceFiles(app, recurrenceId)
      .filter(f => f.path !== file.path);

    // Process each child file
    for (const recurrenceFile of recurrenceFiles) {
      const metadataCache = app.metadataCache.getFileCache(recurrenceFile);
      if (!metadataCache || !metadataCache.frontmatter) continue;

      const taskDate = metadataCache.frontmatter[dateProperty];
      if (!taskDate) continue;

      const date = DateTime.fromISO(taskDate);
      if (date > afterDate && dateIndex < dates.length) {
        await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
          const startDateTime = DateTime.fromJSDate(newStart);
          updateChildFrontmatterDates(
            frontmatter,
            dates[dateIndex],
            startDateTime,
            newEnd,
            isAllDay,
            startDateProperty,
            dateProperty
          );
        });

        dateIndex++;
        changed = true;
      }
    }

    return changed;
  }

  // For regular list-format tasks, use the existing implementation
  const dates = generateRecurrenceDates(afterDate, newRule);
  let dateIndex = 0;

  const result = await processRecurrenceGroup(
    app.vault,
    file,
    recurrenceId,
    (task, isParent) => {
      if (isParent) {
        let updatedTask = cloneTask(task);
        updatedTask = setTaskProperty(updatedTask, 'recurrence', formatRecurrenceRule(newRule));
        return { updatedTask, shouldProcess: true };
      } else if (isRecurrenceChild(task)) {
        const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                        task.propertiesBeforeContent.get(dateProperty);

        if (taskDate) {
          const date = DateTime.fromISO(taskDate);
          if (date > afterDate && dateIndex < dates.length) {
            const updatedTask = updateTaskDatesHelper(
              task,
              false,
              dates[dateIndex],
              newStart,
              newEnd,
              isAllDay,
              startDateProperty,
              dateProperty
            );
            dateIndex++;
            return { updatedTask, shouldProcess: true };
          }
        }
      }
      return { shouldProcess: false };
    },
  )
  return result.changed;
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
  // First check if this is a file property task
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    const sanitizedNewText = sanitizeFilename(newText.trim());
    const parentPath = file.parent ? file.parent.path + '/' : '';

    return processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile, index) => {
        // Update frontmatter
        await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
          frontmatter['taskText'] = newText.trim();
        });

        // Rename files based on index
        const newFileName = index === 0
          ? `${sanitizedNewText}.${recurrenceFile.extension}`
          : `${sanitizedNewText}_${index}.${recurrenceFile.extension}`;

        const newPath = `${parentPath}${newFileName}`;

        // Only rename if path is different
        if (recurrenceFile.path !== newPath) {
          await app.fileManager.renameFile(recurrenceFile, newPath);
        }
      }
    );
  }

  // For regular list-format tasks, use the existing implementation
  const result = await processRecurrenceGroup(
    app.vault,
    file,
    recurrenceId,
    (task, isParent) => {
      const issues = detectTaskIssues(task, '');
      if (issues.hasSplitContent) {
        const fragmentsText = issues.contentFragments.map(f => `"${f.text}"`).join(", ");
        throw new TaskValidationError(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file.`);
      }

      if (hasEmbeddedTags(newText)) {
        throw new TaskValidationError("The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
      }

      let updatedTask = cloneTask(task);

      if (isParent) {
        // For parent tasks, always update the text
        updatedTask.content = newText.trim();
        return { updatedTask, shouldProcess: true };
      } else {
        // For child tasks, only update if it had its own text and wasn't inheriting
        if (task.content && task.content.trim() === originalText.trim()) {
          updatedTask.content = newText.trim();
          return { updatedTask, shouldProcess: true };
        } else if (task.content && task.content.trim() !== '') {
          // If child has custom text (not matching parent), leave it unchanged
          return { shouldProcess: false };
        } else {
          // If child was empty (inheriting), leave it empty
          return { shouldProcess: false };
        }
      }
    }
  );
  return result.changed;
}

/**
 * Check if a file has a specific recurrence ID in its frontmatter
 */
function hasRecurrenceIdInFrontmatter(app: App, file: TFile, recurrenceId: string) {
  const metadataCache = app.metadataCache.getFileCache(file);
  return metadataCache && metadataCache.frontmatter && metadataCache.frontmatter['recurrence_id'] === recurrenceId;
}

/**
 * Get all files with a specific recurrence ID in their frontmatter
 */
function getRecurrenceFiles(app: App, recurrenceId: string) {
  return app.vault.getMarkdownFiles().filter((file) => hasRecurrenceIdInFrontmatter(app, file, recurrenceId));
}

/**
 * Update task status in Obsidian document
 */
export async function updateTaskStatus(
  app: App,
  file: TFile,
  line: number | undefined,
  newStatus: string
): Promise<void> {
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      const currentStatus = frontmatter.status || '';
      const oldStatusOption = STATUS_OPTIONS.find(option => option.value === currentStatus);
      const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

      const oldProp = oldStatusOption?.prop;
      const newProp = newStatusOption?.prop;

      frontmatter.status = newStatus;

      if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
        delete frontmatter[oldProp];
      }

      if (newProp) {
        const currentDate = getCurrentDateFormatted();
        frontmatter[newProp] = currentDate;
      }
    });
  } else {
    await processFileLine(app.vault, file, line, (taskLine) => {
      const parsedTask = parseTask(taskLine);
      return reconstructTask(updateTaskStatusHelper(parsedTask, newStatus));
    });
  }
}

/**
 * Updates task dates in a file
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
  const updateDatesLogic = (task: ParsedTask) => {
    let updatedTask = cloneTask(task);

    if (isAllDay && !wasAllDay && !newEnd) {
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    } else if (wasMultiDay && !newEnd) {
      updatedTask = removeTaskProperty(updatedTask, startDateProperty);
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    } else if (newEnd) {
      const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, startDateProperty, formattedStartDate);
      const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedEndDate);
    } else {
      const formattedDate = formatDateForTask(newStart, isAllDay, false);
      updatedTask = setTaskProperty(updatedTask, endDateProperty, formattedDate);
    }

    return updatedTask;
  };

  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (isAllDay && !wasAllDay && !newEnd) {
        delete frontmatter[startDateProperty];
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      } else if (wasMultiDay && !newEnd) {
        delete frontmatter[startDateProperty];
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      } else if (newEnd) {
        const formattedStartDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[startDateProperty] = formattedStartDate;
        const formattedEndDate = formatDateForTask(newEnd, isAllDay, true);
        frontmatter[endDateProperty] = formattedEndDate;
      } else {
        const formattedDate = formatDateForTask(newStart, isAllDay, false);
        frontmatter[endDateProperty] = formattedDate;
      }
    });
  } else {
    await processFileLine(app.vault, file, line, (taskLine) => {
      const parsedTask = parseTask(taskLine);
      const updatedTask = updateDatesLogic(parsedTask);
      return reconstructTask(updatedTask);
    });
  }
}

/**
 * Updates the text of a task in a file
 */
export async function updateTaskText(
  app: App,
  file: TFile,
  line: number | undefined,
  originalText: string,
  newText: string,
): Promise<string|undefined> {
  if (line === undefined) {
    return await renameFile(app, file, newText.trim());
  }

  const result = await processFileLine(app.vault, file, line, (taskLine) => {
    const parsedTask = parseTask(taskLine);

    const issues = detectTaskIssues(parsedTask, taskLine);
    if (issues.hasSplitContent) {
      const fragmentsText = issues.contentFragments.map((f: {text: string}) => `"${f.text}"`).join(", ");
      throw new TaskValidationError(`Task has content in multiple places (${fragmentsText}). Please edit the task directly in the file.`);
    }

    if (hasEmbeddedTags(newText)) {
      throw new TaskValidationError("The new text contains text attached to tags (e.g., 'text#tag'). Please add spaces between text and tags.");
    }

    let updatedTask = cloneTask(parsedTask);
    const contentMatch = parsedTask.content.trim() === originalText.trim();
    const contentIncludes = parsedTask.content.includes(originalText.trim());

    if (!contentMatch && !contentIncludes) {
      if (parsedTask.content.length === 0 && originalText.trim(). length === 0) {
        updatedTask.content = newText.trim();
      } else {
        throw new TaskValidationError(`Cannot safely update: The original text "${originalText.trim()}" doesn't match the task's content "${parsedTask.content.trim()}".`);
      }
    } else if (contentMatch) {
      updatedTask.content = newText.trim();
    } else {
      updatedTask.content = parsedTask.content.replace(originalText.trim(), newText.trim());
    }

    return reconstructTask(updatedTask);
  });

  return result.changed ? file.path : undefined;
}
