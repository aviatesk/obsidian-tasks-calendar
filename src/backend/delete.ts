import { App, TFile } from "obsidian";
import { processFileLine } from "./file-operations";
import { TaskValidationError } from "./error-handling";
import { DateTime } from "luxon";
import { parseTask } from "./parse";
import { getRecurrenceId, isRecurrenceChild, isRecurrenceParent } from "./recurrence";

/**
 * Deletes all tasks in a recurrence group
 */
export async function deleteRecurrenceGroup(
  app: App,
  file: TFile,
  recurrenceId: string,
  dateProperty?: string,
  startDateProperty?: string,
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let skipNextLines = false;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipNextLines) {
      // Check if this line is still part of the recurrence group (indented)
      if (line.startsWith('    ')) {
        continue;
      }
      skipNextLines = false;
    }

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId) {
        if (isRecurrenceParent(task)) {
          // Skip this line and all indented lines that follow
          skipNextLines = true;
          changed = true;
          continue;
        } else if (isRecurrenceChild(task)) {
          // Skip this line
          changed = true;
          continue;
        }
      }
    } catch (error) {
      // Not a task line, include it
    }

    newContent += line + '\n';
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Also clean up frontmatter if this is a file property task
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (frontmatter['recurrence_id'] === recurrenceId) {
        delete frontmatter['status'];
        delete frontmatter['recurrence'];
        delete frontmatter['recurrence_id'];
        dateProperty && delete frontmatter[dateProperty];
        startDateProperty && delete frontmatter[startDateProperty];
      }
    });
  }

  return changed;
}

/**
 * Deletes tasks in a recurrence group after a specific date
 */
export async function deleteRecurrenceTasksAfter(
  app: App,
  file: TFile,
  recurrenceId: string,
  afterDate: DateTime,
  dateProperty: string,
  startDateProperty?: string,
): Promise<boolean> {
  const content = await app.vault.read(file);
  const lines = content.split('\n');
  let newContent = '';
  let skipNextLines = false;
  let changed = false;
  let foundParent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let includeLine = true;

    if (skipNextLines && line.startsWith('    ')) {
      try {
        const task = parseTask(line);
        const taskRecurrenceId = getRecurrenceId(task);

        if (taskRecurrenceId === recurrenceId) {
          // Get the task date
          const taskDate = task.propertiesAfterContent.get(dateProperty) ||
                         task.propertiesBeforeContent.get(dateProperty);
          if (taskDate) {
            const date = DateTime.fromISO(taskDate);
            if (date > afterDate) {
              includeLine = false;
              changed = true;
            }
          }
        }
      } catch (error) {
        // Not a task line or invalid date, include it
      }
    } else {
      skipNextLines = false;
    }

    try {
      const task = parseTask(line);
      const taskRecurrenceId = getRecurrenceId(task);

      if (taskRecurrenceId === recurrenceId && isRecurrenceParent(task)) {
        foundParent = true;
        skipNextLines = true;
      }
    } catch (error) {
      // Not a task line, include it
    }

    if (includeLine) {
      newContent += line + '\n';
    }
  }

  if (changed) {
    await app.vault.modify(file, newContent.trimEnd() + '\n');

    // Update frontmatter if this is a file property task
    if (foundParent) {
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
  }

  return changed;
}

/**
 * Deletes a task from a file at the specified line or removes file properties
 *
 * @param vault Obsidian vault instance
 * @param file Target file containing the task
 * @param line Line number of the task to delete (undefined for file property tasks)
 * @param app Obsidian app instance (required for file property tasks)
 * @returns Promise resolving to true if the operation was successful
 * @throws FileOperationError if file operation fails
 */
export async function deleteTask(
  app: App,
  file: TFile,
  line?: number,
  dateProperty?: string,
  startDateProperty?: string,
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
