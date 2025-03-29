import { App, TFile } from "obsidian";
import { processFileLine, processFileLines } from "./file-operations";
import { TaskValidationError } from "./error-handling";
import { DateTime } from "luxon";
import { tryParseTask } from "./parse";
import { getRecurrenceId, isRecurrenceChild, isRecurrenceParent } from "./recurrence";

/**
 * Process file property recurrence tasks
 */
async function processFilePropertyRecurrenceTasks(
  app: App,
  file: TFile,
  recurrenceId: string,
  processor: (file: TFile, isParent: boolean) => Promise<void>
): Promise<boolean> {
  const recurrenceFiles = getRecurrenceFiles(app, recurrenceId);

  for (const recurrenceFile of recurrenceFiles) {
    const isParent = recurrenceFile.path === file.path;
    await processor(recurrenceFile, isParent);
  }

  return recurrenceFiles.length > 0;
}

/**
 * Deletes all tasks in a recurrence group
 * @param app Obsidian app instance
 * @param file Target file containing the tasks which is the parent of the recurrence group
 * @param recurrenceId Recurrence ID to delete
 * @returns Promise resolving to true if the operation was successful
 */
export async function deleteRecurrenceGroup(
  app: App,
  file: TFile,
  recurrenceId: string,
  dateProperty: string,
  startDateProperty: string,
): Promise<boolean> {
  // For file-based tasks with recurrence_id in frontmatter, delete all related files
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    return processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile, isParent) => {
        if (isParent) {
          // For the parent file, just remove the recurrence properties
          await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
            if (!(frontmatter['recurrence_id'] === recurrenceId))
              throw new TaskValidationError("File should be the parent of the recurrence group");
            delete frontmatter['recurrence'];
            delete frontmatter['recurrence_id'];
            delete frontmatter['status'];
            delete frontmatter[dateProperty];
            delete frontmatter[startDateProperty];
            delete frontmatter['taskText'];
          });
        } else {
          // For child files, trash them
          await app.vault.trash(recurrenceFile, true);
        }
      }
    );
  } else {
    const result = await processFileLines(app.vault, file, (line) => {
      const task = tryParseTask(line);
      if (task) {
        const taskRecurrenceId = getRecurrenceId(task);
        if (taskRecurrenceId === recurrenceId) {
          if (isRecurrenceParent(task) || isRecurrenceChild(task)) {
            // Remove the line
            return { process: true };
          }
        }
      }
      // Keep the line
      return { process: false };
    });

    return result.changed;
  }
}

/**
 * Deletes tasks in a recurrence group after a specific date
 * @param app Obsidian app instance
 * @param file Target file containing the tasks which is the parent of the recurrence group
 * @param recurrenceId Recurrence ID to delete
 * @param afterDate Date after which tasks should be deleted
 * @param dateProperty Date property to check against
 * @param startDateProperty Optional start date property to check against (required if this task has both start and end dates)
 * @returns Promise resolving to true if the operation was successful
 * @throws TaskValidationError if task validation fails
 * @throws FileOperationError if file operation fails
 */
export async function deleteRecurrenceTasksAfter(
  app: App,
  file: TFile,
  recurrenceId: string,
  afterDate: DateTime,
  dateProperty: string,
  startDateProperty?: string,
): Promise<boolean> {
  // For file-based tasks with recurrence_id in frontmatter
  const isFilePropertyTask = hasRecurrenceIdInFrontmatter(app, file, recurrenceId);

  if (isFilePropertyTask) {
    let changed = false;

    await processFilePropertyRecurrenceTasks(
      app,
      file,
      recurrenceId,
      async (recurrenceFile, isParent) => {
        const metadataCache = app.metadataCache.getFileCache(recurrenceFile);
        if (!metadataCache || !metadataCache.frontmatter) return;

        const dateValue = metadataCache.frontmatter[startDateProperty ? startDateProperty : dateProperty];
        if (!dateValue) return;

        const date = DateTime.fromISO(dateValue);
        if (date > afterDate) {
          if (isParent) {
            // Remove properties from parent
            await app.fileManager.processFrontMatter(recurrenceFile, (frontmatter) => {
              delete frontmatter['status'];
              delete frontmatter['recurrence'];
              delete frontmatter['recurrence_id'];
              delete frontmatter[dateProperty];
              startDateProperty && delete frontmatter[startDateProperty];
              delete frontmatter['taskText'];
            });
          } else {
            // Trash child files
            await app.vault.trash(recurrenceFile, true);
          }
          changed = true;
        }
      }
    );

    return changed;
  }

  // Original implementation for list format tasks
  let foundParent = false;

  const result = await processFileLines(app.vault, file, (line) => {
    const task = tryParseTask(line);
    if (task) {
      const taskRecurrenceId = getRecurrenceId(task);
      if (taskRecurrenceId === recurrenceId) {
        if (isRecurrenceParent(task)) {
          foundParent = true;
        }

        // Get the task date
        const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                        task.propertiesBeforeContent.get(dateProperty);
        if (taskDate) {
          const date = DateTime.fromISO(taskDate);
          if (date > afterDate) {
            // Remove the line
            return { process: true };
          }
        }
      }
    }

    // Keep the line
    return { process: false };
  });

  if (result.changed && foundParent) {
    // Update frontmatter if this is a file property task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        const taskDate = frontmatter[dateProperty];
        if (taskDate) {
          const date = DateTime.fromISO(taskDate);
          if (date > afterDate) {
            delete frontmatter['status'];
            delete frontmatter['recurrence'];
            delete frontmatter['recurrence_id'];
            dateProperty && delete frontmatter[dateProperty];
            startDateProperty && delete frontmatter[startDateProperty];
          }
        }
      }
    });
  }

  return result.changed;
}

/**
 * Check if a file has a specific recurrence ID in its frontmatter
 */
function hasRecurrenceIdInFrontmatter(app: App, file: TFile, recurrenceId: string) {
  const metadataCache = app.metadataCache.getFileCache(file);
  return metadataCache && metadataCache.frontmatter && metadataCache.frontmatter['recurrence_id'] === recurrenceId
}

/**
 * Get all files with a specific recurrence ID in their frontmatter
 */
function getRecurrenceFiles(app: App, recurrenceId: string) {
  return app.vault.getMarkdownFiles().filter((file) => hasRecurrenceIdInFrontmatter(app, file, recurrenceId));
}

/**
 * Deletes a task from a file at the specified line or removes file properties
 *
 * @param app Obsidian app instance (required for file property tasks)
 * @param file Target file containing the task
 * @param line Line number of the task to delete (undefined for file property tasks)
 * @param dateProperty Date property to check against
 * @param startDateProperty Start date property to check against
 * @returns Promise resolving to true if the operation was successful
 * @throws FileOperationError if file operation fails
 */
export async function deleteTask(
  app: App,
  file: TFile,
  dateProperty: string,
  startDateProperty: string,
  line?: number,
): Promise<boolean> {
  // For file property tasks, we clear task-related properties
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      delete frontmatter['status'];
      dateProperty && delete frontmatter[dateProperty];
      startDateProperty && delete frontmatter[startDateProperty];
    });
    return true;
  } else {
    // For regular markdown tasks
    if (line < 0) {
      throw new TaskValidationError("Valid line number must be specified");
    }

    // Process the file to remove the task line
    const result = await processFileLine(app.vault, file, line, () => {
      // Return an empty string to remove the line
      return "";
    });

    return result.changed;
  }
}
