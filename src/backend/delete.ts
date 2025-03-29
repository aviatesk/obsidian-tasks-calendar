import { App, TFile } from "obsidian";
import { processFileLine } from "./file-operations";
import { TaskValidationError } from "./error-handling";

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
