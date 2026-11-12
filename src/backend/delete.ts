import { App, TFile } from 'obsidian';
import { processTaskBlock } from './file-operations';
import { TaskValidationError } from './error-handling';
import { getQuoteDepth } from './task-block';
import { assertTaskLineMatches } from './task-line-check';

/**
 * Deletes a task from a file at the specified line or removes file properties.
 * A task written in a list is deleted together with its body.
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
  line: number | undefined,
  expectedTaskText: string,
  dateProperty?: string,
  startDateProperty?: string
): Promise<boolean> {
  // For file property tasks, we clear task-related properties
  if (line === undefined) {
    await app.fileManager.processFrontMatter(file, frontmatter => {
      delete frontmatter['status'];
      if (dateProperty) {
        delete frontmatter[dateProperty];
      }
      if (startDateProperty) {
        delete frontmatter[startDateProperty];
      }
    });
    return true;
  } else {
    // For regular markdown tasks
    if (line < 0) {
      throw new TaskValidationError('Valid line number must be specified');
    }

    // An empty line would split the surrounding blockquote or callout in two,
    // so a task inside of one is removed without leaving a line behind
    const result = await processTaskBlock(app.vault, file, line, taskLine => {
      assertTaskLineMatches(taskLine, expectedTaskText);
      return getQuoteDepth(taskLine) > 0 ? [] : [''];
    });

    return result.changed;
  }
}
